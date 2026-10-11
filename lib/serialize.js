// Message ko easy object me badalta hai (x)
const { extractMessageContent, jidNormalizedUser, getContentType, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('../config');
const dbStore = require('./db');

const metaCache = new Map();

function cleanJid(v) {
  if (!v || typeof v !== 'string') return null;
  try { return jidNormalizedUser(v); } catch { return v; }
}

function participantJids(p) {
  const out = new Set();
  for (const v of [p?.id, p?.jid, p?.lid, p?.phoneNumber]) {
    const j = cleanJid(v);
    if (j) out.add(j);
  }
  return out;
}

function adminJids(meta) {
  const out = new Set();
  for (const p of meta?.participants || []) {
    if (!(p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin === true)) continue;
    for (const j of participantJids(p)) out.add(j);
  }
  return [...out];
}

function senderAliases(m, ctx, sender) {
  const out = new Set([sender]);
  for (const v of [m.key?.participant, m.key?.participantAlt, ctx?.participant, ctx?.participantAlt]) {
    const j = cleanJid(v);
    if (j) out.add(j);
  }
  return [...out];
}

const META_TTL = 60000;      // cache 60s (group events / promote-demote par cache khud clear hota hai)
const META_TIMEOUT = 5000;   // groupMetadata atke to 5s se zyada intezaar nahi (pehle 60s tak rukta tha => menu late)
const metaInflight = new Map();

async function groupMeta(sock, jid, session, force = false) {
  const k = `${session}:${jid}`;
  const c = metaCache.get(k);
  if (!force && c && Date.now() - c.t < META_TTL) return c.v;
  if (!force && metaInflight.has(k)) return metaInflight.get(k);

  let timer;
  const p = Promise.race([
    sock.groupMetadata(jid),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('groupMetadata timeout')), META_TIMEOUT); }),
  ])
    .then((v) => { metaCache.set(k, { v, t: Date.now() }); return v; })
    .catch((e) => { if (c) return c.v; throw e; })   // fail ho to purana cache use karo
    .finally(() => { clearTimeout(timer); metaInflight.delete(k); });
  metaInflight.set(k, p);
  return p;
}
// Connect hote hi saare groups ek saath cache me daal do (ek hi request)
function primeMeta(session, groups) {
  for (const [jid, v] of Object.entries(groups || {})) metaCache.set(`${session}:${jid}`, { v, t: Date.now() });
}
const clearMeta = (jid, session) => metaCache.delete(`${session}:${jid}`);
// Sirf taaza (TTL ke andar) cache do; purana ho to undefined => Baileys khud fetch karega
const getCachedMeta = (session, jid) => {
  const c = metaCache.get(`${session}:${jid}`);
  return c && Date.now() - c.t < META_TTL ? c.v : undefined;
};

const textOf = (c, t) => {
  const v = c[t];
  if (typeof v === 'string') return v;
  // Button/list ka jawab -> command text (jaise ".video https://youtu.be/xxxx")
  if (t === 'buttonsResponseMessage') return v?.selectedButtonId || v?.selectedDisplayText || '';
  if (t === 'templateButtonReplyMessage') return v?.selectedId || '';
  if (t === 'listResponseMessage') return v?.singleSelectReply?.selectedRowId || '';
  if (t === 'interactiveResponseMessage') {
    try { return JSON.parse(v?.nativeFlowResponseMessage?.paramsJson || '{}').id || ''; } catch { return ''; }
  }
  return v?.text || v?.caption || '';
};
const MEDIA = /^(image|video|audio|sticker|document)Message$/;

async function serialize(sock, m, session) {
  if (!m.message) return null;
  const jid = m.key.remoteJid;
  if (!jid || jid === 'status@broadcast') return null;
  const content = extractMessageContent(m.message);
  if (!content) return null;

  const mtype = getContentType(content);
  const isGroup = jid.endsWith('@g.us');
  const botId = jidNormalizedUser(sock.user.id);
  const fromMe = !!m.key.fromMe;
  const sender = fromMe ? botId : jidNormalizedUser(m.key.participant || m.key.participantAlt || jid);
  const senderNum = sender.split('@')[0];
  const text = textOf(content, mtype).trim();
  const ctx = (content[mtype] && content[mtype].contextInfo) || {};
  const mentioned = (ctx.mentionedJid || []).map(cleanJid).filter(Boolean);
  const senderIds = senderAliases(m, ctx, sender);

  let quoted = null;
  if (ctx.quotedMessage) {
    const qc = extractMessageContent(ctx.quotedMessage) || ctx.quotedMessage;
    const qt = getContentType(qc);
    const qs = jidNormalizedUser(ctx.participant || ctx.participantAlt || jid);
    quoted = {
      key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant, participantAlt: ctx.participantAlt, fromMe: qs === botId },
      message: ctx.quotedMessage, content: qc, mtype: qt, sender: qs, senderAlt: cleanJid(ctx.participantAlt), text: textOf(qc, qt),
    };
  }

  const isOwner = fromMe || senderIds.some((j) => config.ownerNumber.includes(j.split('@')[0])) || senderNum === session
    || (dbStore.getG(session, 'owners', []) || []).includes(senderNum);

  let meta = null, admins = [];
  if (isGroup) {
    try {
      meta = await groupMeta(sock, jid, session);
      admins = adminJids(meta);
    } catch {}
  }

  const dl = (msg, cnt, t) =>
    downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage })
      .then((buffer) => ({ buffer, type: t, mime: cnt[t]?.mimetype, caption: cnt[t]?.caption || '' }));

  return {
    sock, m, jid, session, isGroup, botId, fromMe, sender, senderNum, text, mtype, content, ctx,
    mentioned, quoted, target: mentioned[0] || quoted?.sender, isOwner, meta, admins,
    senderIds, isAdmin: senderIds.some((j) => admins.includes(j)), isBotAdmin: admins.includes(botId),
    reply: (t, extra = {}) => sock.sendMessage(jid, { text: t, ...extra }, { quoted: m }),
    send: (c, o) => sock.sendMessage(jid, c, o),
    react: (e) => sock.sendMessage(jid, { react: { text: e, key: m.key } }).catch(() => {}),
    // current ya quoted media download
    download: async () => {
      if (MEDIA.test(mtype)) return dl(m, content, mtype);
      if (quoted && MEDIA.test(quoted.mtype)) return dl({ key: quoted.key, message: quoted.message }, quoted.content, quoted.mtype);
      return null;
    },
  };
}

module.exports = { serialize, groupMeta, primeMeta, clearMeta, getCachedMeta, participantJids, adminJids };
