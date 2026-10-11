/*
|--------------------------------------------------------------------------
| GROUP STATUS ENGINE (shared by gstatus / swgc / swgcall / swgcv2 / swgcv2all / gstory)
|--------------------------------------------------------------------------
| FIXES IN THIS VERSION
|  1. Text-status background colour was never applied. In Baileys the
|     `backgroundColor` and `font` values are *options* of
|     generateWAMessageContent(), they are NOT part of the content object.
|     They are now passed correctly (and also written into the message
|     directly as a safety net).
|  2. Media (photo / video / audio) is now built with the same canonical
|     path that works for text: generateWAMessageContent(content, {upload})
|     wrapped in groupStatusMessageV2 + messageSecret. The extra
|     "statusAttributions / statusAudienceMetadata" context fields that were
|     added on top of media messages are removed.
|  3. Media is uploaded ONCE and re-used for every group (faster, fewer
|     rate-limit errors in broadcasts).
|  4. Media is validated after upload (mediaKey + directPath must exist) so a
|     broken upload is reported as a failure instead of a fake "success".
|  5. Audio is converted to a WhatsApp voice-note (ogg/opus, ptt) and gets
|     duration + waveform. Non-mp4 video is converted to mp4. Photo / video
|     get a jpeg thumbnail so the status preview is not blank.
|  6. Media hint: Baileys decides the stanza type ("media") and the `mediatype`
|     attribute by looking at the TOP level of the relayed message, but a group
|     status hides the media inside groupStatusMessageV2. The media object is
|     therefore exposed (read-only, through the prototype, so it is NOT encoded
|     twice) to that check. Set GSTATUS_MEDIA_HINT=0 to switch this off.
|  Set GSTATUS_DEBUG=1 to print detailed logs in the console / Railway logs.
|--------------------------------------------------------------------------
*/
import { fileTypeFromBuffer } from "file-type";
import {
  generateWAMessageContent,
  generateWAMessageFromContent,
} from "@whiskeysockets/baileys";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import config from "../config.js";

const DEBUG = process.env.GSTATUS_DEBUG === "1";
const MEDIA_HINT = process.env.GSTATUS_MEDIA_HINT !== "0";

function dbg(...args) {
  if (DEBUG) console.log("[gstatus]", ...args);
}

/* -------------------------------------------------------------------------- */
/* COLOURS / FONTS                                                            */
/* -------------------------------------------------------------------------- */

// ALL group-status text commands (.swgc, .swgcall, .swgcv2, .swgcv2all,
// .gstatus, .gstory ...) use this PURPLE palette by default (no more green).
// A colour typed by the owner (#hex / bg:name) is still respected.
const TEXT_STATUS_COLORS = [
  "#8E24AA", "#5E35B1", "#6A1B9A", "#673AB7", "#7B1FA2", "#4527A0",
  "#9C27B0", "#512DA8", "#AB47BC", "#7E57C2", "#6A1B9A", "#8E24AA",
];

// Valid WhatsApp text-status fonts.
const STATUS_FONTS = [0, 1, 2, 6, 7, 8, 9, 10];

const COLOR_NAMES = {
  red: "#E53935", laal: "#E53935",
  green: "#43A047", hara: "#43A047",
  blue: "#1E88E5", neela: "#1E88E5", nila: "#1E88E5",
  pink: "#D81B60", gulabi: "#D81B60",
  purple: "#8E24AA", baingani: "#8E24AA", violet: "#5E35B1",
  orange: "#F57C00", narangi: "#F57C00",
  yellow: "#F9A825", peela: "#F9A825", gold: "#FF8F00",
  teal: "#128C7E", cyan: "#00ACC1",
  black: "#111111", kala: "#111111",
  brown: "#6D4C41",
  grey: "#546E7A", gray: "#546E7A",
  indigo: "#3949AB", navy: "#1A237E", maroon: "#880E4F", lime: "#7CB342",
};

export function getStatusColor(index = 0) {
  return TEXT_STATUS_COLORS[Math.abs(Number(index) || 0) % TEXT_STATUS_COLORS.length];
}

export function getStatusFont(index = 0) {
  return STATUS_FONTS[Math.abs(Number(index) || 0) % STATUS_FONTS.length];
}

export function randomIndex() {
  return Math.floor(Math.random() * 100000);
}

function normalizeHex(value) {
  let hex = String(value || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return `#${hex.toUpperCase()}`;
}

export function resolveColor(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  if (COLOR_NAMES[v]) return COLOR_NAMES[v];
  return normalizeHex(v);
}

function hexToArgb(hex) {
  const clean = normalizeHex(hex);
  if (!clean) return undefined;
  return (0xff000000 | parseInt(clean.slice(1), 16)) >>> 0;
}

export function listColorNames() {
  return Object.keys(COLOR_NAMES);
}

/**
 * Reads optional style tokens at the START of a text status:
 *   #ff0000 Hello        -> red background
 *   bg:red Hello         -> red background
 *   bg:laal font:2 Hello -> red background + font 2
 */
export function parseStatusStyle(raw) {
  let text = String(raw || "").trim();
  let color = null;
  let font = null;

  for (let i = 0; i < 3; i++) {
    const m = text.match(/^(\S+)(?:\s+|$)/);
    if (!m) break;
    const token = m[1];
    let t;
    if ((t = token.match(/^(?:bg|color|c):(.+)$/i))) {
      const c = resolveColor(t[1]);
      if (!c) break;
      color = c;
    } else if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(token)) {
      color = normalizeHex(token);
    } else if ((t = token.match(/^font:(\d+)$/i))) {
      const f = Number(t[1]);
      if (!STATUS_FONTS.includes(f)) break;
      font = f;
    } else {
      break;
    }
    text = text.slice(m[0].length);
  }

  return { text: text.trim(), color, font };
}

/**
 * Gives a text status its own background colour (and optional font).
 * A colour typed by the owner (fixedColor) is always respected.
 */
export function styleTextContent(content, index = 0, { rotateFont = false } = {}) {
  if (!content?.text) return content;
  return {
    ...content,
    backgroundColor: content.fixedColor
      ? content.backgroundColor
      : getStatusColor(index),
    font: content.fixedFont
      ? content.font
      : rotateFont
        ? getStatusFont(index)
        : Number.isInteger(content.font) ? content.font : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* SMALL HELPERS                                                              */
/* -------------------------------------------------------------------------- */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function isRateLimitError(error) {
  const text = String(error?.message || error?.data?.message || error || "").toLowerCase();
  return (
    text.includes("rate-overlimit") ||
    text.includes("rate overlimit") ||
    text.includes("rate limit") ||
    text.includes("too many requests") ||
    text.includes("429")
  );
}

/* -------------------------------------------------------------------------- */
/* GROUP LIST (cached) - fixes "rate-overlimit"                               */
/* groupFetchAllParticipating() is heavily rate-limited by WhatsApp. Calling  */
/* it on every .swgc / .swgcv2 (or twice quickly) returns rate-overlimit.     */
/* So: cache the list, share one in-flight request, retry with wait, and      */
/* fall back to the old cached list if WhatsApp still refuses.                */
/* -------------------------------------------------------------------------- */

const GROUPS_TTL_MS = 5 * 60 * 1000;
const groupsCache = new WeakMap(); // conn -> { at, data, inflight }

export async function getGroupsCached(conn, { force = false } = {}) {
  let st = groupsCache.get(conn);
  if (!st) { st = { at: 0, data: null, inflight: null }; groupsCache.set(conn, st); }

  if (!force && st.data && Date.now() - st.at < GROUPS_TTL_MS) return st.data;
  if (st.inflight) return st.inflight;

  st.inflight = (async () => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        global.isFetchingGroups = true;
        const data = await conn.groupFetchAllParticipating();
        if (data && Object.keys(data).length) {
          st.data = data;
          st.at = Date.now();
          return data;
        }
        lastErr = new Error("empty group list");
      } catch (e) {
        lastErr = e;
        if (!isRateLimitError(e)) break;
        await sleep(4000 * (attempt + 1)); // 4s, 8s, 12s
      } finally {
        global.isFetchingGroups = false;
      }
    }
    if (st.data) return st.data; // purani list se kaam chalao
    throw lastErr || new Error("group list unavailable");
  })();

  try {
    return await st.inflight;
  } finally {
    st.inflight = null;
  }
}

export function isOwnerMessage(m) {
  if (m?.isFromMe || m?.isfromMe || m?.fromMe || m?.key?.fromMe || m?.isOwner) return true;
  const num = String(m?.sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  const owners = [config.owner, config.sudo]
    .map((x) => String(x || "").replace(/\D/g, ""))
    .filter(Boolean);
  return Boolean(num) && owners.includes(num);
}

export function isValidGroupId(id) {
  return typeof id === "string" && /^[0-9]+(?:-[0-9]+)?@g\.us$/i.test(id);
}

export function describeContent(content) {
  if (content?.image) return { icon: "🖼️", label: "Photo" };
  if (content?.video) return { icon: "🎥", label: "Video" };
  if (content?.audio) return { icon: "🎵", label: "Audio" };
  if (content?.text) return { icon: "📝", label: "Text" };
  return { icon: "❔", label: "Unknown" };
}

/* -------------------------------------------------------------------------- */
/* ffmpeg helpers (audio -> voice note, video -> mp4, thumbnails)             */
/* -------------------------------------------------------------------------- */

function tmpBase() {
  return path.join(os.tmpdir(), `gs-${Date.now()}-${randomBytes(4).toString("hex")}`);
}

function rmQuiet(...files) {
  for (const f of files) {
    try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  }
}

function spawnOnce(bin, args, collectStdout) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", collectStdout ? "pipe" : "ignore", "pipe"] });
    const out = [];
    let err = "";
    p.stdout?.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-10000);
    });
    p.on("error", reject);
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 180000);
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: err });
    });
  });
}

async function ffmpegRun(args, collectStdout = false) {
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean);
  try {
    const mod = await import("@ffmpeg-installer/ffmpeg");
    const p = mod.default?.path || mod.path;
    if (p) candidates.push(p);
  } catch {}

  let lastErr;
  for (const bin of candidates) {
    try {
      return await spawnOnce(bin, args, collectStdout);
    } catch (e) {
      lastErr = e;
      if (e?.code !== "ENOENT") throw e;
    }
  }
  throw lastErr || new Error("ffmpeg not found");
}

async function imageThumb(buffer) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer)
      .rotate()
      .resize(64, 64, { fit: "inside" })
      .jpeg({ quality: 50 })
      .toBuffer();
  } catch (e) {
    dbg("image thumb skipped:", e?.message);
    return null;
  }
}

async function videoThumb(buffer) {
  const base = tmpBase();
  const inp = `${base}.in`;
  const out = `${base}.jpg`;
  try {
    fs.writeFileSync(inp, buffer);
    for (const seek of ["0.3", "0"]) {
      rmQuiet(out);
      const r = await ffmpegRun(["-y", "-v", "error", "-ss", seek, "-i", inp, "-frames:v", "1", "-vf", "scale=96:-2", "-q:v", "6", out]);
      if (r.code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0) {
        return fs.readFileSync(out);
      }
    }
    return null;
  } catch (e) {
    dbg("video thumb skipped:", e?.message);
    return null;
  } finally {
    rmQuiet(inp, out);
  }
}

async function videoToMp4(buffer) {
  const base = tmpBase();
  const inp = `${base}.in`;
  const out = `${base}.mp4`;
  try {
    fs.writeFileSync(inp, buffer);
    const r = await ffmpegRun([
      "-y", "-v", "error", "-i", inp,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-f", "mp4", out,
    ]);
    if (r.code !== 0 || !fs.existsSync(out)) throw new Error(r.stderr.slice(-200) || "ffmpeg failed");
    return fs.readFileSync(out);
  } finally {
    rmQuiet(inp, out);
  }
}

async function audioWaveform(file) {
  const r = await ffmpegRun(["-v", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"], true);
  const pcm = r.stdout;
  const samples = Math.floor(pcm.length / 2);
  if (!samples) return null;
  const N = 64;
  const bucket = Math.max(1, Math.floor(samples / N));
  const vals = [];
  let max = 0;
  for (let i = 0; i < N; i++) {
    let sum = 0;
    let count = 0;
    const s = i * bucket;
    const e = Math.min(samples, s + bucket);
    for (let j = s; j < e; j++) { sum += Math.abs(pcm.readInt16LE(j * 2)); count++; }
    const avg = count ? sum / count : 0;
    vals.push(avg);
    if (avg > max) max = avg;
  }
  return Uint8Array.from(vals.map((v) => (max ? Math.round((v / max) * 100) : 0)));
}

async function audioToVoiceNote(buffer) {
  const base = tmpBase();
  const inp = `${base}.in`;
  const out = `${base}.ogg`;
  try {
    fs.writeFileSync(inp, buffer);
    const r = await ffmpegRun([
      "-y", "-v", "error", "-i", inp, "-vn", "-map_metadata", "-1",
      "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "48k", "-f", "ogg", out,
    ]);
    if (r.code !== 0 || !fs.existsSync(out)) throw new Error(r.stderr.slice(-200) || "ffmpeg failed");

    const info = await ffmpegRun(["-i", out]);
    const d = info.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    const seconds = d ? Math.max(1, Math.round(Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]))) : undefined;

    let waveform = null;
    try { waveform = await audioWaveform(out); } catch {}

    return { buffer: fs.readFileSync(out), seconds, waveform };
  } finally {
    rmQuiet(inp, out);
  }
}

/* -------------------------------------------------------------------------- */
/* MEDIA DOWNLOAD / CONTENT BUILDING                                          */
/* -------------------------------------------------------------------------- */

function getType(source) {
  return String(
    source?.type || source?.mtype || source?.messageType || source?.msgType || ""
  ).toLowerCase();
}

function getMime(source) {
  return String(
    source?.mimetype || source?.mimeType || source?.msg?.mimetype ||
      source?.content?.mimetype || ""
  ).toLowerCase();
}

function mediaKind(source) {
  if (!source || typeof source.download !== "function") return null;
  const type = getType(source);
  const mime = getMime(source);
  if (type === "imagemessage" || source.isImage || mime.startsWith("image/")) return "image";
  if (type === "videomessage" || source.isVideo || mime.startsWith("video/")) return "video";
  if (type === "audiomessage" || source.isAudio || mime.startsWith("audio/")) return "audio";
  return null;
}

async function detectMime(buffer, fallback = "") {
  try {
    const d = await fileTypeFromBuffer(buffer);
    if (d?.mime) return d.mime.toLowerCase();
  } catch {}
  return String(fallback || "").toLowerCase();
}

function toContent(kind, buffer, mime, caption, ptt = false) {
  if (kind === "image") return { image: buffer, caption, mimetype: mime.startsWith("image/") ? mime : "image/jpeg" };
  if (kind === "video") return { video: buffer, caption, mimetype: mime.startsWith("video/") ? mime : "video/mp4" };
  return { audio: buffer, mimetype: mime.startsWith("audio/") ? mime : "audio/mpeg", ptt: Boolean(ptt) };
}

async function downloadUrlMedia(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 WhatsApp-Bot-Media-Fetch",
        accept: "image/*,video/*,audio/*,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`Media URL returned HTTP ${response.status}`);

    const length = Number(response.headers.get("content-length") || 0);
    if (length > 60 * 1024 * 1024) throw new Error("Media URL file is larger than 60 MB.");

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("Media URL returned an empty file.");

    const mime = (await detectMime(buffer, String(response.headers.get("content-type") || "").split(";")[0])).trim();
    const kind = mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : null;
    if (!kind) throw new Error(`URL is not a supported image/video/audio file (${mime || "unknown type"}).`);
    return { kind, buffer, mime };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turns a command message into a status payload:
 *   { image|video|audio, ... }  or  { text, backgroundColor, font, fixedColor, fixedFont }
 * Order: media URL -> replied media -> media attached to the command -> text.
 */
export async function makeGroupStatusContent(message, caption = "") {
  const input = String(caption || "").trim();

  // 1) Direct media URL:  .cmd https://site/file.jpg [caption]
  const urlMatch = input.match(/^(https?:\/\/\S+)(?:\s+([\s\S]*))?$/i);
  if (urlMatch) {
    try {
      const remote = await downloadUrlMedia(urlMatch[1]);
      return toContent(remote.kind, remote.buffer, remote.mime, String(urlMatch[2] || "").trim());
    } catch (e) {
      const looksMedia = /\.(jpe?g|png|webp|gif|mp4|mov|mkv|webm|mp3|m4a|ogg|opus|wav|aac)(\?|#|$)/i.test(urlMatch[1]);
      if (looksMedia) throw e;
      // not a media link -> continue and post it as normal text
    }
  }

  // 2) Replied media first, then media attached to the command message itself
  const sources = [];
  if (message?.quoted) sources.push(message.quoted);
  sources.push(message);

  for (const source of sources) {
    const kind = mediaKind(source);
    if (!kind) continue;

    const buffer = await source.download();
    if (!buffer || !buffer.length) {
      throw new Error("Media download failed. Photo/video/audio par dobara reply karke try karein.");
    }
    const mime = await detectMime(buffer, getMime(source));
    const ptt = source?.msg?.ptt ?? source?.content?.ptt ?? source?.ptt ?? false;
    dbg("media source:", kind, mime, `${buffer.length} bytes`);
    return toContent(kind, buffer, mime, input, ptt);
  }

  // 3) Plain text (optional #color / bg:color / font:N prefix)
  if (input) {
    const style = parseStatusStyle(input);
    if (!style.text) return null;
    return {
      text: style.text,
      font: style.font ?? 0,
      backgroundColor: style.color || getStatusColor(0),
      fixedColor: Boolean(style.color),
      fixedFont: style.font !== null,
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* PREPARE (upload once) + SEND (per group)                                   */
/* -------------------------------------------------------------------------- */

async function finalizeMedia(content) {
  const out = {};
  for (const [k, v] of Object.entries(content)) if (v !== undefined) out[k] = v;

  if (out.image) {
    const thumb = await imageThumb(out.image);
    if (thumb) out.jpegThumbnail = thumb;
    return out;
  }

  if (out.video) {
    const mime = String(out.mimetype || "").toLowerCase();
    if (mime !== "video/mp4") {
      try {
        out.video = await videoToMp4(out.video);
        dbg("video converted to mp4");
      } catch (e) {
        console.warn("[gstatus] video conversion skipped:", e?.message);
      }
    }
    out.mimetype = "video/mp4";
    const thumb = await videoThumb(out.video);
    if (thumb) out.jpegThumbnail = thumb;
    return out;
  }

  if (out.audio) {
    // WhatsApp statuses only support voice notes (ogg/opus + ptt).
    try {
      const vn = await audioToVoiceNote(out.audio);
      out.audio = vn.buffer;
      if (vn.seconds) out.seconds = vn.seconds;
      if (vn.waveform) out.waveform = vn.waveform;
      out.mimetype = "audio/ogg; codecs=opus";
      out.ptt = true;
      dbg("audio converted to voice note", vn.seconds, "sec");
    } catch (e) {
      console.warn("[gstatus] audio conversion skipped:", e?.message);
      out.ptt = true;
    }
    return out;
  }

  return out;
}

/**
 * Upload the media ONE time. For text nothing is uploaded (it is built per group
 * because every group can have a different background colour).
 */
export async function prepareGroupStatus(conn, content) {
  if (!conn) throw new Error("WhatsApp connection unavailable.");
  if (!content) throw new Error("Unsupported status content.");

  if (content.text && !content.image && !content.video && !content.audio) {
    return { type: "text", content };
  }

  if (typeof conn.waUploadToServer !== "function") {
    throw new Error("Upload function (waUploadToServer) unavailable on this connection.");
  }

  const final = await finalizeMedia(content);
  const generated = await generateWAMessageContent(final, {
    upload: conn.waUploadToServer,
    mediaUploadTimeoutMs: 120000,
  });

  const key = Object.keys(generated || {}).find((k) => /^(image|video|audio)Message$/.test(k));
  const media = key ? generated[key] : null;
  if (!media || !media.mediaKey || !(media.directPath || media.url)) {
    throw new Error("Media upload failed (no mediaKey/directPath). Please try again.");
  }

  dbg("media uploaded:", key, media.mimetype, media.fileLength?.toString?.());
  return { type: key.replace("Message", ""), generated, content: final };
}

/**
 * Returns a copy of `message` whose prototype carries `{ [mediaKey]: mediaObject }`.
 * Property reads (message.imageMessage) see the media, so Baileys sets the
 * correct stanza `type` / `mediatype`. protobuf encoding only writes OWN
 * properties, so the media is not serialised a second time.
 */
function withMediaHint(message, mediaKey, mediaObject) {
  if (!message || !mediaObject) return message;
  const hinted = Object.create({ [mediaKey]: mediaObject });
  for (const k of Object.keys(message)) hinted[k] = message[k];
  return hinted;
}

async function relayWithRetry(conn, jid, message, relayOptions, retries) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await conn.relayMessage(jid, message, relayOptions);
      return;
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt >= retries) throw error;
      await sleep(4500 * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * Send an already prepared status to ONE group.
 * `textContent` (optional) is the styled text payload for text statuses.
 */
export async function sendPreparedGroupStatus(conn, groupJid, prepared, textContent = null, { retries = 3 } = {}) {
  if (!conn) throw new Error("WhatsApp connection unavailable.");

  const jid = String(groupJid || "").trim();
  if (!isValidGroupId(jid)) throw new Error(`Invalid group JID: ${jid}`);

  const messageSecret = randomBytes(32);
  let inner;

  if (prepared.type === "text") {
    const c = textContent || prepared.content;
    const bg = c.backgroundColor || getStatusColor(0);
    const font = Number.isInteger(c.font) ? c.font : 0;

    // backgroundColor / font are OPTIONS in Baileys (not content fields).
    const generated = await generateWAMessageContent(
      { text: c.text },
      { upload: conn.waUploadToServer, backgroundColor: bg, font }
    );
    inner = { ...generated };

    // safety net for Baileys builds that ignore the options
    const ext = inner.extendedTextMessage;
    if (ext) {
      const argb = hexToArgb(bg);
      if (argb !== undefined) ext.backgroundArgb = argb;
      ext.font = font;
    }
  } else {
    inner = { ...prepared.generated };
  }

  delete inner.messageContextInfo;
  inner.messageContextInfo = { messageSecret };

  const innerType = Object.keys(inner).find((k) => k === "conversation" || k.endsWith("Message"));
  if (!innerType) throw new Error("Prepared status message type unavailable.");

  const statusContent = {
    messageContextInfo: { messageSecret },
    groupStatusMessageV2: { message: inner },
  };

  const generatedMessage = generateWAMessageFromContent(jid, statusContent, {
    userJid: conn.user?.id,
  });
  if (!generatedMessage?.message) throw new Error("Failed to generate group status message.");

  const messageId =
    generatedMessage.key?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let relayPayload = generatedMessage.message;
  if (prepared.type !== "text" && MEDIA_HINT) {
    relayPayload = withMediaHint(relayPayload, `${prepared.type}Message`, inner[`${prepared.type}Message`]);
  }

  await relayWithRetry(conn, jid, relayPayload, { messageId }, retries);
  dbg("sent", prepared.type, "->", jid, messageId);

  return { messageId, mediaMessage: inner, key: generatedMessage.key };
}

/** Single-group helper (kept for backwards compatibility). */
export async function sendGroupStatus(conn, groupJid, content) {
  const prepared = await prepareGroupStatus(conn, content);
  const textContent = prepared.type === "text" ? content : null;
  return sendPreparedGroupStatus(conn, groupJid, prepared, textContent);
}

/** Single-group send with rate-limit retry (used by .swgcv2). */
export async function sendGroupStatusWithRetry(conn, groupJid, content, { retries = 3, baseDelay = 2500 } = {}) {
  const payload = content?.text ? styleTextContent(content, randomIndex()) : content;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await sendGroupStatus(conn, groupJid, payload);
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err) || attempt >= retries) break;
      await sleep(baseDelay * (attempt + 1));
    }
  }
  throw lastErr;
}

/**
 * Broadcast one status to many groups.
 * Media is uploaded once. Text gets a different background colour per group.
 */
export async function broadcastGroupStatus(conn, groupIds, content, opts = {}) {
  const {
    delayMin = 1400,
    delayMax = 2600,
    retries = 3,
    backoff = 5000,
    names = {},
    rotateFont = false,
    colorOffset = randomIndex(),
    onProgress = null,
  } = opts;

  const prepared = await prepareGroupStatus(conn, content);
  const result = {
    total: groupIds.length,
    success: 0,
    failed: 0,
    rateLimited: 0,
    failures: [],
    type: prepared.type,
  };

  for (let i = 0; i < groupIds.length; i++) {
    const gid = groupIds[i];
    const styled =
      prepared.type === "text"
        ? styleTextContent(content, colorOffset + i, { rotateFont })
        : null;

    let ok = false;
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await sendPreparedGroupStatus(conn, gid, prepared, styled, { retries: 0 });
        ok = true;
        break;
      } catch (err) {
        lastErr = err;
        if (!isRateLimitError(err) || attempt >= retries) break;
        result.rateLimited++;
        const wait = backoff * (attempt + 1);
        console.warn(`[gstatus] rate-overlimit ${gid}; retry ${attempt + 1}/${retries} in ${wait}ms`);
        await sleep(wait);
      }
    }

    if (ok) {
      result.success++;
    } else {
      result.failed++;
      const reason = String(lastErr?.message || lastErr || "unknown");
      result.failures.push({ id: gid, name: names[gid] || gid, error: reason });
      console.error(`[gstatus] failed for ${gid}:`, reason);
    }

    if (onProgress) {
      try { await onProgress(i + 1, result); } catch {}
    }

    if (i < groupIds.length - 1) await sleep(randomBetween(delayMin, delayMax));
  }

  return result;
}

export { TEXT_STATUS_COLORS, STATUS_FONTS };
