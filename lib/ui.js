// DP / owner card / button helpers (sab jagah yahin se)
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');
const { fetchBuffer } = require('./common');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ownerNum = () => String(config.ownerNumber[0] || '').replace(/\D/g, '');
const ownerJid = () => `${ownerNum()}@s.whatsapp.net`;

const dpUrl = () => pick(config.dpUrls?.length ? config.dpUrls : [config.menuImage]);
const menuDpUrl = () => pick(config.menuImages?.length ? config.menuImages : (config.dpUrls?.length ? config.dpUrls : [config.menuImage]));

// ---------- Owner DP (cache) ----------
let ownerDpBuf = null, ownerDpAt = 0, ownerDpBusy = false;
async function thumb(buf) {
  try { return await require('sharp')(buf).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer(); }
  catch { return buf; }
}
async function loadOwnerDp(sock) {
  if (ownerDpBusy) return;
  ownerDpBusy = true;
  try {
    let buf = null;
    if (config.ownerDpUrl) buf = await fetchBuffer(config.ownerDpUrl, {}, { retries: 0, timeout: 8000 }).catch(() => null);
    if (!buf) {
      const u = await sock.profilePictureUrl(ownerJid(), 'image').catch(() => null);
      if (u) buf = await fetchBuffer(u, {}, { retries: 0, timeout: 8000 }).catch(() => null);
    }
    if (!buf) buf = await fetchBuffer(dpUrl(), {}, { retries: 0, timeout: 8000 }).catch(() => null);
    if (buf) { ownerDpBuf = buf; ownerDpAt = Date.now(); }
  } finally { ownerDpBusy = false; }
}
// turant jo cache me hai wahi deta hai (naya load peeche chalta hai) => koi delay nahi
function ownerDp(sock) {
  if (!ownerDpBuf || Date.now() - ownerDpAt > 600000) loadOwnerDp(sock).catch(() => {});
  return ownerDpBuf;
}
async function ownerDpWait(sock) {
  if (!ownerDpBuf) await loadOwnerDp(sock).catch(() => {});
  return ownerDpBuf;
}

// ---------- Owner contact card (reply ke upar quote hota hai: owner ka naam + number + DP) ----------
let quoteThumb = null, quoteThumbFor = null;
function ownerQuote(sock) {
  const dp = ownerDp(sock);
  if (dp && quoteThumbFor !== dp) { quoteThumbFor = dp; thumb(dp).then((t) => { quoteThumb = t; }).catch(() => {}); }
  const n = ownerNum();
  const name = String(config.ownerName || 'Owner').trim();
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nN:;${name};;;\nFN:${name}\nTEL;type=CELL;type=VOICE;waid=${n}:+${n}\nEND:VCARD`;
  return {
    key: { fromMe: false, participant: ownerJid(), remoteJid: 'status@broadcast', id: 'VXMDOWNERCARD' },
    message: { contactMessage: { displayName: name, vcard, ...(quoteThumb ? { jpegThumbnail: quoteThumb } : {}) } },
  };
}

// ---------- Channel / Telegram links ----------
function channelLinks() {
  const out = [];
  for (const c of config.channels || []) {
    const link = c.link || (c.invite ? `https://whatsapp.com/channel/${c.invite}` : '');
    if (link || c.jid) out.push({ name: c.name, jid: c.jid, link });
  }
  if (!out.length && (config.channelLink || config.channelJid)) out.push({ name: config.channelName, jid: config.channelJid, link: config.channelLink });
  return out;
}
function footerText() {
  const ch = channelLinks();
  let t = '';
  ch.forEach((c, i) => {
    t += `📢 *${c.name || 'Channel ' + (i + 1)}*\n`;
    if (c.link) t += `🔗 ${c.link}\n`;
    if (c.jid) t += `🆔 ${c.jid}\n`;
  });
  if (config.telegramLink) t += `✈️ *Telegram:* ${config.telegramLink}\n`;
  return t.trim();
}

// ---------- Buttons ----------
// buttons: [{ id: '.menu', text: '📜 Menu' }]  (max 3). Image na chale to text, phir plain text fallback.
const DEFAULT_BTNS = () => [
  { id: `${config.prefix}menu`, text: '📜 Menu' },
  { id: `${config.prefix}owner`, text: '👑 Owner' },
  { id: `${config.prefix}channel`, text: '📢 Channel' },
];
async function sendBtn(sock, jid, o, opts = {}) {
  const buttons = (o.buttons || DEFAULT_BTNS()).slice(0, 3)
    .map((b, i) => ({ buttonId: b.id || `btn${i}`, buttonText: { displayText: b.text }, type: 1 }));
  const common = { footer: o.footer ?? config.botName, buttons, mentions: o.mentions || [] };
  const text = o.text || '';
  const img = o.image === undefined ? { url: dpUrl() } : o.image;
  if (img) {
    try { return await sock.sendMessage(jid, { image: img, caption: text, headerType: 4, ...common }, opts); }
    catch (e) { console.error('sendBtn image:', e.message); }
  }
  try { return await sock.sendMessage(jid, { text, headerType: 1, ...common }, opts); }
  catch (e) { console.error('sendBtn text:', e.message); }
  return sock.sendMessage(jid, { text, mentions: o.mentions || [] }, opts);
}

module.exports = { pick, ownerNum, ownerJid, dpUrl, menuDpUrl, ownerDp, ownerDpWait, ownerQuote, channelLinks, footerText, sendBtn };
