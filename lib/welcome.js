// ============================================================
// WELCOME / GOODBYE — separate file
// Channel forwarding is intentionally NOT used here.
// Member ka real WhatsApp DP use hota hai; DP unavailable ho to fallback.
// ============================================================
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');
const { fetchBuffer, mediaSrc } = require('./common');
const { pick, WELCOME, GOODBYE } = require('./msgs');

const DEFAULT_WELCOME =
  '👋 *स्वागत है!*\n\n' +
  '@user जी, आपका *@group* में हार्दिक स्वागत है। 🎉\n' +
  '👥 कुल सदस्य: @count\n\n' +
  '✨ ग्रुप के नियमों का पालन करें और आनंद लें।';

const DEFAULT_GOODBYE =
  '👋 *विदाई संदेश*\n\n' +
  '@user ने ग्रुप छोड़ दिया है। 😢\n' +
  '👥 अब ग्रुप में @count सदस्य हैं।\n\n' +
  '🙏 फिर मिलेंगे, अपना ख्याल रखना!';

const fmt = (text, vars) =>
  String(text)
    .replace(/@user/g, '@' + vars.user)
    .replace(/@group/g, vars.group)
    .replace(/@count/g, String(vars.count))
    .replace(/@owner/g, config.ownerName)
    .replace(/@bot/g, config.botName);

async function memberDp(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(jid, 'image');
    if (url) return await fetchBuffer(url, { headers: { 'accept': 'image/*' } });
  } catch {}

  try {
    const fallback = config.defaultDp(jid.split('@')[0]);
    if (fallback) return await fetchBuffer(fallback, { headers: { 'accept': 'image/*' } });
  } catch {}

  return null;
}

async function sendMemberMessage(sock, groupJid, memberJid, text, vars) {
  const caption = fmt(text, vars);
  return sock.sendMessage(groupJid, {
    text: caption,
    mentions: [memberJid],
    contextInfo: { mentionedJid: [memberJid] },
  });
}

// g = group settings (db.group): welcomeMsg, welcomeLang, welcomeVideoOn, welcomeVideo ...
function welcomeVideoSource(g) {
  if (config.welcomeVideoUrls?.length) return { url: pick(config.welcomeVideoUrls) };
  return mediaSrc(g.welcomeVideo || 'assets/welcome.mp4');
}

async function sendWelcome(sock, groupJid, memberJid, vars, g = {}) {
  const lang = g.welcomeLang === 'en' ? 'en' : 'bn';
  const caption = fmt(g.welcomeMsg || pick(WELCOME[lang]), vars);
  const mentions = [memberJid];
  const ctx = { mentionedJid: mentions };

  // .welcomevideo on -> URL wala video, warna member ki DP
  if (g.welcomeVideoOn) {
    try {
      const video = welcomeVideoSource(g);
      if (video) return await sock.sendMessage(groupJid, { video, caption, mentions, mimetype: 'video/mp4', contextInfo: ctx });
    } catch (e) { console.error('welcome video:', e.message); }
  }
  const dp = await memberDp(sock, memberJid).catch(() => null);
  if (dp) return sock.sendMessage(groupJid, { image: dp, caption, mentions, contextInfo: ctx });
  return sock.sendMessage(groupJid, { text: caption, mentions, contextInfo: ctx });
}

async function sendGoodbye(sock, groupJid, memberJid, vars, g = {}) {
  const lang = g.goodbyeLang === 'en' ? 'en' : 'bn';
  const caption = fmt(g.goodbyeMsg || pick(GOODBYE[lang]), vars);
  const mentions = [memberJid];
  const dp = await memberDp(sock, memberJid).catch(() => null);
  if (dp) return sock.sendMessage(groupJid, { image: dp, caption, mentions, contextInfo: { mentionedJid: mentions } });
  return sock.sendMessage(groupJid, { text: caption, mentions, contextInfo: { mentionedJid: mentions } });
}

module.exports = {
  DEFAULT_WELCOME,
  DEFAULT_GOODBYE,
  fmt,
  memberDp,
  sendWelcome,
  sendGoodbye,
};
