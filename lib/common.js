const fs = require('fs');
const path = require('path');
const config = require('../config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const DEFAULT_TIMEOUT = 25000;
const DEFAULT_RETRIES = 2;

async function request(url, opts = {}, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  let last;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const headers = {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        ...(opts.headers || {}),
      };
      const r = await fetch(url, { ...opts, headers, signal: controller.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      last = e;
      if (attempt < retries) await sleep(800 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last || new Error('Request failed');
}

async function fetchBuffer(url, opts = {}, options = {}) {
  const r = await request(url, opts, options);
  return Buffer.from(await r.arrayBuffer());
}
async function fetchJson(url, opts = {}, options = {}) {
  const r = await request(url, opts, options);
  return r.json();
}
async function fetchText(url, opts = {}, options = {}) {
  const r = await request(url, opts, options);
  return r.text();
}

// "Forwarded from <Channel>" header — menu/channel features only.
function channelCtx(extra = {}) {
  return {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.channelJid,
      newsletterName: config.channelName,
      serverMessageId: -1,
    },
    ...extra,
  };
}

// URL ya local file -> Baileys media source
function mediaSrc(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return { url: src };
  const p = path.resolve(__dirname, '..', src);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

const startTime = Date.now();
function uptime() {
  const s = Math.floor((Date.now() - startTime) / 1000);
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

module.exports = { sleep, pick, request, fetchBuffer, fetchJson, fetchText, channelCtx, mediaSrc, uptime };
