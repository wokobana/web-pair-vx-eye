import { Module } from "../lib/plugins.js";
import {
  MEDIA_TYPES,
  MEDIA_KEYS,
  setAntiMedia,
  setAntiMediaType,
  isAntiMediaTypeOn,
  isAntiMediaOn,
  handleAntiMedia
} from "../lib/xaf-antimedia.js";

// Group admin check
async function admin(m) {
  if (!m.isGroup) {
    await m.send('❌ This command can only be used in groups.');
    return false;
  }

  await m.loadGroupInfo();

  if (!m.isAdmin && !m.isFromMe) {
    await m.send('❌ Only group admins can use this command.');
    return false;
  }

  return true;
}

const statusLine = (jid) =>
  MEDIA_KEYS.map(
    (k) => `${isAntiMediaTypeOn(jid, k) ? '✅' : '❌'} ${MEDIA_TYPES[k]}`
  ).join('\n');

// ===============================
// ANTI MEDIA  (sab ek saath ya alag alag)
//   .antimedia on / off            -> sab types
//   .antimedia photo on / off      -> sirf photo
//   .antimedia voice on / off      -> sirf voice/audio ...
// ===============================
const KEY_ALIASES = {
  photo: 'photo', pic: 'photo', image: 'photo',
  video: 'video',
  voice: 'voice', audio: 'voice',
  sticker: 'sticker',
  document: 'document', doc: 'document',
  gif: 'gif'
};

Module({
  command: 'antimedia',
  aliases: ['antimediagroup'],
  package: 'group',
  description: 'Block photo, video, voice, sticker, document, gif (alag alag ya sab)'
})(async (m, args = '') => {

  if (!(await admin(m))) return;

  const parts = String(args).trim().toLowerCase().split(/\s+/).filter(Boolean);

  // .antimedia on / off  -> sab types
  if (parts.length === 1 && (parts[0] === 'on' || parts[0] === 'off')) {
    const v = parts[0] === 'on';
    setAntiMedia(m.from, v);
    return m.send(
      v
        ? '🛡️ Anti Media ALL ON\n\n' + statusLine(m.from)
        : '❌ Anti Media ALL OFF'
    );
  }

  // .antimedia <type> on|off
  if (parts.length === 2 && KEY_ALIASES[parts[0]] && ['on', 'off'].includes(parts[1])) {
    const key = KEY_ALIASES[parts[0]];
    const v = parts[1] === 'on';
    setAntiMediaType(m.from, key, v);
    return m.send(
      `${v ? '✅' : '❌'} Anti ${MEDIA_TYPES[key]} ${v ? 'ON' : 'OFF'}\n\n` +
      statusLine(m.from)
    );
  }

  return m.send(
    `🛡️ Anti Media: ${isAntiMediaOn(m.from) ? 'ON' : 'OFF'}\n\n` +
    statusLine(m.from) + '\n\n' +
    'Use:\n' +
    '.antimedia on / off   (sab)\n' +
    '.antimedia photo on / off\n' +
    '.antimedia video on / off\n' +
    '.antimedia voice on / off\n' +
    '.antimedia sticker on / off\n' +
    '.antimedia document on / off\n' +
    '.antimedia gif on / off\n\n' +
    'Shortcuts: .antipic  .antivideo  .antivoice'
  );
});

// ===============================
// SINGLE-TYPE SHORTCUTS
//   .antipic on/off   -> sirf photo delete
//   .antivideo on/off -> sirf video delete
//   .antivoice on/off -> sirf voice/audio delete
// ===============================
function singleCommand(command, aliases, key) {
  Module({
    command,
    aliases,
    package: 'group',
    description: `Sirf ${MEDIA_TYPES[key]} delete karo (baaki media allowed)`
  })(async (m, args = '') => {
    if (!(await admin(m))) return;

    const a = String(args).trim().toLowerCase();

    if (a === 'on' || a === 'off') {
      const v = a === 'on';
      setAntiMediaType(m.from, key, v);
      return m.send(
        `${v ? '✅' : '❌'} Anti ${MEDIA_TYPES[key]} ${v ? 'ON' : 'OFF'}\n` +
        (v ? `Sirf ${MEDIA_TYPES[key]} delete hoga, baaki media nahi.` : '')
      );
    }

    return m.send(
      `🛡️ Anti ${MEDIA_TYPES[key]}: ${isAntiMediaTypeOn(m.from, key) ? 'ON' : 'OFF'}\n\n` +
      `Use:\n.${command} on\n.${command} off`
    );
  });
}

singleCommand('antipic', ['antiphoto', 'antiimage'], 'photo');
singleCommand('antivideo', [], 'video');
singleCommand('antivoice', ['antiaudio'], 'voice');

// ===============================
// ANTI MEDIA PROTECTION
// ===============================
Module({
  on: 'message',
  name: 'anti-media-protection',
  package: 'protection',
  description: 'Anti media handler'
})(async (m) => {

  // Group में ही काम करेगा
  if (!m.isGroup) return;

  // Koi bhi type ON nahi hai to kuch nahi karna
  if (!isAntiMediaOn(m.from)) return;

  // Group information load करें
  try {
    await m.loadGroupInfo();
  } catch (e) {
    return;
  }

  // BOT ADMIN नहीं है तो कुछ भी मत करो (ना delete, ना warning)
  if (!m.isBotAdmin && !m.isFromMe) return;

  // Kaun sa type delete hoga, ye handleAntiMedia khud per-type switch se tay karta hai
  try {
    await handleAntiMedia(m.conn, m.raw);
  } catch (e) {
    console.error('[AntiMedia Error]', e);
  }
});
