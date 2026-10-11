// Group activity counter (.topchat) + AFK system (.afk)
// handier.js har group message par onMessage() chalata hai.
const config = require('../config');
const db = require('./db');

const pending = new Map();          // "session|groupJid" -> { userJid: newMessages }
let timer = null;

function flush() {
  for (const [k, inc] of pending) {
    const [session, jid] = k.split('|');
    const cur = { ...(db.group(session, jid).activity || {}) };
    for (const [u, n] of Object.entries(inc)) cur[u] = (cur[u] || 0) + n;
    db.setGroup(session, jid, 'activity', cur);
  }
  pending.clear();
}

function track(x) {
  const k = `${x.session}|${x.jid}`;
  const m = pending.get(k) || {};
  m[x.sender] = (m[x.sender] || 0) + 1;
  pending.set(k, m);
  if (!timer) {
    timer = setInterval(flush, 20000);
    if (timer.unref) timer.unref();
  }
}

function top(session, jid, n = 10) {
  flush();
  return Object.entries(db.group(session, jid).activity || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function resetGroup(session, jid) {
  pending.delete(`${session}|${jid}`);
  db.setGroup(session, jid, 'activity', {});
}

// ---------- AFK ----------
function setAfk(session, jid, reason) {
  db.setG(session, 'afk', { ...db.getG(session, 'afk', {}), [jid]: { reason, since: Date.now() } });
}

function ago(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} second`;
  if (s < 3600) return `${Math.floor(s / 60)} minute`;
  if (s < 86400) return `${Math.floor(s / 3600)} ghante ${Math.floor((s % 3600) / 60)} minute`;
  return `${Math.floor(s / 86400)} din`;
}

async function onMessage(x) {
  if (!x.isGroup) return;
  track(x);

  const afk = db.getG(x.session, 'afk', {});
  if (!Object.keys(afk).length) return;

  // AFK wala wapas aaya
  const isAfkCmd = x.text.toLowerCase().startsWith(`${config.prefix}afk`);
  if (afk[x.sender] && !isAfkCmd) {
    const info = afk[x.sender];
    const next = { ...afk };
    delete next[x.sender];
    db.setG(x.session, 'afk', next);
    await x.send(
      { text: `👋 Welcome back @${x.senderNum}!\n😴 Aap *${ago(Date.now() - info.since)}* AFK the.`, mentions: [x.sender] },
      { quoted: x.m },
    );
  }

  // Kisi AFK member ko tag / reply kiya
  const hit = new Set([...(x.mentioned || []), x.quoted?.sender].filter(Boolean));
  for (const j of hit) {
    if (j === x.sender || !afk[j]) continue;
    await x.send(
      { text: `😴 @${j.split('@')[0]} abhi *AFK* hai.\n📝 Wajah: ${afk[j].reason}\n⏱️ ${ago(Date.now() - afk[j].since)} se.`, mentions: [j] },
      { quoted: x.m },
    );
  }
}

module.exports = { onMessage, top, resetGroup, setAfk, flush };
