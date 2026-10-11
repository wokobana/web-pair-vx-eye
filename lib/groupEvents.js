// Welcome / Goodbye (member DP + text), antiremove, group update notices
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');
const db = require('./db');
const { clearMeta } = require('./serialize');
const { sendWelcome, sendGoodbye } = require('./welcome');
const { mediaSrc } = require('./common');
const vx = require('./vxbridge');


// Ek hi join/leave do raaston (group event + stub message) se aaye to sirf ek baar chale
const recent = new Map();
const firstTime = (id, jid, action) => {
  const k = `${id}|${String(jid).split('@')[0].split(':')[0]}|${action}`;
  const now = Date.now();
  for (const [kk, t] of recent) if (now - t > 60000) recent.delete(kk);
  if (recent.has(k)) return false;
  recent.set(k, now);
  return true;
};
const evSeen = new Map();   // group|action -> last time asli 'group-participants.update' aaya
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const numOf = (p) => String(typeof p === 'string' ? p : (p?.phoneNumber || p?.jid || p?.id || p?.lid || '')).split('@')[0].split(':')[0];

module.exports = (sock, session) => {
  const botId = () => jidNormalizedUser(sock.user.id);

  sock.ev.on('group-participants.update', async ({ id, author, participants, action }) => {
    try {
      evSeen.set(`${id}|${action}`, Date.now());
      console.log(`[group-event] ${session} ${action} ${id} ->`, (participants || []).map(numOf).join(','));
      clearMeta(id, session);
      const g = db.group(session, id);
      const a = author ? jidNormalizedUser(author) : '';

      // Welcome / goodbye / promote / demote ab VX-MD ke handler se jaate hain.
      // Sirf antiremove Miku ka hi hai: agar wo member ko wapas add kar de to goodbye nahi jata.
      let skipVx = false;
      for (const p of participants) {
        const jid = jidNormalizedUser(typeof p === 'string' ? p : (p.id || p.jid || p.lid));
        if (!jid) continue;
        const user = jid.split('@')[0];

        if (action === 'remove') {
          // antiremove: owner/bot ke alawa koi member hataye to wapas add
          const aNum = a.split('@')[0];
          const byOther = a && a !== botId() && a !== jid && !config.ownerNumber.includes(aNum) && aNum !== session;
          if (g.antiremove && byOther) {
            skipVx = true;
            await sock.groupParticipantsUpdate(id, [jid], 'add').catch(() => {});
            await sock.sendMessage(id, { text: `🛡️ *Anti-Remove*: @${user} ko wapas add kiya.`, mentions: [jid] });
          }
        }
      }
      if (!skipVx) {
        const fresh = (participants || []).filter((p) => firstTime(id, numOf(p), action));
        if (fresh.length) await vx.onParticipants(sock, { id, author, participants: fresh, action });
      }
    } catch (e) { console.error('groupEvents:', e.message); }
  });

  // group name / description / open-close notices
  sock.ev.on('groups.update', async (updates) => {
    for (const u of updates) {
      try {
        clearMeta(u.id, session);
        const g = db.group(session, u.id);
        if (typeof u.announce === 'boolean' && g.notifopen) {
          await sock.sendMessage(u.id, { text: u.announce ? '🔒 Group *band* hua — ab sirf admin message kar sakte hain.' : '🔓 Group *khul* gaya — ab sab message kar sakte hain.' });
        }
        if (g.groupupdate) {
          if (u.subject) await sock.sendMessage(u.id, { text: `✏️ Group ka naam badla:\n*${u.subject}*` });
          if (u.desc !== undefined) await sock.sendMessage(u.id, { text: `📝 Group description update hui:\n${u.desc || '(khaali)'}` });
        }
      } catch (e) { console.error('groups.update:', e.message); }
    }
  });
  // BACKUP: invite-link se judne / leave karne par kabhi 'group-participants.update' nahi aata,
  // par WhatsApp ka "X joined using invite link" notice (stub message) zaroor aata hai — usse bhi welcome/goodbye chalao.
  const STUB = { 27: 'add', 31: 'add', 28: 'remove', 32: 'remove' };
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const m of messages || []) {
      try {
        const action = STUB[m.messageStubType];
        const id = m.key?.remoteJid;
        if (!action || !id || !id.endsWith('@g.us') || m.key?.fromMe) continue;
        const ts = Number(m.messageTimestamp?.toNumber ? m.messageTimestamp.toNumber() : m.messageTimestamp) || 0;
        if (ts && Date.now() / 1000 - ts > 120) continue;   // purane (history) notices ignore
        const raw = (m.messageStubParameters || []).map((x) => { try { return JSON.parse(x); } catch { return x; } });
        let participants = raw.map((x) => (typeof x === 'string' ? x : (x?.phoneNumber || x?.jid || x?.id || ''))).filter((x) => typeof x === 'string' && x.includes('@'));
        if (!participants.length && m.participant) participants = [m.participant];
        if (!participants.length && m.key?.participant) participants = [m.key.participant];
        console.log(`[group-event:stub] ${session} ${action} ${id} ->`, participants.map(numOf).join(','));
        if (action === 'remove' && participants.some((j) => jidNormalizedUser(j) === botId())) continue;
        await sleep(4000);   // asli event ko pehle mauka do
        if (Date.now() - (evSeen.get(`${id}|${action}`) || 0) < 20000) continue;   // asli event aa chuka -> backup ki zaroorat nahi
        const fresh = participants.filter((j) => firstTime(id, numOf(j), action));
        if (fresh.length) await vx.onParticipants(sock, { id, author: m.participant || m.key?.participant, participants: fresh, action });
      } catch (e) { console.error('groupEvents stub:', e.message); }
    }
  });
};
