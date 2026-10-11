import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { createDecipheriv } from "crypto";
import yts from "yt-search";
import axios from "axios";
import ytdlp from "youtube-dl-exec";
import { Innertube, UniversalCache } from "youtubei.js";
import { Module } from "../lib/plugins.js";

/*
 * ============================================================
 * SONG ENGINE  (.song .music .audio + Hindi/Bengali aliases)
 * .play / .ytplay live in play.js and reuse this engine.
 * ============================================================
 *
 * WHY THE OLD VERSION SENT NOTHING
 *  1. message.send() swallows errors and returns null, so the
 *     "direct URL failed -> download buffer" fallback never ran.
 *     The bot then reacted with a tick although nothing was sent.
 *  2. yt-dlp got a stray `--name` flag (from the profile object)
 *     so every yt-dlp attempt died with "no such option".
 *  3. Signed YouTube URLs / webm / m4a are not reliably playable
 *     when handed to WhatsApp as a URL.
 *
 * NEW FLOW
 *  search -> get audio BUFFER (many sources) -> verify it is
 *  really audio -> convert to MP3 with ffmpeg -> send with
 *  conn.sendMessage (errors are real errors, so fallbacks work).
 */

const SEARCH_TIMEOUT = 30_000;
const API_TIMEOUT = 45_000;
const DOWNLOAD_TIMEOUT = 180_000;
const MAX_QUERY = 200;
const MAX_DURATION = 60 * 60; // 1 hour
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MIN_AUDIO_BYTES = 20 * 1024;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SAVETUBE_HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://yt.savetube.me",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
};
const SAVETUBE_KEY = Buffer.from("C5D58EF67A7584E4A29F6C35BBC4EB12", "hex");

const enc = encodeURIComponent;

/* Public converter APIs. Tried IN PARALLEL, first valid audio wins. */
const AUDIO_APIS = [
  { name: "eliteprotech", url: (u) => `https://eliteprotech-apis.zone.id/ytdown?url=${enc(u)}&format=mp3` },
  { name: "yupra", url: (u) => `https://api.yupra.my.id/api/downloader/ytmp3?url=${enc(u)}` },
  { name: "okatsu", url: (u) => `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${enc(u)}` },
  { name: "siputzx", url: (u) => `https://api.siputzx.my.id/api/d/ytmp3?url=${enc(u)}` },
  { name: "ryzumi", url: (u) => `https://api.ryzumi.vip/api/downloader/ytmp3?url=${enc(u)}` },
];

const PIPED_APIS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.tokhmi.xyz",
  "https://pipedapi.moomoo.me",
  "https://api.piped.yt",
];

/* ============================ HELPERS ============================ */

export function cleanQuery(value = "") {
  return String(value).replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
}

export function safeFileName(value = "song") {
  return (
    String(value).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 100) ||
    "song"
  );
}

export function escapeText(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatViews(value) {
  const n = Number(value || 0);
  if (!n) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isYouTubeUrl(value) {
  return /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i.test(String(value || "").trim());
}

export function videoIdFromUrl(value) {
  const text = String(value || "").trim();
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})/i,
    /youtube\.com\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

/* Look at the first bytes to know what we really downloaded. */
function sniffAudio(buf) {
  if (!buf || buf.length < 12) return null;
  const head = buf.subarray(0, 4).toString("latin1");
  if (head.startsWith("ID3")) return "mp3";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return "m4a";
  if (head === "OggS") return "ogg";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  if (head === "RIFF") return "wav";
  if (head === "fLaC") return "flac";
  return null;
}

const MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm", wav: "audio/wav", flac: "audio/flac" };

/* ============================ FFMPEG ============================ */

let _ffmpegPath;
async function getFfmpeg() {
  if (_ffmpegPath !== undefined) return _ffmpegPath;
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean);
  for (const c of candidates) {
    const ok = await new Promise((resolve) =>
      execFile(c, ["-version"], { timeout: 5000 }, (err) => resolve(!err))
    );
    if (ok) return (_ffmpegPath = c);
  }
  for (const pkg of ["@ffmpeg-installer/ffmpeg", "ffmpeg-static"]) {
    try {
      const mod = await import(pkg);
      const p = mod?.default?.path || mod?.path || (typeof mod?.default === "string" ? mod.default : null);
      if (p && fs.existsSync(p)) return (_ffmpegPath = p);
    } catch {}
  }
  return (_ffmpegPath = null);
}

async function toMp3(buffer) {
  const ffmpeg = await getFfmpeg();
  if (!ffmpeg) throw new Error("ffmpeg not available");
  const stamp = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const inFile = path.join(os.tmpdir(), `song_in_${stamp}`);
  const outFile = path.join(os.tmpdir(), `song_out_${stamp}.mp3`);
  try {
    await fs.promises.writeFile(inFile, buffer);
    await new Promise((resolve, reject) =>
      execFile(
        ffmpeg,
        ["-y", "-i", inFile, "-vn", "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "128k", outFile],
        { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
        (err, _o, stderr) => (err ? reject(new Error(`ffmpeg failed: ${String(stderr).slice(-200)}`)) : resolve())
      )
    );
    const out = await fs.promises.readFile(outFile);
    if (out.length < MIN_AUDIO_BYTES) throw new Error("ffmpeg output too small");
    return out;
  } finally {
    fs.promises.unlink(inFile).catch(() => {});
    fs.promises.unlink(outFile).catch(() => {});
  }
}

/* ============================ SEARCH ============================ */

export async function searchVideo(query) {
  if (isYouTubeUrl(query)) {
    const id = videoIdFromUrl(query);
    if (!id) throw new Error("Invalid YouTube URL");
    let info = null;
    try {
      info = await withTimeout(yts({ videoId: id }), SEARCH_TIMEOUT, "YouTube lookup");
    } catch {}
    return {
      url: `https://www.youtube.com/watch?v=${id}`,
      videoId: id,
      title: info?.title || "YouTube Song",
      seconds: Number(info?.seconds || 0),
      timestamp: info?.timestamp || "",
      views: Number(info?.views || 0),
      ago: info?.ago || "",
      author: info?.author?.name || "YouTube",
      thumbnail: info?.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  const res = await withTimeout(yts(query), SEARCH_TIMEOUT, "YouTube search");
  const videos = (res?.videos || []).filter((v) => v?.url && v?.videoId);
  if (!videos.length) throw new Error("Song not found");

  const good = videos.filter((v) => {
    const s = Number(v.seconds || 0);
    return s >= 10 && s <= MAX_DURATION && !/\blive\b|livestream/i.test(String(v.title || ""));
  });
  const v = (good.length ? good : videos)[0];
  return {
    url: v.url,
    videoId: v.videoId,
    title: v.title || query,
    seconds: Number(v.seconds || 0),
    timestamp: v.timestamp || v.duration?.timestamp || "",
    views: Number(v.views || 0),
    ago: v.ago || "",
    author: v.author?.name || "Unknown",
    thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
  };
}

/* ============================ DOWNLOAD ============================ */

async function downloadBuffer(url, extraHeaders = {}) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: DOWNLOAD_TIMEOUT,
    maxContentLength: MAX_AUDIO_BYTES,
    maxBodyLength: MAX_AUDIO_BYTES,
    maxRedirects: 5,
    headers: { "User-Agent": USER_AGENT, ...extraHeaders },
    validateStatus: (s) => s >= 200 && s < 300,
  });
  const buf = Buffer.from(res.data);
  if (buf.length < MIN_AUDIO_BYTES) throw new Error("Downloaded file is too small");
  if (!sniffAudio(buf)) throw new Error("Downloaded file is not audio");
  return buf;
}

/* Find the download link inside whatever JSON an API returns. */
const URL_KEYS = ["download_url", "downloadURL", "downloadUrl", "dl", "mp3", "audio", "link", "download", "url", "result", "data"];
function findUrl(obj, depth = 0) {
  if (!obj || depth > 4) return null;
  if (typeof obj === "string") return /^https?:\/\//i.test(obj) ? obj : null;
  if (typeof obj !== "object") return null;
  for (const k of URL_KEYS) {
    if (k in obj) {
      const u = findUrl(obj[k], depth + 1);
      if (u) return u;
    }
  }
  return null;
}

async function fromApi(api, video) {
  const { data } = await axios.get(api.url(video.url), {
    timeout: API_TIMEOUT,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  const link = findUrl(data);
  if (!link) throw new Error(`${api.name}: no download link`);
  const buffer = await downloadBuffer(link);
  return { buffer, title: data?.title || data?.result?.title || data?.data?.title || video.title, source: api.name };
}

async function fromApisParallel(video) {
  return Promise.any(AUDIO_APIS.map((api) => fromApi(api, video))).catch((e) => {
    throw new Error(`APIs failed: ${(e?.errors || []).map((x) => x?.message).join(" | ") || e?.message}`);
  });
}

async function fromSaveTube(video) {
  const id = video.videoId || videoIdFromUrl(video.url);
  if (!id) throw new Error("Invalid YouTube URL");
  const cdn = (await axios.get("https://media.savetube.vip/api/random-cdn", { timeout: 30_000, headers: SAVETUBE_HEADERS })).data?.cdn;
  if (!cdn) throw new Error("SaveTube CDN unavailable");
  const info = (
    await axios.post(`https://${cdn}/v2/info`, { url: `https://www.youtube.com/watch?v=${id}` }, { timeout: 45_000, headers: SAVETUBE_HEADERS })
  ).data;
  if (!info?.data) throw new Error("SaveTube info unavailable");
  const raw = Buffer.from(info.data, "base64");
  const decipher = createDecipheriv("aes-128-cbc", SAVETUBE_KEY, raw.subarray(0, 16));
  const meta = JSON.parse(Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]).toString("utf8"));
  if (!meta?.key) throw new Error("SaveTube key missing");
  let link = null;
  for (const quality of ["128", "128kbps"]) {
    try {
      const dl = (
        await axios.post(`https://${cdn}/download`, { id, downloadType: "audio", quality, key: meta.key }, { timeout: 90_000, headers: SAVETUBE_HEADERS })
      ).data;
      link = dl?.data?.downloadUrl;
      if (link) break;
    } catch {}
  }
  if (!link) throw new Error("SaveTube link missing");
  return { buffer: await downloadBuffer(link), title: meta.title || video.title, source: "savetube" };
}

/* Optional cookies (helps a lot on Railway / datacenter IPs).
 * Set YT_COOKIES_FILE=/path/cookies.txt  or  YT_COOKIES="<netscape cookies text>" */
function getCookiesFile() {
  try {
    if (process.env.YT_COOKIES_FILE && fs.existsSync(process.env.YT_COOKIES_FILE)) return process.env.YT_COOKIES_FILE;
    if (process.env.YT_COOKIES) {
      const p = path.join(os.tmpdir(), "yt_cookies.txt");
      fs.writeFileSync(p, process.env.YT_COOKIES.replace(/\\n/g, "\n"));
      return p;
    }
  } catch {}
  return null;
}

function findDeno() {
  for (const p of ["/usr/local/bin/deno", "/usr/bin/deno"]) if (fs.existsSync(p)) return p;
  return null;
}

async function fromYtDlp(video) {
  const ffmpeg = await getFfmpeg();
  const cookies = getCookiesFile();
  const deno = findDeno();

  /* NOTE: profile.name is NOT passed to yt-dlp (it used to be, which broke every call). */
  const profiles = [];
  if (deno) profiles.push({ jsRuntimes: { deno }, remoteComponents: "ejs:github" });
  profiles.push({});

  let lastError;
  for (const profile of profiles) {
    const stamp = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const prefix = path.join(os.tmpdir(), `ytdlp_${stamp}`);
    try {
      await withTimeout(
        ytdlp(
          video.url,
          {
            noPlaylist: true,
            noWarnings: true,
            quiet: true,
            forceIpv4: true,
            retries: 2,
            socketTimeout: 20,
            extractAudio: true,
            audioFormat: "mp3",
            audioQuality: 5,
            output: `${prefix}.%(ext)s`,
            format: "bestaudio[ext=m4a]/bestaudio/best",
            userAgent: USER_AGENT,
            ...(ffmpeg && ffmpeg !== "ffmpeg" ? { ffmpegLocation: ffmpeg } : {}),
            ...(cookies ? { cookies } : {}),
            ...profile,
          },
          { timeout: DOWNLOAD_TIMEOUT }
        ),
        DOWNLOAD_TIMEOUT + 5000,
        "yt-dlp"
      );
      const file = fs.readdirSync(os.tmpdir()).find((f) => f.startsWith(path.basename(prefix)));
      if (!file) throw new Error("yt-dlp produced no file");
      const full = path.join(os.tmpdir(), file);
      const buffer = await fs.promises.readFile(full);
      fs.promises.unlink(full).catch(() => {});
      if (buffer.length < MIN_AUDIO_BYTES || !sniffAudio(buffer)) throw new Error("yt-dlp output invalid");
      return { buffer, title: video.title, source: "yt-dlp" };
    } catch (e) {
      lastError = e;
      console.warn("[song] yt-dlp failed:", String(e?.message || e).slice(0, 200));
      try {
        for (const f of fs.readdirSync(os.tmpdir())) if (f.startsWith(path.basename(prefix))) fs.unlinkSync(path.join(os.tmpdir(), f));
      } catch {}
    }
  }
  throw lastError || new Error("yt-dlp failed");
}

async function fromYouTubeJs(video) {
  const id = video.videoId || videoIdFromUrl(video.url);
  const yt = await withTimeout(Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true }), 45_000, "YouTube.js session");
  let lastError;
  for (const client of ["ANDROID", "IOS", "TV_EMBEDDED", "WEB"]) {
    try {
      const info = await withTimeout(yt.getBasicInfo(id, { client }), 45_000, `YouTube.js ${client}`);
      const format = info.chooseFormat({ type: "audio", quality: "best", format: "any" });
      const url = format?.url || (typeof format?.decipher === "function" ? format.decipher(yt.session.player) : null);
      if (!url) throw new Error("no audio url");
      const buffer = await downloadBuffer(url, { Referer: "https://www.youtube.com/" });
      return { buffer, title: info.basic_info?.title || video.title, source: `youtubei/${client}` };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("YouTube.js failed");
}

async function fromPiped(video) {
  const id = video.videoId || videoIdFromUrl(video.url);
  let lastError;
  for (const base of PIPED_APIS) {
    try {
      const { data } = await axios.get(`${base}/streams/${enc(id)}`, { timeout: 25_000, headers: { "User-Agent": USER_AGENT } });
      const stream = (data?.audioStreams || []).filter((s) => s?.url).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
      if (!stream) throw new Error("no stream");
      return { buffer: await downloadBuffer(stream.url), title: data?.title || video.title, source: `piped` };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Piped failed");
}

/**
 * Returns { buffer, mimeType, ext, title, source } — always a real, playable audio file.
 */
export async function downloadSongAudio(video) {
  const strategies = [
    ["APIs", fromApisParallel],
    ["SaveTube", fromSaveTube],
    ["yt-dlp", fromYtDlp],
    ["YouTube.js", fromYouTubeJs],
    ["Piped", fromPiped],
  ];

  let result = null;
  const errors = [];
  for (const [name, fn] of strategies) {
    try {
      console.log(`[song] trying ${name}: ${video.title}`);
      result = await fn(video);
      if (result?.buffer?.length) {
        console.log(`[song] ✅ ${name} ok (${result.source}, ${(result.buffer.length / 1048576).toFixed(1)} MB)`);
        break;
      }
    } catch (e) {
      errors.push(`${name}: ${String(e?.message || e).slice(0, 120)}`);
      console.warn(`[song] ${name} failed:`, String(e?.message || e).slice(0, 200));
    }
  }
  if (!result?.buffer) throw new Error(`All song download methods failed → ${errors.join(" || ")}`);

  let kind = sniffAudio(result.buffer) || "mp3";
  let buffer = result.buffer;

  /* WhatsApp plays mp3 everywhere. Convert anything else (webm/ogg/wav/flac). m4a is fine as-is if ffmpeg is missing. */
  if (kind !== "mp3") {
    try {
      buffer = await toMp3(buffer);
      kind = "mp3";
    } catch (e) {
      console.warn("[song] mp3 convert skipped:", e?.message);
      if (kind === "webm" || kind === "ogg") throw new Error("Audio format not playable and ffmpeg is missing");
    }
  }
  if (buffer.length > MAX_AUDIO_BYTES) throw new Error("Audio file is too large");

  return {
    buffer,
    mimeType: MIME[kind] || "audio/mpeg",
    ext: kind === "m4a" ? "m4a" : "mp3",
    title: result.title || video.title,
    source: result.source,
  };
}

/* ============================ SENDING ============================ */

export async function sendSongAudio(message, audio) {
  const conn = message.conn;
  const opts = message.raw ? { quoted: message.raw } : {};
  return conn.sendMessage(
    message.from,
    {
      audio: audio.buffer,
      mimetype: audio.mimeType,
      fileName: `${safeFileName(audio.title)}.${audio.ext}`,
      ptt: false,
    },
    opts
  ); // throws on failure (message.send() would hide the error)
}

export async function replyText(message, text) {
  try {
    return await message.conn.sendMessage(message.from, { text }, message.raw ? { quoted: message.raw } : {});
  } catch {}
}

export function songErrorText(error, query) {
  const reason = String(error?.message || "");
  if (/too large/i.test(reason)) return "❌ *यह गाना WhatsApp के लिए बहुत बड़ा है।*\nकोई छोटा version try करें।";
  if (/not found|invalid youtube/i.test(reason))
    return `❌ *गाना नहीं मिला।*\n\n🔎 Search: *${escapeText(query)}*\n💡 गाने के साथ singer का नाम भी लिखें।`;
  return (
    `❌ *Song download नहीं हो पाया।*\n\n🎵 *${escapeText(query)}*\n\n` +
    `YouTube/download service अभी busy है, 1 मिनट बाद फिर try करें।`
  );
}

/* ============================ COMMAND ============================ */

export const SONG_ALIASES = [
  "music", "audio", "गाना", "गानाशुनाओ", "सुनाओ", "म्यूजिक",
  "গান", "গানশুনাও", "শুনাও", "মিউজিক",
];

export function songHelp() {
  return (
    "╭━━〔 🎵 *SONG DOWNLOADER* 〕━━⬣\n" +
    "┃ `.song <gaane ka naam>`\n" +
    "┃ `.play <gaane ka naam>`  (card + song)\n" +
    "┃ `.music` / `.audio` / `.गाना`\n" +
    "┃\n" +
    "┃ 📌 Example: `.song Arijit Singh Tum Hi Ho`\n" +
    "┃ 🔗 YouTube link भी चलेगा\n" +
    "╰━━━━━━━━━━━━━━⬣"
  );
}

Module({
  command: "song",
  aliases: SONG_ALIASES,
  package: "downloader",
  description: "Search YouTube and send the song as MP3",
})(async (message, match) => {
  const query = cleanQuery(match);
  if (!query) return replyText(message, songHelp());

  try {
    await message.react("🔎");
    const video = await searchVideo(query);
    await message.react("⏳");
    const audio = await downloadSongAudio(video);
    await sendSongAudio(message, audio);
    await message.react("✅");
  } catch (error) {
    console.error("[song] FINAL error:", error?.stack || error?.message || error);
    await message.react("❌");
    await replyText(message, songErrorText(error, query));
  }
});
