import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB = path.join(__dirname, '../data/userGroupData.json');

function load() {
  try {
    if (!fs.existsSync(DB)) return {};
    return JSON.parse(fs.readFileSync(DB, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

// Har media type ka apna alag switch.
// key -> label (panel/messages me dikhne wala naam)
const MEDIA_TYPES = {
  photo: 'Photo',
  video: 'Video',
  voice: 'Voice/Audio',
  sticker: 'Sticker',
  document: 'Document',
  gif: 'GIF'
};
const MEDIA_KEYS = Object.keys(MEDIA_TYPES);

// Per-type flags: data.antimediaTypes[groupId] = { photo, video, voice, ... }
// Purana format (data.antimedia[groupId] === true) = "sab ON" mana jayega,
// jab tak us group ke liye naya per-type record na bane.
function getTypeFlags(data, groupId) {
  const rec = data.antimediaTypes?.[groupId];
  if (rec && typeof rec === 'object') {
    const out = {};
    for (const k of MEDIA_KEYS) out[k] = rec[k] === true;
    return out;
  }
  const legacy = data.antimedia?.[groupId] === true;
  const out = {};
  for (const k of MEDIA_KEYS) out[k] = legacy;
  return out;
}

function setAntiMediaType(groupId, type, enabled) {
  if (!MEDIA_KEYS.includes(type)) return false;
  const data = load();
  if (!data.antimediaTypes) data.antimediaTypes = {};
  data.antimediaTypes[groupId] = {
    ...getTypeFlags(data, groupId),
    [type]: !!enabled
  };
  save(data);
  return true;
}

// Sab types ek saath ON/OFF (.antimedia on / off  ya  ALL ON / ALL OFF)
function setAntiMedia(groupId, enabled) {
  const data = load();
  if (!data.antimediaTypes) data.antimediaTypes = {};
  const flags = {};
  for (const k of MEDIA_KEYS) flags[k] = !!enabled;
  data.antimediaTypes[groupId] = flags;
  save(data);
  return true;
}

function isAntiMediaTypeOn(groupId, type) {
  return getTypeFlags(load(), groupId)[type] === true;
}

// Koi bhi ek type ON ho to true
function isAntiMediaOn(groupId) {
  const flags = getTypeFlags(load(), groupId);
  return MEDIA_KEYS.some((k) => flags[k]);
}

function getMessageContent(message) {
  let content = message?.message || {};

  for (let i = 0; i < 5; i++) {
    if (content.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
    } else if (content.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
    } else if (content.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
    } else if (content.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }

  return content;
}

function isProtectedMediaMessage(message) {
  const content = getMessageContent(message);

  if (!content) return false;

  // 📷 PHOTO
  if (content.imageMessage) {
    return {
      type: 'photo',
      warning:
        '📷 *ছবি পাঠাবেন না, এই গ্রুপে ছবি পাঠানো অনুমতি নেই*'
    };
  }

  // 🎞️ GIF (WhatsApp me GIF asal me gifPlayback wala video hota hai)
  if (content.videoMessage?.gifPlayback) {
    return {
      type: 'gif',
      warning:
        '🎞️ *GIF/মিডিয়া পাঠাবেন না, এই গ্রুপে মিডিয়া অনুমতি নেই*'
    };
  }

  // 🎥 VIDEO
  if (content.videoMessage) {
    return {
      type: 'video',
      warning:
        '🎥 *ভিডিও পাঠাবেন না, এই গ্রুপে ভিডিও পাঠানো অনুমতি নেই*'
    };
  }

  // 🧩 STICKER
  if (content.stickerMessage) {
    return {
      type: 'sticker',
      warning:
        '🧩 *স্টিকার পাঠাবেন না, এই গ্রুপে স্টিকার পাঠানো অনুমতি নেই*'
    };
  }

  // 🎵 AUDIO
  if (content.audioMessage) {
    return {
      type: 'voice',
      warning:
        '🎵 *অডিও/মিডিয়া পাঠাবেন না, এই গ্রুপে মিডিয়া পাঠানো অনুমতি নেই*'
    };
  }

  // 📄 DOCUMENT
  if (content.documentMessage) {
    return {
      type: 'document',
      warning:
        '📄 *ডকুমেন্ট/মিডিয়া পাঠাবেন না, এই গ্রুপে মিডিয়া পাঠানো অনুমতি নেই*'
    };
  }

  // 🎞️ GIF
  if (content.gifMessage) {
    return {
      type: 'gif',
      warning:
        '🎞️ *GIF/মিডিয়া পাঠাবেন না, এই গ্রুপে মিডিয়া অনুমতি নেই*'
    };
  }

  return false;
}

async function handleAntiMedia(sock, message) {
  const groupId = message?.key?.remoteJid;

  if (!groupId?.endsWith('@g.us')) {
    return false;
  }

  if (message?.key?.fromMe) {
    return false;
  }

  if (!isAntiMediaOn(groupId)) {
    return false;
  }

  const detected = isProtectedMediaMessage(message);

  if (!detected) {
    return false;
  }

  // Sirf wahi type delete hoga jiska switch ON hai
  if (!isAntiMediaTypeOn(groupId, detected.type)) {
    return false;
  }

  try {
    // Reply/quote the original media message so the warning is tappable and
    // clearly points to the member who sent the forbidden media.
    const sender = message.key.participant || message.participant || '';
    const mention = sender ? `\n👤 @${sender.split('@')[0]}` : '';
    await sock.sendMessage(groupId, {
      text: `${detected.warning}${mention}`,
      mentions: sender ? [sender] : []
    }, { quoted: message }).catch(() => {});

    // Delete the protected media after the warning is posted.
    await sock.sendMessage(groupId, {
      delete: message.key
    });

    return true;

  } catch (error) {
    console.error(
      `Anti-media delete failed (${detected.type}):`,
      error?.message || error
    );

    return false;
  }
}

export {
  MEDIA_TYPES,
  MEDIA_KEYS,
  setAntiMedia,
  setAntiMediaType,
  isAntiMediaTypeOn,
  isAntiMediaOn,
  isProtectedMediaMessage,
  handleAntiMedia
};
