// Main message handler
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');
const db = require('./db');
const plugins = require('./plugins');
const blockDB = require('./blockDB');
const guards = require('./guards');
const autoreact = require('./autoreact');
const activity = require('./activity');
const { serialize, groupMeta, clearMeta, adminJids } = require('./serialize');
const { channelCtx } = require('./common');
const ui = require('./ui');
const vx = require('./vxbridge');

plugins.load();
vx.start();   // VX-MD plugins (menu, group status, welcome, antilink ...) Miku me jodo

const cache = new Map(); // antidelete cache
const cacheMsg = (m) => {
  cache.set(m.key.id, m);
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
};

async function onRevoke(sock, m, session) {
  const id = m.message.protocolMessage.key?.id;
  const old = cache.get(id);
  const jid = m.key.remoteJid;
  if (!old || old.key.fromMe || !db.group(session, jid).antidelete) return;
  const who = jidNormalizedUser(old.key.participant || old.key.remoteJid);
  await sock.sendMessage(jid, { text: `🗑️ *Anti-Delete*\n@${who.split('@')[0]} ne ye message delete kiya:`, mentions: [who] });
  await sock.sendMessage(jid, { forward: old });
}

async function handle(sock, m, session, type) {
  const jid = m.key?.remoteJid;
  if (!jid) return;
  if (jid.endsWith('@newsletter')) { if (type === 'notify') autoreact.reactChannel(sock, m, session); return; }
  if (type !== 'notify' || !m.message) return;

  const proto = m.message.protocolMessage;
  if (proto && (proto.type === 0 || proto.type === 'REVOKE')) return onRevoke(sock, m, session);
  if (db.group(session, jid).antidelete) cacheMsg(m);

  const x = await serialize(sock, m, session);
  if (!x) return;

  // HARD GLOBAL PRIVATE LOCK: in private mode, non-owners get no bot response
  // in groups or private chats (commands, ping, menu, mentions, and passive text
  // replies are all suppressed). The owner can still use `.mode public` to unlock.
  // Read the same VX database used by the `.mode` plugin; fail closed on errors.
  await vx.start();
  if (!x.isOwner && !vx.isPublicMode(session)) return;

  // Har reply/send ke upar owner ka card (naam + number + DP) quote hota hai
  const oq = ui.ownerQuote(sock);
  x.reply = (t, extra = {}) => sock.sendMessage(x.jid, { text: t, ...extra }, { quoted: oq });
  x.send = (c, o) => sock.sendMessage(x.jid, c, o || { quoted: oq });
  x.ownerQuote = oq;

  autoreact.reactMessage(sock, m, session);
  if (blockDB.isBlocked(session, x.senderNum) && !x.isOwner) return;
  if (await guards.runGuards(x)) return;
  vx.runPassive(x).catch((e) => console.error('vx passive:', e?.message || e));   // antilink/antisticker jaise VX protections

  // .topchat counter + .afk system (group messages)
  activity.onMessage(x).catch((e) => console.error('activity:', e.message));

  // bot ko mention kiya -> custom reply (.setmention)
  if (x.isGroup && x.mentioned.includes(x.botId) && !x.text.startsWith(config.prefix)) {
    const msg = db.getG(session, 'mentionMsg', null);
    if (msg) return x.send({ text: msg, contextInfo: channelCtx() }, { quoted: m });
  }

  if (!x.text.startsWith(config.prefix)) return;
  // VX command registry/menu is already awaited above before the private gate.
  const body = x.text.slice(config.prefix.length).trim();
  const name = body.split(/\s+/)[0].toLowerCase();
  const cmd = plugins.get(name);
  if (!cmd) return;
  console.log(`[cmd] ${config.prefix}${name} <- ${x.senderNum}${x.isGroup ? ' (group)' : ''}`);

  // .bangroup (banned group) / .selfgc (self mode group): sirf owner chala sakta hai
  if (x.isGroup && !x.isOwner) {
    if (db.group(session, jid).isBanned) return;
    if ((db.getG(session, 'selfGroups', []) || []).includes(jid)) return;
  }

  x.cmd = name;
  x.prefix = config.prefix;
  x.rest = body.slice(name.length).trim();
  x.args = x.rest ? x.rest.split(/\s+/) : [];

  if (cmd.owner && !x.isOwner) return x.reply('❌ Ye command sirf owner ke liye hai.');
  if (cmd.group && !x.isGroup) return x.reply('❌ Ye command sirf group me chalta hai.');

  // Admin/promote/demote ke turant baad stale metadata se permission fail na ho.
  if (x.isGroup && (cmd.admin || cmd.botAdmin) && (!x.isAdmin || !x.isBotAdmin)) {
    try {
      clearMeta(x.jid, x.session);
      const fresh = await groupMeta(sock, x.jid, x.session, true);
      const freshAdmins = adminJids(fresh);
      x.meta = fresh;
      x.admins = freshAdmins;
      x.isAdmin = x.senderIds.some((j) => freshAdmins.includes(j));
      x.isBotAdmin = freshAdmins.includes(x.botId);
    } catch (e) { console.error('permission refresh:', e.message); }
  }

  if (cmd.admin && !(x.isAdmin || x.isOwner)) return x.reply('❌ Sirf group admin ye command use kar sakta hai.');
  if (cmd.botAdmin && !x.isBotAdmin) return x.reply('❌ Pehle bot ko group admin banao.');

  try { await cmd.run(x); }
  catch (e) { console.error(`cmd ${name}:`, e.message); x.reply('❌ Error: ' + e.message); }
}

module.exports = (sock, session) => {
  // Har message alag chalta hai — koi slow command/group-metadata baaki messages (menu) ko nahi rokta.
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const m of messages) {
      handle(sock, m, session, type).catch((e) => console.error('handler:', e.message));
    }
  });
};
