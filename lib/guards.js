// Saare ANTI features (message-level)
const config = require('../config');
const db = require('./db');
const { hasUrl, waGroupCode } = require('./UrlUtil');
const { antiText } = require('./msgs');
const ui = require('./ui');

const spam = new Map();

// ---------------- Rimuru: AntiBot heuristic (same-to-same port) ----------------
function analyzeBotMessage(m) {
  const messageId = String(m?.key?.id || '').trim();
  if (!messageId) return { isBot: false, score: 0, reasons: [] };
  if (messageId.startsWith('WAMID.') || messageId.startsWith('false_') || messageId.startsWith('true_')) return { isBot: false, score: 0, reasons: [] };

  let score = 0;
  const reasons = [];
  const idUpper = messageId.toUpperCase();

  if (idUpper.startsWith('BAE5')) { score += 5; reasons.push('id-BAE5'); }
  else if (idUpper.startsWith('3EB0') && idUpper.length === 22) { score += 4; reasons.push('id-3EB0'); }
  else if (idUpper.startsWith('B24E')) { score += 5; reasons.push('id-B24E'); }
  else if (idUpper.startsWith('94DD')) { score += 5; reasons.push('id-94DD'); }
  else if (idUpper.startsWith('B1E')) { score += 5; reasons.push('id-B1E'); }
  else if (/^[A-F0-9]{28,40}$/i.test(messageId)) { score += 2; reasons.push('id-upper-hex'); }
  else if (messageId.length === 16) { score += 3; reasons.push('id-length-16'); }
  else if (messageId.length < 20 && !messageId.includes('-')) { score += 2; reasons.push('id-length-suspicious'); }

  if (/[a-z]/.test(messageId) && !messageId.startsWith('3EB0') && !messageId.includes('-')) { score += 4; reasons.push('id-lowercase-signature'); }

  const len = messageId.length;
  if (len !== 16 && len !== 20 && len !== 22 && len !== 32 && !messageId.includes('-')) { score += 3; reasons.push('id-length-unusual'); }

  if (/^BAE5/i.test(messageId)) { score += 5; reasons.push('flag-isBaileys'); }

  const msg = m?.message || {};
  const actual = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message || msg;
  const textMsg = actual?.conversation || actual?.extendedTextMessage?.text || '';
  const ctx = actual?.extendedTextMessage?.contextInfo || actual?.imageMessage?.contextInfo || actual?.videoMessage?.contextInfo || {};

  if (ctx.externalAdReply) { score += 6; reasons.push('custom-ad-reply'); }
  if (ctx.isForwarded && ctx.forwardingScore > 100) { score += 3; reasons.push('fake-forward-score'); }
  if (/[\u200B-\u200D\uFEFF]/.test(textMsg)) { score += 3; reasons.push('invisible-characters'); }

  for (const type of ['buttonsMessage', 'templateMessage', 'listMessage', 'interactiveMessage', 'buttonsResponseMessage', 'templateButtonReplyMessage', 'listResponseMessage', 'interactiveResponseMessage']) {
    if (actual[type]) { score += 6; reasons.push(`message-type-${type}`); break; }
  }

  if (msg.deviceSentMessage) {
    score += 1; reasons.push('message-deviceSent');
    if (msg.deviceSentMessage?.message) { score += 1; reasons.push('message-deviceWrapper'); }
  }

  const dm = String(m?.key?.participant || '').match(/:(\d+)@/);
  const dev = dm ? Number.parseInt(dm[1], 10) : null;
  if (Number.isInteger(dev) && dev > 20) { score += 2; reasons.push('participant-highDevice'); }

  const pn = String(m?.pushName || '').trim().toLowerCase();
  if (!pn || ['unknown', 'undefined', 'null'].includes(pn)) { score += 1; reasons.push('pushname-unknown'); }
  else if (/(bot|system|admin|owner|host|panel)/i.test(pn)) { score += 2; reasons.push('pushname-suspicious'); }

  return { isBot: score >= 5, score, reasons };
}

// ---------------- Rimuru: AntiSpam (same-to-same port) ----------------
const rSpam = new Map();
function rimuruSpamHit(x) {
  const g = db.group(x.session, x.jid);
  const k = `${x.jid}_${x.sender}`;
  const now = Date.now();
  const delay = g.antispamDelay || 2000;
  const u = rSpam.get(k) || { count: 0, lastMessage: 0, warnings: 0 };
  if (now - u.lastMessage < delay) u.count += 1;
  else if (now - u.lastMessage > delay + 1000) u.count = 1;
  else u.count = Math.max(1, u.count - 1);
  u.lastMessage = now;
  rSpam.set(k, u);
  return u.count >= 5;
}

async function rimuruSpamAction(x) {
  const g = db.group(x.session, x.jid);
  const action = g.antispamAction || 'warning';
  const k = `${x.jid}_${x.sender}`;
  const u = rSpam.get(k) || { count: 0, lastMessage: 0, warnings: 0 };
  const num = x.sender.split('@')[0];
  const say = (text) => x.sock.sendMessage(x.jid, { text, mentions: [x.sender] }, { quoted: x.m }).catch(() => {});

  if (action === 'warning') {
    u.warnings += 1;
    if (u.warnings >= 3) {
      await say(`⚠️ *PERINGATAN SPAM MAKSIMAL*\n\n> Teruntuk: @${num}\n\nKamu telah mendapatkan 3 kali teguran peringatan karena mengirim pesan spam secara berkelanjutan. Harap segera berhenti melakukan spam atau jajaran admin grup dapat mengambil tindakan tegas terhadap pelanggaran ini!`);
      u.warnings = 0;
    } else {
      await say(`⚠️ *TEGURAN SPAM TERDETEKSI*\n\n> Peringatan ke-${u.warnings} dari maksimal 3 peringatan\n\nHalo @${num}, tolong jangan melakukan pengiriman pesan berulang-ulang di grup ini secara cepat! Sistem kami mendeteksi aktivitasmu sebagai spam. Mohon hargai kenyamanan member lainnya`);
    }
    u.count = 0; rSpam.set(k, u);
  } else if (action === 'kick') {
    if (x.isBotAdmin) {
      await say(`🛑 *SPAMMER DIKELUARKAN*\n\nMaaf sekali @${num}, kamu akan dikeluarkan secara paksa oleh sistem karena kamu terdeteksi melakukan aksi spam brutal di grup ini!`);
      await x.sock.groupParticipantsUpdate(x.jid, [x.sender], 'remove').catch(() => {});
      rSpam.delete(k);
    } else {
      await say(`⚠️ *SPAM TERDETEKSI*\n\nTelah terdeteksi aktivitas spam brutal dari @${num}, namun sistem bot sayangnya tidak dapat menendang member tersebut karena bot saat ini tidak memiliki akses sebagai admin grup. Tolong jadikan bot admin agar fitur ini bekerja maksimal`);
      u.count = 0; rSpam.set(k, u);
    }
  } else if (action === 'delete') {
    if (x.isBotAdmin) await x.sock.sendMessage(x.jid, { delete: x.m.key }).catch(() => {});
    else { u.count = 0; rSpam.set(k, u); }
  }
}

// AntiBot ka kick (Rimuru message ke saath)
async function rimuruBotKick(x) {
  await x.sock.sendMessage(x.jid, { delete: x.m.key }).catch(() => {});
  await x.sock.groupParticipantsUpdate(x.jid, [x.sender], 'remove').catch(() => {});
  await x.sock.sendMessage(x.jid, { text: `🤖 *AntiBot* — @${x.sender.split('@')[0]} terdeteksi sebagai bot dan di-kick.`, mentions: [x.sender] }).catch(() => {});
}

function hasKeyDeep(value, re, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  for (const [k, v] of Object.entries(value)) {
    if (re.test(k)) return true;
    if (hasKeyDeep(v, re, seen)) return true;
  }
  return false;
}

// Bug / crash message detection (bahut lamba text, invisible-char flood, mass mentions, bhaari vcard/location)
function isBug(x) {
  const t = x.text || '';
  if (t.length > 12000) return true;
  if (/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\u0300-\u036f\ufe00-\ufe0f]{300,}/.test(t)) return true;
  if ((x.mentioned || []).length > 600) return true;
  const c = x.content || {};
  const vc = c.contactMessage?.vcard || (c.contactsArrayMessage?.contacts || []).map((k) => k.vcard).join('');
  if (vc && vc.length > 20000) return true;
  if ((c.locationMessage?.name || '').length > 3000 || (c.locationMessage?.address || '').length > 3000) return true;
  if ((c.liveLocationMessage?.caption || '').length > 5000) return true;
  return false;
}

const ANTI = {
  antijudol:   { desc: 'Gambling/satta/slot spam delete', test: (x) => /\b(slot(?:\s?gacor)?|gacor|togel|judi|maxwin|sbobet|casino|betting|1xbet|jackpot|rtp\s?live|situs\s?(?:slot|judi)|link\s?alternatif|satta|matka|teen\s?patti)\b/i.test(x.text) },
  antiphising: { desc: 'Phishing/scam link delete', test: (x) => hasUrl(x.text) && (/\b(bit\.ly|tinyurl\.com|cutt\.ly|is\.gd|grabify|iplogger|shorturl\.at)\b/i.test(x.text) || /(free\s*(robux|vbucks|gift\s?card)|claim.{0,20}(prize|reward)|verify.{0,20}account)/i.test(x.text)) },
  antitoxic:   { desc: 'Gaali/abusive words delete', test: (x) => config.badWords.test(x.text) },
  antispam:    { desc: 'Spam/flood detect (Rimuru) [on/off/warning/kick/delete/delay]', test: (x) => rimuruSpamHit(x) },
  antibug:     { desc: 'Bug/crash/virus message delete + kick', aliases: ['antiport', 'antibugs'], modes: ['delete', 'kick'], def: 'kick', test: (x) => isBug(x) },
  antigroupstatus: { desc: 'Group status mention delete', test: (x) => hasKeyDeep(x.m.message, /groupStatus/i) },
  antitagsw:       { desc: 'Status me group tag (tagsw) delete', test: (x) => hasKeyDeep(x.m.message, /statusMention|status_mention/i) },
  antihidetag: { desc: 'Non-admin ka hidetag delete', test: (x) => {
      const n = x.mentioned.length;
      return n >= 5 && x.meta && n >= x.meta.participants.length * 0.8;
  } },
  antibot:     { desc: 'Dusre bots ko kick (Rimuru smart heuristic)', aliases: ['botdetect'], kick: true, test: (x) => analyzeBotMessage(x.m).isBot },
};

// Action modes:
//   delete = message delete + Bengali message (tag ke saath)
//   warn   = delete + Bengali message + warning, warnLimit par kick   (link/status wale features ka default)
//   kick   = delete + turant kick
// Media wale features (pic/video/voice/sticker/media/bug) me sirf delete aur kick hai (warning nahi).
const MODES = ['delete', 'warn', 'kick'];
const modesOf = (name) => ANTI[name]?.modes || MODES;
const modeOf = (g, name) => {
  const cur = g.antiMode?.[name];
  if (cur && modesOf(name).includes(cur)) return cur;
  return ANTI[name]?.def || (ANTI[name]?.kick ? 'kick' : 'warn');
};

async function punish(x, name, mode) {
  await x.sock.sendMessage(x.jid, { delete: x.m.key }).catch(() => {});
  const mentions = [x.sender];
  const quoted = ui.ownerQuote(x.sock);
  const say = (text) => ui.sendBtn(x.sock, x.jid, { text, mentions }, { quoted });

  if (mode === 'kick') {
    await x.sock.groupParticipantsUpdate(x.jid, [x.sender], 'remove').catch(() => {});
    return say(antiText(name, x, { kicked: true }));
  }
  if (mode === 'delete') return say(antiText(name, x));

  const n = db.addWarn(x.session, x.jid, x.sender);
  if (n >= config.warnLimit) {
    db.resetWarn(x.session, x.jid, x.sender);
    await x.sock.groupParticipantsUpdate(x.jid, [x.sender], 'remove').catch(() => {});
    return say(antiText(name, x, { kicked: true }));
  }
  return say(antiText(name, x, { warn: { n, limit: config.warnLimit } }));
}

async function runGuards(x) {
  if (!x.isGroup || x.fromMe || x.isAdmin || x.isOwner || !x.isBotAdmin) return false;
  if (/Response|ButtonReply/.test(x.mtype)) return false;   // bot ke button ka jawab guard se nahi guzarta
  const g = db.group(x.session, x.jid);
  // Media commands such as .sticker / .vv are intentionally allowed to process
  // their own media even when antimedia/antisticker is enabled.
  const commandCaption = x.text.startsWith(config.prefix);
  for (const [name, def] of Object.entries(ANTI)) {
    if (commandCaption && [].includes(name)) continue;
    if (!g[name]) continue;
    let hit = false;
    try { hit = def.test(x); } catch {}
    if (!hit) continue;
    if (name === 'antispam') { await rimuruSpamAction(x); return true; }
    if (name === 'antibot') { await rimuruBotKick(x); return true; }
    await punish(x, name, modeOf(g, name)); return true;
  }
  return false;
}

module.exports = { ANTI, MODES, modesOf, modeOf, runGuards };
