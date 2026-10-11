import yts from "yt-search";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execFile } from "child_process";
import { createDecipheriv } from "crypto";
import { Innertube, UniversalCache } from "youtubei.js";
import ytdlp from "youtube-dl-exec";
import config from "../config.js";

import { Module } from "../lib/plugins.js";
import {
    makeLegacyMessage,
    runLegacyContext,
    getDatabase as getLegacyDatabase,
    withLegacySocket
} from "../lib/miku-legacy.js";

/* -------------------------------------------------------------------------- */
/* CONFIG                                                                     */
/* -------------------------------------------------------------------------- */

const pluginConfig = {
    name: "video",
    alias: [
        "ytvideo",
        "ytmp4",
        "youtubevideo"
    ],
    category: "search",
    description: "Download YouTube video and send it to WhatsApp.",
    usage: ".video <YouTube URL / search query>",
    example: ".video Alan Walker Faded",
    isOwner: false,
    isPremium: false,
    isGroup: false,
    isPrivate: false,
    isAdmin: false,
    isBotAdmin: false,
    cooldown: 10,
    energi: 3,
    isEnabled: true
};

/* -------------------------------------------------------------------------- */
/* TEMP DIRECTORY                                                             */
/* -------------------------------------------------------------------------- */

const TEMP_DIR = path.join(
    process.cwd(),
    "temp",
    "youtube-video"
);

function ensureTempDir() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, {
            recursive: true
        });
    }
}

/* -------------------------------------------------------------------------- */
/* ARGUMENT HANDLER                                                           */
/* -------------------------------------------------------------------------- */

function getQuery(m, text = "") {
    if (
        typeof text === "string" &&
        text.trim()
    ) {
        return text.trim();
    }

    if (
        Array.isArray(m?.args) &&
        m.args.length
    ) {
        return m.args
            .map(v => String(v || "").trim())
            .filter(Boolean)
            .join(" ")
            .trim();
    }

    if (
        typeof m?.args === "string" &&
        m.args.trim()
    ) {
        return m.args.trim();
    }

    if (
        typeof m?.text === "string" &&
        m.text.trim()
    ) {
        return m.text.trim();
    }

    return "";
}

/* -------------------------------------------------------------------------- */
/* YOUTUBE URL CHECK                                                          */
/* -------------------------------------------------------------------------- */

function isYouTubeUrl(text) {
    if (!text) return false;

    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(
        text.trim()
    );
}

/* -------------------------------------------------------------------------- */
/* SEARCH YOUTUBE                                                             */
/* -------------------------------------------------------------------------- */

async function searchYouTube(query) {
    const result = await yts(query);

    if (
        !result ||
        !Array.isArray(result.videos) ||
        !result.videos.length
    ) {
        return null;
    }

    return result.videos[0];
}

/* -------------------------------------------------------------------------- */
/* RUN COMMAND                                                                */
/* -------------------------------------------------------------------------- */

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            command,
            args,
            {
                windowsHide: true,
                ...options
            }
        );

        let stdout = "";
        let stderr = "";

        child.stdout?.on(
            "data",
            data => {
                stdout += data.toString();
            }
        );

        child.stderr?.on(
            "data",
            data => {
                stderr += data.toString();
            }
        );

        child.on(
            "error",
            error => {
                reject(error);
            }
        );

        child.on(
            "close",
            code => {
                if (code === 0) {
                    resolve({
                        stdout,
                        stderr,
                        code
                    });
                } else {
                    const error = new Error(
                        stderr ||
                        `Command exited with code ${code}`
                    );

                    error.code = code;
                    error.stdout = stdout;
                    error.stderr = stderr;

                    reject(error);
                }
            }
        );
    });
}

/* -------------------------------------------------------------------------- */
/* CHECK YT-DLP                                                               */
/* -------------------------------------------------------------------------- */

async function checkYtDlp() {
    /*
     * The Docker image has no global `yt-dlp` binary. song.js works because it
     * uses the `youtube-dl-exec` npm package (it bundles yt-dlp), so the video
     * command now uses the very same engine.
     */
    return "youtube-dl-exec";
}

/* Optional cookies (same env vars as song.js):
 * YT_COOKIES_FILE=/path/cookies.txt  or  YT_COOKIES="<netscape cookies text>" */
function getCookiesFile() {
    try {
        if (process.env.YT_COOKIES_FILE && fs.existsSync(process.env.YT_COOKIES_FILE)) {
            return process.env.YT_COOKIES_FILE;
        }
        if (process.env.YT_COOKIES) {
            const p = path.join(os.tmpdir(), "yt_cookies.txt");
            fs.writeFileSync(p, process.env.YT_COOKIES.replace(/\\n/g, "\n"));
            return p;
        }
    } catch {}
    return null;
}

function findDeno() {
    for (const p of ["/usr/local/bin/deno", "/usr/bin/deno"]) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

let _ffmpegPath;
async function getFfmpeg() {
    if (_ffmpegPath !== undefined) return _ffmpegPath;
    for (const c of [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean)) {
        const ok = await new Promise(resolve =>
            execFile(c, ["-version"], { timeout: 5000 }, err => resolve(!err))
        );
        if (ok) return (_ffmpegPath = c);
    }
    for (const pkg of ["@ffmpeg-installer/ffmpeg", "ffmpeg-static"]) {
        try {
            const mod = await import(pkg);
            const p = mod?.default?.path || mod?.path ||
                (typeof mod?.default === "string" ? mod.default : null);
            if (p && fs.existsSync(p)) return (_ffmpegPath = p);
        } catch {}
    }
    return (_ffmpegPath = null);
}

/*
 * Different yt-dlp "profiles": if YouTube blocks/breaks one client,
 * the next one is tried automatically. Order matters — cheapest /
 * most-likely-to-work first, more exotic fallbacks last.
 *
 * NOTE: `jsRuntimes` / `remoteComponents` are only understood by very
 * recent yt-dlp builds that support external JS (deno) for nsig/EJS
 * solving. If the bundled yt-dlp in youtube-dl-exec is older, passing
 * these flags makes that attempt fail immediately (harmless here since
 * we fall through to the next profile, but it wastes a whole timeout
 * cycle on every single download). We only add that profile when deno
 * is actually present AND we put it last, so the cheap/common profiles
 * are tried first.
 */
function getProfiles() {
    const profiles = [
        {}, // default client, works most of the time
        { extractorArgs: "youtube:player_client=android" },
        { extractorArgs: "youtube:player_client=android_vr,web_safari" },
        { extractorArgs: "youtube:player_client=ios" },
        { extractorArgs: "youtube:player_client=tv_embedded" },
        { extractorArgs: "youtube:player_client=mweb" },
        { extractorArgs: "youtube:player_client=web" }
    ];

    const deno = findDeno();
    if (deno) {
        profiles.push({
            jsRuntimes: { deno },
            remoteComponents: "ejs:github"
        });
    }

    return profiles;
}

const YT_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* Collects the last error string from every failed profile attempt so we
 * can show the user (and log) something more useful than "unavailable". */
function formatAttemptErrors(attempts) {
    return attempts
        .map(a => `• ${a.profile}: ${String(a.error).slice(0, 160)}`)
        .join("\n");
}

async function getYtDlpInfo(url) {
    const cookies = getCookiesFile();
    const attempts = [];

    for (const profile of getProfiles()) {
        const label = profile.extractorArgs || (profile.jsRuntimes ? "deno/ejs" : "default");
        try {
            return await ytdlp(
                url,
                {
                    dumpSingleJson: true,
                    noPlaylist: true,
                    noWarnings: true,
                    skipDownload: true,
                    forceIpv4: true,
                    socketTimeout: 25,
                    retries: 3,
                    userAgent: YT_USER_AGENT,
                    ...(cookies ? { cookies } : {}),
                    ...profile
                },
                { timeout: 60000 }
            );
        } catch (e) {
            attempts.push({ profile: label, error: e?.stderr || e?.message || e });
            console.warn(`[video] info fetch failed [${label}]:`, String(e?.message || e).slice(0, 200));
        }
    }

    const err = new Error(
        `All yt-dlp info profiles failed.\n${formatAttemptErrors(attempts)}`
    );
    err.attempts = attempts;
    throw err;
}

/* -------------------------------------------------------------------------- */
/* DOWNLOAD VIDEO                                                             */
/* -------------------------------------------------------------------------- */

async function downloadVideo(
    ytUrl,
    outputBase,
    ytDlpCommand
) {
    /*
     * MP4 first.
     *
     * Prefer formats that already contain both
     * video and audio. This avoids unnecessary
     * ffmpeg merging whenever possible.
     */
    const outputTemplate =
        `${outputBase}.%(ext)s`;

    const ffmpeg = await getFfmpeg();
    const cookies = getCookiesFile();
    const attempts = [];
    let done = false;

    for (const profile of getProfiles()) {
        const label = profile.extractorArgs || (profile.jsRuntimes ? "deno/ejs" : "default");
        try {
            await ytdlp(
                ytUrl,
                {
                    noPlaylist: true,
                    noWarnings: true,
                    quiet: true,
                    forceIpv4: true,
                    retries: 3,
                    socketTimeout: 25,
                    restrictFilenames: true,
                    maxFilesize: "95M",
                    /* H.264 / AAC MP4 (plays in WhatsApp), max 720p */
                    format:
                        "bv*[height<=720][vcodec^=avc1]+ba[ext=m4a]/" +
                        "b[height<=720][ext=mp4]/" +
                        "bv*[height<=720]+ba/b[height<=720]/best",
                    mergeOutputFormat: "mp4",
                    output: outputTemplate,
                    userAgent: YT_USER_AGENT,
                    ...(ffmpeg && ffmpeg !== "ffmpeg" ? { ffmpegLocation: ffmpeg } : {}),
                    ...(cookies ? { cookies } : {}),
                    ...profile
                },
                { timeout: 300000 }
            );
            done = true;
            break;
        } catch (e) {
            attempts.push({ profile: label, error: e?.stderr || e?.message || e });
            console.warn(
                `[video] download failed [${label}]:`,
                String(e?.message || e).slice(0, 200)
            );
            /* remove partial files before the next attempt */
            try {
                for (const f of fs.readdirSync(TEMP_DIR)) {
                    if (f.startsWith(path.basename(outputBase))) {
                        fs.unlinkSync(path.join(TEMP_DIR, f));
                    }
                }
            } catch {}
        }
    }

    if (!done) {
        const err = new Error(
            `All yt-dlp download profiles failed.\n${formatAttemptErrors(attempts)}`
        );
        err.attempts = attempts;
        throw err;
    }

    const files = fs.readdirSync(
        TEMP_DIR
    );

    const matches = files
        .filter(file =>
            file.startsWith(
                path.basename(outputBase)
            )
        )
        .map(file =>
            path.join(
                TEMP_DIR,
                file
            )
        )
        .filter(file =>
            fs.statSync(file).isFile()
        );

    if (!matches.length) {
        throw new Error(
            "Downloaded video file was not found."
        );
    }

    /*
     * Prefer MP4.
     */
    const mp4 = matches.find(
        file =>
            path.extname(file).toLowerCase() ===
            ".mp4"
    );

    return mp4 || matches[0];
}

/* -------------------------------------------------------------------------- */
/* FAST DOWNLOAD SOURCES (work on Railway when yt-dlp is blocked)             */
/* -------------------------------------------------------------------------- */
/*
 * FIX: On Railway (datacenter IP) YouTube blocks yt-dlp for EVERY profile
 * ("All yt-dlp download profiles failed"). .song works because it first
 * uses public converter APIs / SaveTube / YouTube.js / Piped. The video
 * command now uses the SAME approach first and yt-dlp only as last resort.
 */

const MAX_VIDEO_BYTES = 95 * 1024 * 1024;
const MIN_VIDEO_BYTES = 50 * 1024;
const enc = encodeURIComponent;

const SAVETUBE_HEADERS = {
    "Content-Type": "application/json",
    Origin: "https://yt.savetube.me",
    "User-Agent":
        "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"
};
const SAVETUBE_KEY = Buffer.from("C5D58EF67A7584E4A29F6C35BBC4EB12", "hex");

const VIDEO_APIS = [
    { name: "eliteprotech", url: u => `https://eliteprotech-apis.zone.id/ytdown?url=${enc(u)}&format=mp4` },
    { name: "yupra", url: u => `https://api.yupra.my.id/api/downloader/ytmp4?url=${enc(u)}` },
    { name: "okatsu", url: u => `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${enc(u)}` },
    { name: "siputzx", url: u => `https://api.siputzx.my.id/api/d/ytmp4?url=${enc(u)}` },
    { name: "ryzumi", url: u => `https://api.ryzumi.vip/api/downloader/ytmp4?url=${enc(u)}` }
];

const PIPED_APIS = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.tokhmi.xyz",
    "https://pipedapi.moomoo.me",
    "https://api.piped.yt"
];

function videoIdFromUrl(value) {
    const text = String(value || "").trim();
    const patterns = [
        /youtu\.be\/([A-Za-z0-9_-]{11})/i,
        /youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})/i,
        /youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/i
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m) return m[1];
    }
    return null;
}

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* Look at the first bytes to know what we really downloaded. */
function sniffVideo(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf.subarray(4, 8).toString("latin1") === "ftyp") return "mp4";
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
    return null;
}

async function fetchVideoBuffer(url, extraHeaders = {}, signal) {
    const res = await axios.get(url, {
        signal,
        responseType: "arraybuffer",
        timeout: 120000,
        maxContentLength: MAX_VIDEO_BYTES,
        maxBodyLength: MAX_VIDEO_BYTES,
        maxRedirects: 5,
        headers: { "User-Agent": YT_USER_AGENT, ...extraHeaders },
        validateStatus: s => s >= 200 && s < 300
    });
    const buf = Buffer.from(res.data);
    if (buf.length < MIN_VIDEO_BYTES) throw new Error("Downloaded file is too small");
    const kind = sniffVideo(buf);
    if (!kind) throw new Error("Downloaded file is not a video");
    return { buffer: buf, kind };
}

const VIDEO_URL_KEYS = [
    "download_url", "downloadURL", "downloadUrl", "dl", "mp4", "video",
    "link", "download", "url", "result", "data"
];
function findUrl(obj, depth = 0) {
    if (!obj || depth > 4) return null;
    if (typeof obj === "string") return /^https?:\/\//i.test(obj) ? obj : null;
    if (typeof obj !== "object") return null;
    for (const k of VIDEO_URL_KEYS) {
        if (k in obj) {
            const u = findUrl(obj[k], depth + 1);
            if (u) return u;
        }
    }
    return null;
}

async function videoFromApi(api, ytUrl, signal) {
    const { data } = await axios.get(api.url(ytUrl), {
        signal,
        timeout: 25000,
        headers: { "User-Agent": YT_USER_AGENT, Accept: "application/json" }
    });
    const link = findUrl(data);
    if (!link) throw new Error(`${api.name}: no download link`);
    return fetchVideoBuffer(link, {}, signal);
}

async function videoFromApisParallel(ytUrl, signal) {
    return Promise.any(VIDEO_APIS.map(api => videoFromApi(api, ytUrl, signal))).catch(e => {
        throw new Error(
            `APIs failed: ${(e?.errors || []).map(x => x?.message).join(" | ") || e?.message}`
        );
    });
}

async function videoFromSaveTube(id, signal) {
    const cdn = (
        await axios.get("https://media.savetube.vip/api/random-cdn", {
            signal,
            timeout: 15000,
            headers: SAVETUBE_HEADERS
        })
    ).data?.cdn;
    if (!cdn) throw new Error("SaveTube CDN unavailable");

    const info = (
        await axios.post(
            `https://${cdn}/v2/info`,
            { url: `https://www.youtube.com/watch?v=${id}` },
            { signal, timeout: 20000, headers: SAVETUBE_HEADERS }
        )
    ).data;
    if (!info?.data) throw new Error("SaveTube info unavailable");

    const raw = Buffer.from(info.data, "base64");
    const decipher = createDecipheriv("aes-128-cbc", SAVETUBE_KEY, raw.subarray(0, 16));
    const meta = JSON.parse(
        Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString("utf8")
    );
    if (!meta?.key) throw new Error("SaveTube key missing");

    let lastError;
    for (const quality of ["360", "480", "720"]) {
        try {
            const dl = (
                await axios.post(
                    `https://${cdn}/download`,
                    { id, downloadType: "video", quality, key: meta.key },
                    { signal, timeout: 40000, headers: SAVETUBE_HEADERS }
                )
            ).data;
            const link = dl?.data?.downloadUrl;
            if (!link) throw new Error(`no link for ${quality}p`);
            return await fetchVideoBuffer(link, {}, signal);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("SaveTube video failed");
}

async function videoFromYouTubeJs(id, signal) {
    const yt = await withTimeout(
        Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true }),
        30000,
        "YouTube.js session"
    );
    let lastError;
    for (const client of ["ANDROID", "IOS", "TV_EMBEDDED", "WEB"]) {
        if (signal?.aborted) throw new Error("cancelled");
        try {
            const info = await withTimeout(
                yt.getBasicInfo(id, { client }),
                25000,
                `YouTube.js ${client}`
            );
            /* muxed (video+audio) mp4 - plays directly in WhatsApp */
            const format = info.chooseFormat({ type: "video+audio", quality: "best", format: "mp4" });
            const url =
                format?.url ||
                (typeof format?.decipher === "function" ? format.decipher(yt.session.player) : null);
            if (!url) throw new Error("no video url");
            return await fetchVideoBuffer(url, { Referer: "https://www.youtube.com/" }, signal);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("YouTube.js failed");
}

async function videoFromPiped(id, signal) {
    let lastError;
    for (const base of PIPED_APIS) {
        try {
            const { data } = await axios.get(`${base}/streams/${enc(id)}`, {
                signal,
                timeout: 12000,
                headers: { "User-Agent": YT_USER_AGENT }
            });
            const stream = (data?.videoStreams || [])
                .filter(v => v?.url && v.videoOnly === false && /mp4/i.test(v.mimeType || v.format || ""))
                .sort((a, b) => {
                    const ha = (a.height || 0) > 720 ? -1 : a.height || 0;
                    const hb = (b.height || 0) > 720 ? -1 : b.height || 0;
                    return hb - ha;
                })[0];
            if (!stream) throw new Error("no muxed stream");
            return await fetchVideoBuffer(stream.url, {}, signal);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError || new Error("Piped failed");
}

/* Save a downloaded buffer to disk as .mp4 (converts webm with ffmpeg). */
async function saveBufferAsMp4(result, outputBase) {
    if (result.kind === "mp4") {
        const file = `${outputBase}.mp4`;
        fs.writeFileSync(file, result.buffer);
        return file;
    }
    const ffmpeg = await getFfmpeg();
    if (!ffmpeg) throw new Error("webm video received but ffmpeg is missing");
    const src = `${outputBase}.src.webm`;
    const dst = `${outputBase}.mp4`;
    fs.writeFileSync(src, result.buffer);
    try {
        await runCommand(ffmpeg, [
            "-y", "-i", src,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", dst
        ]);
    } finally {
        safeDelete(src);
    }
    return dst;
}

/*
 * FIX: "This video is not available because something is wrong with the
 * video file". APIs / YouTube often return mp4 files WhatsApp can't play
 * (HEVC / VP9 / AV1 inside mp4, fragmented mp4, no faststart, odd pixel
 * format). So EVERY downloaded video is now checked with ffmpeg:
 *   - already H.264 + AAC  -> fast remux (copy) with faststart
 *   - anything else        -> re-encode to H.264/AAC yuv420p, max 720p
 * The result is always a WhatsApp-playable mp4.
 */
async function probeCodecs(ffmpeg, file) {
    let text = "";
    try {
        await runCommand(ffmpeg, ["-hide_banner", "-i", file]);
    } catch (e) {
        text = String(e?.stderr || e?.message || "");
    }
    return {
        video: (text.match(/Video:\s*([a-z0-9_]+)/i) || [])[1]?.toLowerCase() || "",
        audio: (text.match(/Audio:\s*([a-z0-9_]+)/i) || [])[1]?.toLowerCase() || ""
    };
}

async function makeWhatsAppSafe(file, outputBase) {
    const ffmpeg = await getFfmpeg();
    if (!ffmpeg) {
        console.warn("[video] ffmpeg missing - sending file as is");
        return file;
    }

    const out = `${outputBase}.wa.mp4`;
    const { video, audio } = await probeCodecs(ffmpeg, file);
    const videoOk = video === "h264";
    const audioOk = audio === "aac" || audio === "";

    /* 1) H.264 + AAC  -> just re-pack (takes ~1 second)
     * 2) H.264 + other audio -> copy video, convert only audio (fast)
     * 3) other video codec -> full re-encode, tuned for SPEED (480p, ultrafast) */
    const remuxArgs = [
        "-y", "-i", file,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c:v", "copy",
        ...(audioOk ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "128k", "-ac", "2"]),
        "-movflags", "+faststart",
        out
    ];
    const encodeArgs = [
        "-y", "-i", file,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale=-2:'min(480,ih)',format=yuv420p",
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "fastdecode",
        "-crf", "30", "-threads", "0",
        "-profile:v", "main", "-level", "4.0",
        "-c:a", "aac", "-b:a", "96k", "-ac", "2",
        "-movflags", "+faststart",
        out
    ];

    try {
        if (videoOk) {
            try {
                await runCommand(ffmpeg, remuxArgs);
            } catch {
                safeDelete(out);
                await runCommand(ffmpeg, encodeArgs);
            }
        } else {
            await runCommand(ffmpeg, encodeArgs);
        }
    } catch (e) {
        safeDelete(out);
        throw new Error(`ffmpeg convert failed: ${String(e?.message || e).slice(-200)}`);
    }

    if (!fs.existsSync(out) || fs.statSync(out).size < MIN_VIDEO_BYTES) {
        safeDelete(out);
        throw new Error("ffmpeg produced an empty video");
    }

    if (out !== file) safeDelete(file);
    return out;
}

/*
 * Tries every source in order. First valid video wins.
 * yt-dlp is the LAST resort (it is usually blocked on Railway).
 */
async function downloadVideoAny(ytUrl, outputBase, ytDlpCommand) {
    const id = videoIdFromUrl(ytUrl);
    const errors = [];

    /*
     * SPEED FIX: sources used to run ONE AFTER ANOTHER, so a slow/dead source
     * (each could wait 60s+) delayed everything. Now ALL sources run at the
     * same time and the FIRST valid video wins; the others are cancelled.
     */
    if (id) {
        const controller = new AbortController();
        const { signal } = controller;

        const strategies = [
            ["YouTube.js", () => videoFromYouTubeJs(id, signal)],
            ["SaveTube", () => videoFromSaveTube(id, signal)],
            ["APIs", () => videoFromApisParallel(ytUrl, signal)],
            ["Piped", () => videoFromPiped(id, signal)]
        ];

        try {
            const winner = await Promise.any(
                strategies.map(async ([name, run]) => {
                    try {
                        const result = await run();
                        return { name, result };
                    } catch (e) {
                        const msg = String(e?.message || e).slice(0, 200);
                        errors.push(`${name}: ${msg}`);
                        console.warn(`[video] ${name} failed:`, msg);
                        throw e;
                    }
                })
            );
            controller.abort(); // stop the slower sources
            console.log(`[video] downloaded via ${winner.name}`);
            const raw = await saveBufferAsMp4(winner.result, outputBase);
            return await makeWhatsAppSafe(raw, outputBase);
        } catch (e) {
            controller.abort();
            if (!(e instanceof AggregateError)) {
                errors.push(`convert: ${String(e?.message || e).slice(0, 200)}`);
            }
        }
    }

    try {
        const raw = await downloadVideo(ytUrl, outputBase, ytDlpCommand);
        return await makeWhatsAppSafe(raw, outputBase);
    } catch (e) {
        errors.push(`yt-dlp: ${String(e?.message || e).split("\n")[0].slice(0, 200)}`);
    }

    throw new Error(`All video sources failed. ${errors.join(" || ")}`);
}

/* -------------------------------------------------------------------------- */
/* CLEAN FILE                                                                 */
/* -------------------------------------------------------------------------- */

function safeDelete(file) {
    try {
        if (
            file &&
            fs.existsSync(file)
        ) {
            fs.unlinkSync(file);
        }
    } catch {}
}

/* -------------------------------------------------------------------------- */
/* HANDLER                                                                    */
/* -------------------------------------------------------------------------- */

async function handler(
    m,
    { sock, text }
) {
    const query = getQuery(
        m,
        text
    );

    if (!query) {
        return m.reply(
            "❌ *Video name या YouTube URL दो.*\n\n" +
            "Example:\n" +
            "`.video Alan Walker Faded`\n\n" +
            "या:\n" +
            "`.video https://youtu.be/xxxx`"
        );
    }

    ensureTempDir();

    let videoInfo = null;
    let videoFile = null;

    try {
        await m.react("🕕");
    } catch {}

    try {
        /* ------------------------------------------------------------------ */
        /* CHECK YT-DLP                                                        */
        /* ------------------------------------------------------------------ */

        const ytDlpCommand =
            await checkYtDlp();

        if (!ytDlpCommand) {
            try {
                await m.react("❌");
            } catch {}

            return m.reply(
                "❌ *yt-dlp installed नहीं है.*\n\n" +
                "Hosting/server में `yt-dlp` install करना जरूरी है।"
            );
        }

        /* ------------------------------------------------------------------ */
        /* URL OR SEARCH                                                       */
        /* ------------------------------------------------------------------ */

        let youtubeUrl = query;

        if (!isYouTubeUrl(query)) {
            videoInfo =
                await searchYouTube(query);

            if (!videoInfo?.url) {
                try {
                    await m.react("❌");
                } catch {}

                return m.reply(
                    "❌ YouTube पर इस नाम से कोई video नहीं मिला."
                );
            }

            youtubeUrl =
                videoInfo.url;
        } else {
            /*
             * Get title/channel information
             * directly from yt-dlp.
             */
            try {
                const parsed =
                    await getYtDlpInfo(youtubeUrl);

                videoInfo = {
                    title:
                        parsed.title ||
                        "YouTube Video",
                    author: {
                        name:
                            parsed.uploader ||
                            parsed.channel ||
                            "YouTube"
                    },
                    thumbnail:
                        parsed.thumbnail || "",
                    duration:
                        parsed.duration_string ||
                        "",
                    views:
                        parsed.view_count ||
                        0,
                    url:
                        youtubeUrl
                };
            } catch (infoErr) {
                console.warn(
                    "[video] could not fetch metadata, continuing with defaults:",
                    String(infoErr?.message || infoErr).slice(0, 300)
                );
                videoInfo = {
                    title: "YouTube Video",
                    author: {
                        name: "YouTube"
                    },
                    url: youtubeUrl
                };
            }
        }

        /* ------------------------------------------------------------------ */
        /* SEND DOWNLOAD MESSAGE                                               */
        /* ------------------------------------------------------------------ */

        await m.reply(
            `🎥 *Video Download*\n\n` +
            `🎬 *${videoInfo?.title || "YouTube Video"}*\n` +
            `📺 ${videoInfo?.author?.name || "YouTube"}\n\n` +
            `⏳ Video download हो रहा है...\n` +
            `कृपया थोड़ा wait करें.`
        );

        /* ------------------------------------------------------------------ */
        /* UNIQUE FILE                                                         */
        /* ------------------------------------------------------------------ */

        const uniqueName =
            `yt_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`;

        const outputBase =
            path.join(
                TEMP_DIR,
                uniqueName
            );

        /* ------------------------------------------------------------------ */
        /* DOWNLOAD                                                            */
        /* ------------------------------------------------------------------ */

        videoFile =
            await downloadVideoAny(
                youtubeUrl,
                outputBase,
                ytDlpCommand
            );

        /* ------------------------------------------------------------------ */
        /* FILE SIZE                                                           */
        /* ------------------------------------------------------------------ */

        const stats =
            fs.statSync(videoFile);

        const maxSize =
            95 * 1024 * 1024;

        if (stats.size > maxSize) {
            safeDelete(videoFile);

            try {
                await m.react("❌");
            } catch {}

            return m.reply(
                "❌ *Video बहुत बड़ा है.*\n\n" +
                "95 MB से ज्यादा video WhatsApp पर नहीं भेजा जा सकता इस command से."
            );
        }

        /* ------------------------------------------------------------------ */
        /* SEND VIDEO                                                          */
        /* ------------------------------------------------------------------ */

        const caption =
`🎬 *${videoInfo?.title || "YouTube Video"}*

📺 *Channel:* ${videoInfo?.author?.name || "YouTube"}

${videoInfo?.duration
    ? `⏱️ *Duration:* ${videoInfo.duration}\n`
    : ""}${videoInfo?.views
    ? `👁️ *Views:* ${Number(videoInfo.views).toLocaleString()}\n`
    : ""}
🔗 *YouTube:* ${youtubeUrl}

> Downloaded by ${config?.bot?.name || "VX MD BOT"}`;

        await sock.sendMessage(
            m.chat,
            {
                video: fs.readFileSync(
                    videoFile
                ),
                mimetype: "video/mp4",
                fileName:
                    `${(videoInfo?.title || "youtube-video")
                        .replace(/[\\/:*?"<>|]/g, "")
                        .slice(0, 80)}.mp4`,
                caption,
                ptt: false
            },
            m.raw ? { quoted: m.raw } : {}
        );

        try {
            await m.react("✅");
        } catch {}

    } catch (error) {
        console.error(
            "VIDEO COMMAND ERROR:",
            error
        );

        try {
            await m.react("❌");
        } catch {}

        /* Surface a short, useful reason instead of only a generic message,
         * so failures can actually be diagnosed from the chat / logs. */
        const shortReason =
            String(error?.message || error)
                .split("\n")[0]
                .slice(0, 200);

        return m.reply(
            "❌ *Video download नहीं हो पाया.*\n\n" +
            "YouTube video unavailable, age/restriction, " +
            "format या server downloader की समस्या हो सकती है।\n\n" +
            `_Reason: ${shortReason}_`
        );
    } finally {
        /*
         * Always remove downloaded temporary file.
         */
        safeDelete(videoFile);
    }
}

/* -------------------------------------------------------------------------- */
/* EXPORT                                                                     */
/* -------------------------------------------------------------------------- */

export {
    pluginConfig as config,
    handler
};

/* -------------------------------------------------------------------------- */
/* LEGACY BRIDGE                                                              */
/* -------------------------------------------------------------------------- */

const __meta = {
    command: "video",
    aliases: [
        "ytvideo",
        "ytmp4",
        "youtubevideo"
    ],
    package: "search",
    description:
        "Download YouTube video and send it to WhatsApp.",
    isOwner: false,
    isGroup: false,
    isAdmin: false,
    isBotAdmin: false
};

async function __runLegacy(
    message,
    args = ""
) {
    const sock =
        withLegacySocket(message.conn);

    const rawCommand =
        String(message.body || "")
            .trim()
            .replace(/^\./, "")
            .split(/\s+/)[0]
            .toLowerCase();

    /* ---------------------------------------------------------------------- */
    /* NORMALIZE ARGS                                                          */
    /* ---------------------------------------------------------------------- */

    const argumentText =
        Array.isArray(args)
            ? args.join(" ").trim()
            : String(args || "").trim();

    const lm =
        makeLegacyMessage(
            message,
            argumentText,
            rawCommand || __meta.command
        );

    /* ---------------------------------------------------------------------- */
    /* ENSURE ARRAY ARGS                                                       */
    /* ---------------------------------------------------------------------- */

    if (!Array.isArray(lm.args)) {
        lm.args = argumentText
            .split(/\s+/)
            .filter(Boolean);
    }

    /* ---------------------------------------------------------------------- */
    /* GROUP INFO                                                              */
    /* ---------------------------------------------------------------------- */

    if (lm.isGroup) {
        try {
            await lm.loadGroupInfo();
        } catch {}
    }

    /* ---------------------------------------------------------------------- */
    /* PERMISSIONS                                                             */
    /* ---------------------------------------------------------------------- */

    if (
        __meta.isOwner &&
        !lm.isOwner
    ) {
        return lm.reply(
            "❌ Owner only."
        );
    }

    if (
        __meta.isGroup &&
        !lm.isGroup
    ) {
        return lm.reply(
            "❌ This command can only be used in groups."
        );
    }

    if (
        __meta.isAdmin &&
        !lm.isAdmin &&
        !lm.isOwner
    ) {
        return lm.reply(
            "❌ Only group admins can use this command."
        );
    }

    if (
        __meta.isBotAdmin &&
        !lm.isBotAdmin
    ) {
        return lm.reply(
            "❌ Bot must be a group admin to use this command."
        );
    }

    /* ---------------------------------------------------------------------- */
    /* RUN                                                                     */
    /* ---------------------------------------------------------------------- */

    return runLegacyContext(
        lm,
        () =>
            handler(lm, {
                sock,
                db: getLegacyDatabase(lm),
                text: argumentText
            })
    );
}

/* -------------------------------------------------------------------------- */
/* REGISTER                                                                   */
/* -------------------------------------------------------------------------- */

Module(__meta)(
    async (
        message,
        args = ""
    ) => {
        return __runLegacy(
            message,
            args
        );
    }
);

