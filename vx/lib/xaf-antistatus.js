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
  } catch (error) {
    console.error('❌ Anti-status DB load error:', error);
    return {};
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

// ==========================================
// ANTI STATUS ON / OFF
// ==========================================

function setAntiStatus(groupId, enabled) {
  const data = load();

  if (!data.antistatus) {
    data.antistatus = {};
  }

  if (!data.antistatus[groupId]) {
    data.antistatus[groupId] = {
      enabled: false,
      kick: false,
      warnings: {}
    };
  }

  data.antistatus[groupId].enabled = !!enabled;

  if (!data.antistatus[groupId].warnings) {
    data.antistatus[groupId].warnings = {};
  }

  save(data);
  return true;
}

function isAntiStatusOn(groupId) {
  const data = load();

  return data.antistatus?.[groupId]?.enabled === true;
}

// ==========================================
// KICK SETTING
// ==========================================

function setAntiStatusKick(groupId, enabled) {
  const data = load();

  if (!data.antistatus) {
    data.antistatus = {};
  }

  if (!data.antistatus[groupId]) {
    data.antistatus[groupId] = {
      enabled: false,
      kick: false,
      warnings: {}
    };
  }

  data.antistatus[groupId].kick = !!enabled;

  if (!data.antistatus[groupId].warnings) {
    data.antistatus[groupId].warnings = {};
  }

  save(data);
  return true;
}

function isAntiStatusKickOn(groupId) {
  const data = load();

  return data.antistatus?.[groupId]?.kick === true;
}

// ==========================================
// MESSAGE CONTENT
// ==========================================

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
    } else {
      break;
    }
  }

  return content;
}

// ==========================================
// STORY / STATUS MENTION DETECTOR
// ==========================================

function isStoryMentionMessage(message) {
  const content = getMessageContent(message);

  if (!content) return false;

  const keys = Object.keys(content);

  const exact = [
    'groupStatusMentionMessage',
    'statusMentionMessage',
    'statusMentionMessageV2',
    'statusMentionMessageV3',
    'groupStatusMessage'
  ];

  if (exact.some(key => content[key])) {
    return true;
  }

  if (
    keys.some(key =>
      /status.*mention|mention.*status|group.*status.*message/i.test(key)
    )
  ) {
    return true;
  }

  return false;
}

// ==========================================
// MEMBER JID
// ==========================================

function getParticipant(message) {
  return (
    message?.key?.participant ||
    message?.participant ||
    message?.key?.senderPn ||
    message?.sender ||
    null
  );
}

// ==========================================
// ADMIN CHECK
// ==========================================

function normalizeJid(jid = '') {
  return String(jid)
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
}

async function isParticipantAdmin(sock, groupId, participant) {
  try {
    const metadata = await sock.groupMetadata(groupId);

    const participantNumber = normalizeJid(participant);

    const target = metadata?.participants?.find(
      p => normalizeJid(p?.id) === participantNumber
    );

    return (
      target?.admin === 'admin' ||
      target?.admin === 'superadmin'
    );

  } catch (error) {
    console.error(
      '❌ Anti-status admin check failed:',
      error?.message || error
    );

    return false;
  }
}

// ==========================================
// DUPLICATE EVENT PROTECTION
// ==========================================

// একই status event একাধিকবার handler এলে
// যেন একাধিক warning/message না যায়।
const processedStatusEvents = new Map();

function getStatusEventId(message) {
  const key = message?.key || {};

  // Baileys message id
  if (key.id) {
    return [
      'id',
      String(key.remoteJid || ''),
      String(key.id || ''),
      String(key.participant || key.senderPn || '')
    ].join(':');
  }

  // Fallback fingerprint
  const content = getMessageContent(message);
  const participant = getParticipant(message) || '';

  return [
    'fallback',
    String(key.remoteJid || ''),
    String(participant),
    JSON.stringify(content || {})
  ].join(':');
}

function isDuplicateStatusEvent(message) {
  const eventId = getStatusEventId(message);

  if (!eventId) return false;

  const now = Date.now();

  // পুরনো entries cleanup
  for (const [id, timestamp] of processedStatusEvents.entries()) {
    if (now - timestamp > 60 * 1000) {
      processedStatusEvents.delete(id);
    }
  }

  // একই event আগে process হয়ে থাকলে ignore
  if (processedStatusEvents.has(eventId)) {
    return true;
  }

  processedStatusEvents.set(eventId, now);

  return false;
}

// ==========================================
// DAILY WARNING
// ==========================================

function getWarningData(groupId, participant) {
  const data = load();

  if (!data.antistatus) {
    data.antistatus = {};
  }

  if (!data.antistatus[groupId]) {
    data.antistatus[groupId] = {
      enabled: false,
      kick: false,
      warnings: {}
    };
  }

  if (!data.antistatus[groupId].warnings) {
    data.antistatus[groupId].warnings = {};
  }

  const today = new Date().toISOString().slice(0, 10);

  let userData =
    data.antistatus[groupId].warnings[participant];

  // নতুন member
  if (!userData || typeof userData !== 'object') {
    userData = {
      count: 0,
      date: today
    };
  }

  // নতুন দিন = warning count reset
  if (userData.date !== today) {
    userData = {
      count: 0,
      date: today
    };
  }

  userData.count++;

  data.antistatus[groupId].warnings[participant] = userData;

  save(data);

  return userData.count;
}

// ==========================================
// CAN KICK PARTICIPANT
// ==========================================

async function canKickParticipant(sock, groupId, participant) {
  try {
    const metadata = await sock.groupMetadata(groupId);

    const botId = String(
      sock?.user?.id ||
      sock?.user?.jid ||
      ''
    )
      .split('@')[0]
      .split(':')[0];

    const botParticipant = metadata?.participants?.find(
      p =>
        String(p?.id || '')
          .split('@')[0]
          .split(':')[0] === botId
    );

    const targetParticipant = metadata?.participants?.find(
      p => normalizeJid(p?.id) === normalizeJid(participant)
    );

    if (!botParticipant) {
      return false;
    }

    // Bot must be admin
    const botIsAdmin =
      botParticipant.admin === 'admin' ||
      botParticipant.admin === 'superadmin';

    if (!botIsAdmin) {
      return false;
    }

    // Admin member-কে kick করা যাবে না
    if (
      targetParticipant?.admin === 'admin' ||
      targetParticipant?.admin === 'superadmin'
    ) {
      return false;
    }

    return true;

  } catch (error) {
    console.error(
      '❌ Anti-status permission check failed:',
      error?.message || error
    );

    return false;
  }
}

// ==========================================
// ANTI STATUS MAIN HANDLER
// ==========================================

async function handleAntiStatus(sock, message) {
  const groupId = message?.key?.remoteJid;

  if (!groupId?.endsWith('@g.us')) {
    return false;
  }

  if (message?.key?.fromMe) {
    return false;
  }

  if (!isAntiStatusOn(groupId)) {
    return false;
  }

  if (!isStoryMentionMessage(message)) {
    return false;
  }

  // ========================================
  // DUPLICATE STATUS EVENT BLOCK
  // ========================================

  if (isDuplicateStatusEvent(message)) {
    return true;
  }

  const participant = getParticipant(message);

  // ========================================
  // ADMIN EXEMPTION
  // ========================================
  // Group Admin-এর Status/Story Mention
  // delete হবে না এবং warning-ও যাবে না।
  // Admin-কে Anti Status কখনো kick করবে না.
  // ========================================

  if (participant) {
    const participantIsAdmin = await isParticipantAdmin(
      sock,
      groupId,
      participant
    );

    if (participantIsAdmin) {
      return false;
    }
  }

  // ========================================
  // DELETE STORY / STATUS
  // ========================================

  try {
    await sock.sendMessage(groupId, {
      delete: message.key
    });
  } catch (error) {
    console.error(
      '❌ Anti-status delete failed:',
      error?.message || error
    );
  }

  // ========================================
  // MEMBER NOT FOUND
  // ========================================

  if (!participant) {
    await sock.sendMessage(groupId, {
      text:
        `🛡️ *ANTI STATUS*\n\n` +
        `🚫 *দয়া করে কেউ 𝐆𝐫𝐨𝐮𝐩 এ 𝐒𝐭𝐨𝐫𝐲/𝐒𝐭𝐚𝐭𝐮𝐬 𝐌𝐞𝐧𝐭𝐢𝐨𝐧 দিবেন না।❌ধন্যবাদ____/*🙂\n` +
        `🗑️ Story/Status delete করে দেওয়া হয়েছে।\n\n` +
        `⚠️ Member identify করা যায়নি।`
    }).catch(() => {});

    return true;
  }

  const userTag = `@${participant.split('@')[0]}`;

  // ========================================
  // DAILY WARNING COUNT
  // ========================================

  const warning = getWarningData(
    groupId,
    participant
  );

  // ========================================
  // WARNING 1
  // ========================================

  if (warning === 1) {
    await sock.sendMessage(groupId, {
      text:
        `🛡️ *ANTI STATUS WARNING 1/3*\n\n` +
        `👤 *Member:* ${userTag}\n\n` +
        `🚫 *দয়া করে কেউ 𝐆𝐫𝐨𝐮𝐩 এ 𝐒𝐭𝐨𝐫𝐲/𝐒𝐭𝐚𝐭𝐮𝐬 𝐌𝐞𝐧𝐭𝐢𝐨𝐧 দিবেন না।❌ধন্যবাদ____/*🙂\n` +
        `🗑️ *আপনার Story/Status delete করে দেওয়া হয়েছে।*\n\n` +
        `⚠️ *এটি আপনার* *প্রথম warning।*\n` +
        `🙏 *অনুগ্রহ করে এই গ্রুপে আবার Story দেবেন না।*`,
      mentions: [participant]
    }).catch(() => {});

    return true;
  }

  // ========================================
  // WARNING 2
  // ========================================

  if (warning === 2) {
    await sock.sendMessage(groupId, {
      text:
        `⚠️ *ANTI STATUS WARNING 2/3*\n\n` +
        `👤 *Member:* ${userTag}\n\n` +
        `😐 *এতবার বোঝানোর পরেও Story দিচ্ছেন?*\n\n` +
        `🚫 *দয়া করে কেউ 𝐆𝐫𝐨𝐮𝐩 এ 𝐒𝐭𝐨𝐫𝐲/𝐒𝐭𝐚𝐭𝐮𝐬 𝐌𝐞𝐧𝐭𝐢𝐨𝐧 দিবেন না।❌ধন্যবাদ____/*🙂\n` +
        `🗑️ *আপনার Story/Status আবারও delete করে দেওয়া হয়েছে।*\n\n` +
        `⚠️ *এটি আপনার* *দ্বিতীয় warning।*\n` +
        `🚨 *পরেরবার FINAL ACTION নেওয়া হবে।*`,
      mentions: [participant]
    }).catch(() => {});

    return true;
  }

  // ========================================
  // WARNING 3
  // ========================================

  if (warning === 3) {

    // ======================================
    // KICK ON
    // ======================================

    if (isAntiStatusKickOn(groupId)) {
      try {

        await sock.sendMessage(groupId, {
          text:
            `🚨 *ANTI STATUS FINAL WARNING 3/3*\n\n` +
            `👤 *Member:* ${userTag}\n\n` +
            `😤 *দিনে কতবার Story দেন?*\n` +
            `*এতবার বলার পরেও Story দিচ্ছেন!*\n\n` +
            `🚫 *দয়া করে কেউ 𝐆𝐫𝐨𝐮𝐩 এ 𝐒𝐭𝐨𝐫𝐲/𝐒𝐭𝐚𝐭𝐮𝐬 𝐌𝐞𝐧𝐭𝐢𝐨𝐧 দিবেন না।❌ধন্যবাদ____/*🙂\n` +
            `🗑️ *আপনার Story/Status delete করে দেওয়া হয়েছে।*\n\n` +
            `👢 *3টি warning complete!*\n` +
            `🚫 *এখন আপনাকে Group থেকে remove করা হবে।*`,
          mentions: [participant]
        }).catch(() => {});

        const canKick = await canKickParticipant(
          sock,
          groupId,
          participant
        );

        if (!canKick) {
          await sock.sendMessage(groupId, {
            text:
              `⚠️ *ANTI STATUS 3/3*\n\n` +
              `👤 *Member:* ${userTag}\n\n` +
              `❌ *Member-কে auto-kick করা যায়নি।*\n` +
              `💡 *Bot-কে Group Admin করুন। Admin member-কে auto-kick করা হবে না।*`,
            mentions: [participant]
          }).catch(() => {});

          return true;
        }

        await sock.groupParticipantsUpdate(
          groupId,
          [participant],
          'remove'
        );

        // Kick-এর পরে count reset
        const data = load();

        if (data.antistatus?.[groupId]?.warnings) {
          delete data.antistatus[groupId].warnings[participant];
        }

        save(data);

        return true;

      } catch (error) {

        console.error(
          '❌ Anti-status kick failed:',
          error?.message || error
        );

        await sock.sendMessage(groupId, {
          text:
            `🚨 *ANTI STATUS FINAL WARNING 3/3*\n\n` +
            `👤 *Member:* ${userTag}\n\n` +
            `😤 *দিনে কতবার Story দেন?*\n` +
            `*এতবার বলার পরেও Story দিচ্ছেন!*\n\n` +
            `🚫 *দয়া করে কেউ 𝐆𝐫𝐨𝐮𝐩 এ 𝐒𝐭𝐨𝐫𝐲/𝐒𝐭𝐚𝐭𝐮𝐬 𝐌𝐞𝐧𝐭𝐢𝐨𝐧 দিবেন না।❌ধন্যবাদ____/*🙂\n\n` +
            `❌ *Member-কে kick করা যায়নি।*\n` +
            `💡 *Bot-কে Group Admin permission দিন।*`,
          mentions: [participant]
        }).catch(() => {});

        return true;
      }
    }

    // ======================================
    // KICK OFF
    // ======================================

    await sock.sendMessage(groupId, {
      text:
        `🚨 *ANTI STATUS WARNING 3/3*\n\n` +
        `👤 *Member:* ${userTag}\n\n` +
        `😤 *দিনে কতবার Story দেন?*\n` +
        `*এতবার বলার পরেও Story দিচ্ছেন!*\n\n` +
        `🚫 *দয়া করে কেউ 𝐆𝐫𝐨𝐮𝐩 এ 𝐒𝐭𝐨𝐫𝐲/𝐒𝐭𝐚𝐭𝐮𝐬 𝐌𝐞𝐧𝐭𝐢𝐨𝐧 দিবেন না।❌ধন্যবাদ____/*🙂\n` +
        `🗑️ *আপনার Story/Status delete করে দেওয়া হয়েছে।*\n\n` +
        `⚠️ *এটি আপনার* *FINAL WARNING।*\n` +
        `👢 *Kick এখন OFF আছে।*\n\n` +
        `💡 *Kick ON করার জন্য:*\n` +
        `.antistatus kick on`,
      mentions: [participant]
    }).catch(() => {});

    return true;
  }

  // ========================================
  // 3+ WARNINGS
  // ========================================

  if (warning > 3) {

    if (isAntiStatusKickOn(groupId)) {
      try {

        await sock.sendMessage(groupId, {
          text:
            `👢 *ANTI STATUS ACTION*\n\n` +
            `👤 ${userTag}\n\n` +
            `😤 *এতবার warning দেওয়ার পরেও Story দিচ্ছেন!*\n` +
            `🚫 *দয়া করে কেউ 𝐆𝐫𝐨𝐮𝐩 এ 𝐒𝐭𝐨𝐫𝐲/𝐒𝐭𝐚𝐭𝐮𝐬 𝐌𝐞𝐧𝐭𝐢𝐨𝐧 দিবেন না।❌ধন্যবাদ____/*🙂\n\n` +
            `🚨 *Warning limit exceeded.*\n` +
            `👢 *Member-কে remove করা হচ্ছে।*`,
          mentions: [participant]
        }).catch(() => {});

        const canKick = await canKickParticipant(
          sock,
          groupId,
          participant
        );

        if (!canKick) {
          await sock.sendMessage(groupId, {
            text:
              `⚠️ *ANTI STATUS ACTION*\n\n` +
              `👤 ${userTag}\n\n` +
              `❌ *Auto-kick করা যায়নি।*\n` +
              `💡 *Bot admin হতে হবে এবং target admin হওয়া যাবে না।*`,
            mentions: [participant]
          }).catch(() => {});

          return true;
        }

        await sock.groupParticipantsUpdate(
          groupId,
          [participant],
          'remove'
        );

        const data = load();

        if (data.antistatus?.[groupId]?.warnings) {
          delete data.antistatus[groupId].warnings[participant];
        }

        save(data);

      } catch (error) {
        console.error(
          '❌ Anti-status remove failed:',
          error?.message || error
        );
      }
    }

    return true;
  }

  return true;
}

export {
  setAntiStatus,
  isAntiStatusOn,
  setAntiStatusKick,
  isAntiStatusKickOn,
  isStoryMentionMessage,
  handleAntiStatus
};