// YouTube downloader helper (yt-dlp) — song / play / video / ytmp3 commands ise use karte hain.
//
// "Sign in to confirm you're not a bot" = YouTube ne SERVER ke IP ko bot maan liya hai.
// Ye code ki galti nahi hoti; isliye yahan ye sab options diye gaye hain:
//   1. yt-dlp (latest) — bot khud bin/yt-dlp download kar leta hai (ensureYtDlp)
//   2. cookies.txt      — project folder me rakh do (ya config.yt.cookies / env YT_COOKIES)
//   3. proxy            — config.yt.proxy ya env YT_PROXY (residential / home IP best)
//   4. IPv4 force, JS runtime (node), taaza yt-dlp auto-update
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');

const ROOT = path.join(__dirname, '..');
const BIN_DIR = path.join(ROOT, 'bin');
const IS_WIN = process.platform === 'win32';
const LOCAL_BIN = path.join(BIN_DIR, IS_WIN ? 'yt-dlp.exe' : 'yt-dlp');
const yt = () => config.yt || {};

// ---------------------------------------------------------------- yt-dlp detect
let found = null; // { bin, version, jsRuntimes, remoteComponents }

function probe(bin) {
  try {
    if (bin.includes(path.sep) && !fs.existsSync(bin)) return null;
    const v = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000 });
    if (v.error || v.status !== 0) return null;
    const help = spawnSync(bin, ['--help'], { encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 }).stdout || '';
    return {
      bin,
      version: String(v.stdout).trim(),
      jsRuntimes: help.includes('--js-runtimes'),
      remoteComponents: help.includes('--remote-components'),
    };
  } catch { return null; }
}

function detect(force = false) {
  if (found && !force) return found;
  const list = [process.env.YT_DLP_PATH, LOCAL_BIN, ...(IS_WIN ? ['yt-dlp.exe', 'yt-dlp'] : ['yt-dlp'])].filter(Boolean);
  for (const bin of list) {
    const r = probe(bin);
    if (r) { found = r; return r; }
  }
  return null;
}

const hasYtDlp = () => detect()?.bin || null;
const ytDlpInfo = () => detect();

function cookiesFile() {
  const c = yt().cookies || process.env.YT_COOKIES || path.join(ROOT, 'cookies.txt');
  const full = path.isAbsolute(c) ? c : path.join(ROOT, c);
  return fs.existsSync(full) ? full : null;
}
const proxyUrl = () => yt().proxy || process.env.YT_PROXY || '';

// ---------------------------------------------------------------- auto install / update
async function download(url, dest) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 100000) throw new Error('file bahut chhoti hai (download adhura)');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, buf, { mode: 0o755 });
  fs.renameSync(tmp, dest);
  try { fs.chmodSync(dest, 0o755); } catch {}
}

function assetNames() {
  if (IS_WIN) return ['yt-dlp.exe'];
  if (process.platform === 'darwin') return ['yt-dlp_macos'];
  if (process.platform === 'linux') {
    const standalone = { x64: 'yt-dlp_linux', arm64: 'yt-dlp_linux_aarch64', arm: 'yt-dlp_linux_armv7l' }[process.arch];
    return [standalone, 'yt-dlp'].filter(Boolean); // 'yt-dlp' = python zipapp (python3 chahiye)
  }
  return ['yt-dlp']; // android/termux etc. (python3 chahiye)
}

async function installYtDlp() {
  let last;
  for (const asset of assetNames()) {
    try {
      await download(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`, LOCAL_BIN);
      const r = detect(true);
      if (r && r.bin === LOCAL_BIN) return r;
      fs.rmSync(LOCAL_BIN, { force: true });
    } catch (e) { last = e; }
  }
  throw new Error(`yt-dlp install nahi ho paya${last ? ': ' + last.message : ''}`);
}

// Bot start hote hi: yt-dlp na ho to laao, purana (3 din+) ho to update karo. Background me chalta hai.
async function ensureYtDlp() {
  if (yt().autoInstall === false || process.env.YT_DLP_AUTOINSTALL === '0') return null;
  const cur = detect();
  if (cur && cur.bin !== LOCAL_BIN) return cur;               // system ka yt-dlp: unhe chhedo mat
  if (cur && cur.bin === LOCAL_BIN) {
    const ageDays = (Date.now() - fs.statSync(LOCAL_BIN).mtimeMs) / 86400000;
    if (ageDays < 3) return cur;
  }
  try {
    const r = await installYtDlp();
    console.log(`[yt-dlp] ready: ${r.version}`);
    return r;
  } catch (e) {
    console.error('[yt-dlp]', e.message);
    return cur;
  }
}

async function updateYtDlp() {
  const cur = detect(true);
  if (cur && cur.bin !== LOCAL_BIN) {
    const r = spawnSync(cur.bin, ['-U'], { encoding: 'utf8', timeout: 120000 });
    detect(true);
    return (r.stdout || r.stderr || 'done').toString().trim().slice(-300);
  }
  const r = await installYtDlp();
  return `yt-dlp ${r.version} install/update ho gaya.`;
}

// ---------------------------------------------------------------- download
function runBinary(bin, args, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const err = [];
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      p.kill('SIGKILL');
      reject(new Error('yt-dlp timeout (download bahut der laga raha hai)'));
    }, timeoutMs);
    p.stderr.on('data', (d) => err.push(d));
    p.stdout.on('data', () => {});
    p.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    p.on('close', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code === 0) return resolve();
      const text = Buffer.concat(err).toString().trim();
      const msg = text.split('\n').filter((l) => /ERROR/i.test(l)).pop() || text.slice(-400) || `yt-dlp exited ${code}`;
      reject(new Error(msg.replace(/^ERROR:\s*(\[youtube\]\s*)?/i, '').slice(0, 400)));
    });
  });
}

function buildArgs(info, kind, outTemplate) {
  const a = [
    '--no-playlist', '--no-warnings', '--no-progress', '--no-part',
    '--retries', '3', '--fragment-retries', '3', '--socket-timeout', '25',
    '-o', outTemplate,
  ];
  if (yt().forceIpv4 !== false) a.push('--force-ipv4');
  const cookies = cookiesFile();
  if (cookies) a.push('--cookies', cookies);
  const proxy = proxyUrl();
  if (proxy) a.push('--proxy', proxy);
  if (yt().playerClients) a.push('--extractor-args', `youtube:player_client=${yt().playerClients}`);
  if (info.jsRuntimes) a.push('--js-runtimes', `node:${process.execPath}`);
  if (info.remoteComponents && yt().remoteComponents !== false) a.push('--remote-components', 'ejs:github');

  if (kind === 'audio') {
    a.push('-f', '140/bestaudio[ext=m4a]/bestaudio/best', '--max-filesize', '40M');
  } else {
    // Merge se bachne ke liye ek hi file wala mp4 format
    a.push('-f', 'b[ext=mp4][vcodec^=avc1][height<=720]/18/b[ext=mp4][height<=720]/b[height<=720]/b', '--max-filesize', '80M');
  }
  return a;
}

const MIME = { m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'audio/webm', opus: 'audio/ogg; codecs=opus', ogg: 'audio/ogg', mp3: 'audio/mpeg', mkv: 'video/x-matroska' };

// url -> { buffer, mime, ext }   (yt-dlp na ho to null; fail ho to error throw)
async function ytDlpDownload(url, kind = 'video') {
  const info = detect();
  if (!info) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miku-yt-'));
  try {
    await runBinary(info.bin, [...buildArgs(info, kind, path.join(dir, 'media.%(ext)s')), url]);
    const file = fs.readdirSync(dir).find((f) => f.startsWith('media.') && !f.endsWith('.part'));
    if (!file) throw new Error('yt-dlp ne file nahi banayi');
    const ext = path.extname(file).slice(1).toLowerCase();
    const buffer = fs.readFileSync(path.join(dir, file));
    if (!buffer.length) throw new Error('khaali file aayi');
    return { buffer, ext, mime: MIME[ext] || (kind === 'audio' ? 'audio/mp4' : 'video/mp4') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Error ko saaf Hinglish message me badlo (user ko kya karna hai)
function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (/not a bot|sign in to confirm|confirm you.?re not/i.test(m)) {
    return 'YouTube ne bot ke server ka IP block kar diya hai (bot-check).\n' +
      '👑 Owner: bot folder me *cookies.txt* daalo ya config.js me yt.proxy set karo, phir .ytupdate chalao. Detail: .ytcheck';
  }
  if (/private video|members-only|video unavailable|removed/i.test(m)) return 'Ye video available nahi hai (private/removed).';
  if (/age.?restrict|inappropriate/i.test(m)) return 'Ye video age-restricted hai (cookies.txt chahiye).';
  if (/HTTP Error 429|too many requests/i.test(m)) return 'YouTube ne abhi limit laga di hai. Thodi der baad try karo.';
  if (/timeout/i.test(m)) return 'Download me bahut time lag raha hai. Chhota song try karo.';
  if (/max-filesize|larger than/i.test(m)) return 'File bahut badi hai. Chhota/short version try karo.';
  return m.slice(0, 200) || 'download error';
}

module.exports = {
  hasYtDlp, ytDlpInfo, ytDlpDownload, ensureYtDlp, updateYtDlp, friendlyError,
  cookiesFile, proxyUrl, LOCAL_BIN,
};
