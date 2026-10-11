const db = require('./db');
const config = require('../config');
const { pick } = require('./common');

const EMOJIS = ['❤️', '🔥', '😍', '😂', '👍', '🥰', '✨', '💯', '🎉', '😎'];

function channelJidOf(session) {
  return /0{8,}/.test(config.channelJid) ? db.getG(session, 'channelJid', '') : config.channelJid;
}

// Normal chats me auto react (.autoreact on)
function reactMessage(sock, m, session) {
  if (m.key.fromMe || !db.getG(session, 'autoreact', false)) return;
  sock.sendMessage(m.key.remoteJid, { react: { text: pick(EMOJIS), key: m.key } }).catch(() => {});
}

// Channel ke naye post (text/photo/video/voice sab) par auto react.
// WhatsApp me ek number ek post par sirf 1 react de sakta hai, isliye total react = jitne number bot se
// connected hain. Har number apna alag random emoji + random delay (natural dikhe, ban risk kam) se react karta hai.
const reacted = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function channelIds(session) {
  return [channelJidOf(session), ...(config.channels || []).map((c) => c.jid)].filter(Boolean);
}

async function reactChannel(sock, m, session) {
  try {
    if (!config.autoReactChannel || m.key.fromMe) return;
    const jid = m.key.remoteJid;
    if (!channelIds(session).includes(jid)) return;
    const postId = m.key.server_id || m.key.id;
    const once = `${session}|${jid}|${postId}`;
    if (reacted.has(once)) return;
    reacted.add(once);
    if (reacted.size > 5000) reacted.delete(reacted.values().next().value);

    const [min, max] = config.channelReactDelaySec || [2, 90];
    await sleep(rand(min, max) * 1000);
    const emojis = config.channelReactEmojis?.length ? config.channelReactEmojis : EMOJIS;
    await sock.newsletterReactMessage(jid, String(postId), pick(emojis));
  } catch (e) {
    console.error('[channel] react fail:', e.message);
  }
}

// Channel ke live updates subscribe (iske bina naye post ka event nahi aata). Subscription expire hoti hai, isliye renew.
function subscribeChannels(sock, session) {
  if (typeof sock.subscribeNewsletterUpdates !== 'function') return;
  const ids = [...new Set(channelIds(session).filter((j) => j.endsWith('@newsletter')))];
  let timer;
  const run = async () => {
    let next = 240;
    for (const jid of ids) {
      try {
        const r = await sock.subscribeNewsletterUpdates(jid);
        const d = Number(r?.duration);
        if (d > 30) next = Math.min(next, Math.floor(d * 0.8));
      } catch (e) { console.error('[channel] subscribe fail:', e.message); }
    }
    timer = setTimeout(run, next * 1000);
  };
  run();
  sock.ev.on('connection.update', (u) => { if (u.connection === 'close') clearTimeout(timer); });
}

// Pair hote hi config.channels ke saare (2) channel auto follow
function channelList() {
  const list = (config.channels || []).filter((c) => c && (c.jid || c.invite));
  if (!list.length && config.channelJid && !/0{8,}/.test(config.channelJid)) list.push({ jid: config.channelJid, invite: config.channelInvite });
  return list;
}
async function followChannel(sock, session) {
  // Live-subscribe sirf tab jab config.channelLiveSubscribe = true (default OFF: link/connect flow ko bilkul nahi chhedta)
  if (config.autoReactChannel && config.channelLiveSubscribe) setTimeout(() => { try { subscribeChannels(sock, session); } catch (e) { console.error('[channel] subscribe:', e.message); } }, 60000);
  if (!config.autoFollowChannel) return;
  const done = db.getG(session, 'followedList', []);
  for (const c of channelList()) {
    const idKey = c.jid || `invite:${c.invite}`;
    if (done.includes(idKey)) continue;
    try {
      let jid = c.jid;
      if (!jid && c.invite) {
        const meta = await sock.newsletterMetadata('invite', c.invite);
        jid = meta.id;
      }
      if (!jid) continue;
      await sock.newsletterFollow(jid);
      done.push(idKey);
      db.setG(session, 'followedList', [...done]);
      console.log(`[channel] ${session} followed ${jid}`);
    } catch (e) {
      console.error('[channel] follow fail:', e.message);
    }
  }
}

module.exports = { reactMessage, reactChannel, followChannel };
