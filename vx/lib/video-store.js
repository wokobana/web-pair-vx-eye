import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import axios from "axios";

/*
 * Menu video + Welcome videos ka central manager.
 * Config file: media/videos.json  (URL yahan daalo)
 * Local files: media/menu.mp4, media/welcome-<slot>.mp4, media/welcome.mp4
 */

const MEDIA_DIR = path.join(process.cwd(), "media");
const CONFIG_FILE = path.join(MEDIA_DIR, "videos.json");
const MAX_BYTES = 60 * 1024 * 1024;

export const MENU_VIDEO_FILE = path.join(MEDIA_DIR, "menu.mp4");
export const welcomeSlotFile = (n) => path.join(MEDIA_DIR, `welcome-${n}.mp4`);
const LEGACY_WELCOME = path.join(MEDIA_DIR, "welcome.mp4");

/* ---------- PER-BOT STORAGE ----------
 * Har connected bot number ka apna folder: media/bots/<number>/
 * Ek bot ka video badalne se dusre bot ka video nahi badalta.
 * Agar bot ne apna video set nahi kiya to global default (media/) padha jata hai.
 */
function cleanBot(botNumber) {
  const n = String(botNumber || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  return n || "";
}
function botDir(botNumber) {
  const n = cleanBot(botNumber);
  return n ? path.join(MEDIA_DIR, "bots", n) : MEDIA_DIR;
}
const botSlotFile = (botNumber, n) => path.join(botDir(botNumber), `welcome-${n}.mp4`);
const botMenuFile = (botNumber) => path.join(botDir(botNumber), "menu.mp4");
const botConfigFile = (botNumber) => path.join(botDir(botNumber), "videos.json");

export function readConfig(botNumber = "") {
  const own = cleanBot(botNumber) ? botConfigFile(botNumber) : null;
  return readConfigFile(own && fs.existsSync(own) ? own : CONFIG_FILE);
}

function readConfigFile(CONFIG_FILE) {
  const fallback = { menu: { url: "" }, welcome: { mode: "random", slots: [] } };
  let txt = "";
  try { txt = fs.readFileSync(CONFIG_FILE, "utf8"); } catch { return fallback; }
  try {
    return JSON.parse(txt);
  } catch (e1) {
    // comma bhool gaye ho to khud theek karke padho
    try {
      const fixed = txt
        .replace(/\}(\s*)\{/g, "},$1{")
        .replace(/,(\s*[}\]])/g, "$1");
      const cfg = JSON.parse(fixed);
      console.warn("[video-store] videos.json me comma ki galti thi, auto-fix se padha gaya");
      return cfg;
    } catch (e2) {
      console.error("[video-store] videos.json INVALID:", e2?.message || e2);
      return fallback;
    }
  }
}

export function writeConfig(cfg, botNumber = "") {
  const file = cleanBot(botNumber) ? botConfigFile(botNumber) : CONFIG_FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

/* url -> buffer (memory cache, taaki har baar download na ho) */
const urlCache = new Map();
async function fetchUrl(url) {
  if (urlCache.has(url)) return urlCache.get(url);
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
  });
  const buf = Buffer.from(res.data);
  if (!buf.length) throw new Error("empty video");
  urlCache.set(url, buf);
  return buf;
}

export function clearUrlCache() {
  urlCache.clear();
}

function readFileSafe(file) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return fs.readFileSync(file);
  } catch {}
  return null;
}

/* Audio hata do (video bilkul silent) - ffmpeg na ho to original hi rahega */
const silentCache = new WeakMap();
export function stripAudio(buf) {
  if (silentCache.has(buf)) return Promise.resolve(silentCache.get(buf));
  return new Promise((resolve) => {
    let bin = "ffmpeg";
    try {
      // eslint-disable-next-line no-undef
      const p = process.env.FFMPEG_PATH;
      if (p) bin = p;
    } catch {}
    const tmpIn = path.join(MEDIA_DIR, `.tmp-in-${Date.now()}.mp4`);
    const tmpOut = path.join(MEDIA_DIR, `.tmp-out-${Date.now()}.mp4`);
    const cleanup = () => {
      for (const f of [tmpIn, tmpOut]) try { fs.unlinkSync(f); } catch {}
    };
    try {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      fs.writeFileSync(tmpIn, buf);
      const ff = spawn(bin, ["-y", "-i", tmpIn, "-an", "-c:v", "copy", "-movflags", "+faststart", tmpOut]);
      ff.on("error", () => { cleanup(); resolve(buf); });
      ff.on("close", (code) => {
        let out = buf;
        if (code === 0) {
          const r = readFileSafe(tmpOut);
          if (r) out = r;
        }
        cleanup();
        silentCache.set(buf, out);
        resolve(out);
      });
    } catch {
      cleanup();
      resolve(buf);
    }
  });
}

/* ---------------------------- MENU VIDEO ---------------------------- */

const menuCaches = new Map(); // botNumber -> { key, buf }
export async function getMenuVideo(botNumber = "") {
  const bn = cleanBot(botNumber);
  const cfg = readConfig(botNumber);
  const url = String(cfg?.menu?.url || "").trim();
  let raw = null;

  if (/^https?:\/\//i.test(url)) {
    try { raw = await fetchUrl(url); }
    catch (e) { console.warn("[video-store] menu url failed:", e?.message || e); }
  }
  if (!raw && bn) raw = readFileSafe(botMenuFile(bn));
  if (!raw) raw = readFileSafe(MENU_VIDEO_FILE);
  if (!raw) return null;

  const key = raw.length + ":" + url;
  const cached = menuCaches.get(bn);
  if (cached?.key === key) return cached.buf;
  const buf = await stripAudio(raw);
  menuCaches.set(bn, { key, buf });
  return buf;
}

/* --------------------------- WELCOME VIDEOS -------------------------- */

let seqIndex = 0;

function listSlots(botNumber = "") {
  const cfg = readConfig(botNumber);
  const slots = Array.isArray(cfg?.welcome?.slots) ? cfg.welcome.slots : [];
  return { cfg, slots };
}

const slotPath = (botNumber, n) => {
  const bn = cleanBot(botNumber);
  if (bn && fs.existsSync(botSlotFile(bn, n))) return botSlotFile(bn, n);
  if (bn && fs.existsSync(botConfigFile(bn))) return null; // bot ka apna config hai -> global file mat uthao
  return fs.existsSync(welcomeSlotFile(n)) ? welcomeSlotFile(n) : null;
};

export async function getWelcomeVideo(limit = 0, botNumber = "") {
  const { cfg, slots } = listSlots(botNumber);
  const hasOwnConfig = Boolean(cleanBot(botNumber)) && fs.existsSync(botConfigFile(botNumber));
  const candidates = [];

  for (const s of slots) {
    const n = Number(s?.slot);
    if (!n) continue;
    const url = String(s?.url || "").trim();
    if (/^https?:\/\//i.test(url)) candidates.push({ n, url });
    else if (slotPath(botNumber, n)) candidates.push({ n, file: slotPath(botNumber, n) });
    else if (n === 1 && !hasOwnConfig && fs.existsSync(LEGACY_WELCOME)) candidates.push({ n, file: LEGACY_WELCOME });
  }

  candidates.sort((a, b) => a.n - b.n);
  const lim = Number(limit) || 0;
  if (lim > 0 && candidates.length > lim) candidates.length = lim; // sirf pehle N videos ON

  if (!candidates.length && !hasOwnConfig && fs.existsSync(LEGACY_WELCOME)) {
    candidates.push({ n: 1, file: LEGACY_WELCOME });
  }
  if (!candidates.length) return null;

  const pickOrder = [];
  if (cfg?.welcome?.mode === "sequential") {
    const start = seqIndex++ % candidates.length;
    for (let i = 0; i < candidates.length; i++) pickOrder.push(candidates[(start + i) % candidates.length]);
  } else {
    const first = Math.floor(Math.random() * candidates.length);
    for (let i = 0; i < candidates.length; i++) pickOrder.push(candidates[(first + i) % candidates.length]);
  }

  // jo video load na ho usse skip karke agla try karo
  for (const c of pickOrder) {
    try {
      const buf = c.url ? await fetchUrl(c.url) : readFileSafe(c.file);
      if (buf) return buf;
    } catch (e) {
      console.warn(`[video-store] welcome slot ${c.n} failed:`, e?.message || e);
    }
  }
  return null;
}

/* WhatsApp se set kiya hua video save karo - sirf is bot number ke folder me */
export function saveWelcomeSlot(n, buffer, botNumber = "") {
  const bn = cleanBot(botNumber);
  const dir = botDir(bn);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(bn ? botSlotFile(bn, n) : welcomeSlotFile(n), buffer);
  if (!bn && Number(n) === 1) fs.writeFileSync(LEGACY_WELCOME, buffer);

  // bot ka apna config: global config ki copy se shuru karo (pehli baar), phir sirf isi me likho
  const cfg = JSON.parse(JSON.stringify(readConfig(bn)));
  cfg.welcome = cfg.welcome || { mode: "random", slots: [] };
  cfg.welcome.slots = Array.isArray(cfg.welcome.slots) ? cfg.welcome.slots : [];
  let slot = cfg.welcome.slots.find((s) => Number(s.slot) === Number(n));
  if (!slot) {
    slot = { slot: Number(n), url: "" };
    cfg.welcome.slots.push(slot);
    cfg.welcome.slots.sort((a, b) => a.slot - b.slot);
  }
  slot.url = "";
  writeConfig(cfg, bn);
}

export function saveMenuVideo(buffer, botNumber = "") {
  const bn = cleanBot(botNumber);
  fs.mkdirSync(botDir(bn), { recursive: true });
  fs.writeFileSync(bn ? botMenuFile(bn) : MENU_VIDEO_FILE, buffer);
  const cfg = JSON.parse(JSON.stringify(readConfig(bn)));
  cfg.menu = { ...(cfg.menu || {}), url: "" };
  writeConfig(cfg, bn);
  menuCaches.delete(bn);
}

export function countAvailableWelcome(botNumber = "") {
  return describeSlots(botNumber).filter((r) => r.src !== "EMPTY").length;
}

export function describeSlots(botNumber = "") {
  const { slots } = listSlots(botNumber);
  const hasOwnConfig = Boolean(cleanBot(botNumber)) && fs.existsSync(botConfigFile(botNumber));
  return slots.map((s) => {
    const n = Number(s.slot);
    const url = String(s.url || "").trim();
    const src = url ? "URL" : slotPath(botNumber, n) || (n === 1 && !hasOwnConfig && fs.existsSync(LEGACY_WELCOME)) ? "FILE" : "EMPTY";
    return { slot: n, src };
  });
}
