import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep all group protection settings in the same persistent database.
const DB = path.join(__dirname, '../data/userGroupData.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB)) return {};
    const data = JSON.parse(fs.readFileSync(DB, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (error) {
    console.error('❌ Anti-sticker DB load error:', error?.message || error);
    return {};
  }
}

function saveDB(data) {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

function setAntiSticker(groupId, enabled) {
  if (!groupId || !groupId.endsWith('@g.us')) return false;

  const db = loadDB();

  if (!db.antisticker || typeof db.antisticker !== 'object') {
    db.antisticker = {};
  }

  db.antisticker[groupId] = !!enabled;
  saveDB(db);

  return true;
}

function isAntiStickerOn(groupId) {
  const db = loadDB();
  return db.antisticker?.[groupId] === true;
}

function getMessageContent(message) {
  let content = message?.message || {};

  for (let i = 0; i < 8; i++) {
    if (content?.ephemeralMessage?.message) {
      content = content.ephemeralMessage.message;
    } else if (content?.viewOnceMessage?.message) {
      content = content.viewOnceMessage.message;
    } else if (content?.viewOnceMessageV2?.message) {
      content = content.viewOnceMessageV2.message;
    } else if (content?.viewOnceMessageV2Extension?.message) {
      content = content.viewOnceMessageV2Extension.message;
    } else if (content?.documentWithCaptionMessage?.message) {
      content = content.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }

  return content;
}

function getParticipant(message) {
  return (
    message?.key?.participant ||
    message?.participant ||
    message?.key?.senderPn ||
    message?.sender ||
    null
  );
}

async function handleAntiSticker(sock, message) {
  const groupId = message?.key?.remoteJid;

  if (!groupId?.endsWith('@g.us')) return false;
  if (message?.key?.fromMe) return false;
  if (!isAntiStickerOn(groupId)) return false;

  const content = getMessageContent(message);

  if (!content?.stickerMessage) return false;

  try {
    await sock.sendMessage(groupId, {
      delete: message.key
    });
  } catch (error) {
    console.error(
      '❌ Anti-sticker delete failed:',
      error?.message || error
    );
    return false;
  }

  const participant = getParticipant(message);

  if (participant) {
    await sock.sendMessage(groupId, {
      text: `🚫 *ANTI STICKER WARNING*\n\n👤 *Member:* @${participant.split('@')[0]}\n\n🗑️ *আপনার Sticker delete করে দেওয়া হয়েছে।*\n⚠️ *এই group-এ Sticker পাঠানো allowed নয়।*`,
      mentions: [participant]
    }).catch(() => {});
  } else {
    await sock.sendMessage(groupId, {
      text: '🚫 *ANTI STICKER WARNING*\n\n🗑️ *Sticker delete করে দেওয়া হয়েছে।*\n⚠️ *এই group-এ Sticker পাঠানো allowed নয়।*'
    }).catch(() => {});
  }

  return true;
}

async function antistickerCommand(sock, chatId, message) {
  if (!chatId?.endsWith('@g.us')) {
    await sock.sendMessage(
      chatId,
      {
        text: '❌ *এই command শুধুমাত্র group-এ ব্যবহার করা যাবে।*'
      },
      {
        quoted: message
      }
    );

    return;
  }

  const text =
    message?.message?.conversation ||
    message?.message?.extendedTextMessage?.text ||
    '';

  const arg = text.trim().split(/\s+/)[1]?.toLowerCase();

  if (arg === 'on') {
    setAntiSticker(chatId, true);

    await sock.sendMessage(
      chatId,
      {
        text: '🛡️ Anti Sticker ON\n🗑️ *যেকোনো member-এর Sticker automatically delete হয়ে যাবে।*'
      },
      {
        quoted: message
      }
    );

    return;
  }

  if (arg === 'off') {
    setAntiSticker(chatId, false);

    await sock.sendMessage(
      chatId,
      {
        text: '❌ Anti Sticker OFF\n✅ *এখন থেকে Sticker automatically delete হবে না।*'
      },
      {
        quoted: message
      }
    );

    return;
  }

  await sock.sendMessage(
    chatId,
    {
      text: `🛡️ Anti Sticker: ${
        isAntiStickerOn(chatId) ? 'ON' : 'OFF'
      }\n\nUse:\n.antisticker on\n.antisticker off`
    },
    {
      quoted: message
    }
  );
}

export {
  setAntiSticker,
  isAntiStickerOn,
  handleAntiSticker,
  antistickerCommand
};
