import { Module } from "../lib/plugins.js";
import fs from "fs";
import path from "path";

/**
 * Normalize WhatsApp JID
 * Example:
 * 123456789:12@s.whatsapp.net
 *        ↓
 * 123456789@s.whatsapp.net
 */
function normalizeJid(jid) {
  if (!jid) return "";

  return String(jid)
    .trim()
    .replace(/:\d+(?=@)/, "")
    .toLowerCase();
}

/**
 * Get all possible JIDs from a participant
 */
function getParticipantJids(participant) {
  if (!participant) return [];

  return [
    participant.id,
    participant.jid,
    participant.lid,
    participant.pn,
    participant.phoneNumber,
  ]
    .filter(Boolean)
    .map(normalizeJid)
    .filter(Boolean);
}

/**
 * Check whether a participant is admin
 */
function isParticipantAdmin(participant) {
  if (!participant) return false;

  return (
    participant.admin === "admin" ||
    participant.admin === "superadmin" ||
    participant.role === "admin" ||
    participant.role === "superadmin"
  );
}

/**
 * Find participant by any matching JID
 */
function findParticipant(participants, jidList) {
  const wanted = jidList
    .filter(Boolean)
    .map(normalizeJid);

  if (!wanted.length) return null;

  return (
    participants.find((participant) => {
      const participantJids = getParticipantJids(participant);

      return participantJids.some((jid) =>
        wanted.includes(jid)
      );
    }) || null
  );
}

Module({
  command: "close",
  package: "group",
  description: "Close the group (admins only)",
})(async (message) => {

  // ==========================================
  // GROUP CHECK
  // ==========================================
  if (!message.isGroup) {
    return message.reply(
      "❌ This command can only be used in a group."
    );
  }

  try {

    // ==========================================
    // LOAD GROUP INFORMATION
    // ==========================================
    await message.loadGroupInfo();

    const metadata =
      message.groupMetadata ||
      message.groupInfo ||
      {};

    const participants = Array.isArray(
      metadata.participants
    )
      ? metadata.participants
      : [];

    if (!participants.length) {
      return message.reply(
        "❌ Unable to get group participants."
      );
    }

    // ==========================================
    // GET SENDER JIDS
    // ==========================================
    const senderJids = [
      message.sender,
      message.participant,
      message.key?.participant,
      message.key?.senderPn,
      message.key?.senderLid,
    ]
      .filter(Boolean)
      .map(normalizeJid);

    // ==========================================
    // CHECK COMMAND USER ADMIN
    // ==========================================
    const senderParticipant = findParticipant(
      participants,
      senderJids
    );

    const senderIsAdmin =
      senderParticipant &&
      isParticipantAdmin(senderParticipant);

    if (!senderIsAdmin) {
      return message.reply(
        "❌ Only group admins can use this command."
      );
    }

    // ==========================================
    // GET BOT JIDS
    // ==========================================
    const botJids = [
      message.conn?.user?.id,
      message.conn?.user?.jid,
      message.conn?.user?.lid,
      message.conn?.user?.phoneNumber,
    ]
      .filter(Boolean)
      .map(normalizeJid);

    // Some Baileys versions keep bot LID here
    if (message.conn?.user?.lid) {
      botJids.push(
        normalizeJid(message.conn.user.lid)
      );
    }

    // ==========================================
    // FIND BOT PARTICIPANT
    // ==========================================
    const botParticipant = findParticipant(
      participants,
      botJids
    );

    // ==========================================
    // CHECK BOT ADMIN
    // ==========================================
    const botIsAdmin =
      botParticipant &&
      isParticipantAdmin(botParticipant);

    if (!botIsAdmin) {
      console.log(
        "[close.js] Bot admin check failed:",
        {
          botJids,
          botParticipant,
          participants: participants.map((p) => ({
            id: p.id,
            jid: p.jid,
            lid: p.lid,
            admin: p.admin,
            role: p.role,
          })),
        }
      );

      return message.reply(
        "❌ *Bot must be an admin to close the group.*\n\n" +
        "👉 👉 প্রথমে bot-কে group-এর *Admin* করুন, তারপর `.close` চালান।"
      );
    }

    // ==========================================
    // CLOSE GROUP
    // ==========================================
    await message.conn.groupSettingUpdate(
      message.from,
      "announcement"
    );

    // ==========================================
    // SUCCESS TEXT / VIDEO CAPTION
    // ==========================================
    const text = `🔒 *Group Closed*

╭─────────────────╮
│ ✮͢⃟≛⃝≛⃝𝐆𝐨𝐨𝐝 𝐍𝐢𝐠𝐡𝐭 𝐈𝐧𝐭𝐫𝐨⃟≛⃝ ⃟≛⃝✮
│╭─────── ♡ ───────
││♡ ➤ *কুত্তার চোখে জ্বল* 🐕💦
││
││♡ ➤ *𝙶𝚘𝚘𝚍 𝚗𝚒𝚐𝚑𝚝 𝚊𝚕𝚕* 😴
││
││♡ ➤ *বউ থাকলে চুমাও* 😘
││
││♡ ➤ *𝙽𝚊 𝚝𝚑𝚊𝚔𝚕𝚎 𝚐𝚑𝚞𝚖𝚊𝚠* 😴
││
││♡ ➤ *জামাই থাকলে চুমাও* 💋
││
││♡ ➤ *𝙽𝚊 𝚝𝚑𝚊𝚔𝚕𝚎 𝚐𝚑𝚞𝚖𝚊𝚠* 😂
││
││♡ ➤ *গাইস বউ নাই কপালে* 🤦‍♂️
││
││♡ ➤ *𝚔𝚘𝚝𝚑𝚊 𝚑𝚘𝚋𝚎 𝚜𝚘𝚔𝚊𝚕𝚎* 🥰
│╰────────────────
│╰➤ 𝐆𝐨𝐨𝐝 𝐍𝐢𝐠𝐡𝐭 𝐄𝐯𝐞𝐫𝐲𝐨𝐧𝐞 🥰
│╰➤ 𝐆𝐫𝐨𝐮𝐩 : 𝐎𝐟𝐟 ❌
│╰➤ 𝐆𝐫𝐨𝐮𝐩 : 𝐎𝐧 ✅
│╰➤ 𝐎𝐩𝐞𝐧 𝐓𝐢𝐦𝐞 : 𝐀𝐝𝐦𝐢𝐧 𝐚𝐬𝐥𝐞
│
│🥰 𝐓𝐡𝐚𝐧𝐤𝐬 𝐘𝐨𝐮 𝐄𝐯𝐞𝐫𝐲𝐨𝐧𝐞 🥰
♡─────────────────♡`;

    // ==========================================
    // FIND CLOSE MP4
    // ==========================================
    const videoCandidates = [
      path.join(process.cwd(), "media", "close.mp4"),
      path.join(process.cwd(), "assets", "close.mp4"),
      path.join(process.cwd(), "close.mp4"),
    ];

    const videoPath = videoCandidates.find((file) =>
      fs.existsSync(file)
    );

    // ==========================================
    // SEND VIDEO + TEXT TOGETHER
    // ==========================================
    if (videoPath) {
      try {
        await message.conn.sendMessage(
          message.from,
          {
            video: {
              url: videoPath,
            },
            mimetype: "video/mp4",
            caption: text,
          }
        );

        console.log(
          "[close.js] Close video + caption sent successfully."
        );

      } catch (videoError) {
        console.error(
          "[close.js] Video send failed:",
          videoError
        );

        // Video failed → send text only
        await message.reply(text);
      }

    } else {
      // ==========================================
      // VIDEO NOT FOUND → TEXT FALLBACK
      // ==========================================
      console.log(
        "[close.js] close.mp4 not found. Sending text only."
      );

      await message.reply(text);
    }

  } catch (error) {
    console.error(
      "[close.js] Error:",
      error
    );

    await message.reply(
      `❌ *Failed to close the group.*\n\n` +
      `Error: ${error?.message || error}`
    );
  }
});
