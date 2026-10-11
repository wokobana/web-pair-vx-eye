import { Module } from "../lib/plugins.js";

/* -------------------------------------------------------------------------- */
/* JID HELPERS                                                                */
/* -------------------------------------------------------------------------- */

function normalizeJid(jid) {
  if (!jid) return "";

  return String(jid)
    .trim()
    .toLowerCase()
    .replace(/:\d+(?=@)/, "");
}

function isSameJid(a, b) {
  if (!a || !b) return false;

  const x = normalizeJid(a);
  const y = normalizeJid(b);

  if (!x || !y) return false;

  if (x === y) return true;

  /*
   * Compare user number part also.
   * Example:
   * 917xxxxxxxxx:12@s.whatsapp.net
   * 917xxxxxxxxx@s.whatsapp.net
   */

  const xa = x.split("@")[0];
  const ya = y.split("@")[0];

  return xa === ya;
}

/* -------------------------------------------------------------------------- */
/* ADMIN CHECK                                                                */
/* -------------------------------------------------------------------------- */

function isParticipantAdmin(participant) {
  if (!participant) return false;

  return (
    participant.admin === "admin" ||
    participant.admin === "superadmin" ||
    participant.admin === "owner"
  );
}

/* -------------------------------------------------------------------------- */
/* FIND PARTICIPANT                                                           */
/* -------------------------------------------------------------------------- */

function findParticipant(participants, jid) {
  if (!Array.isArray(participants) || !jid) return null;

  return (
    participants.find((p) => {
      const ids = [
        p?.id,
        p?.jid,
        p?.participant,
        p?.phoneNumber,
        p?.lid,
      ].filter(Boolean);

      return ids.some((id) => isSameJid(id, jid));
    }) || null
  );
}

/* -------------------------------------------------------------------------- */
/* OPEN COMMAND                                                               */
/* -------------------------------------------------------------------------- */

Module({
  command: "open",
  package: "group",
  description: "Open the group (admins only)",
})(async (message) => {
  /* ------------------------------------------------------------------------ */
  /* GROUP CHECK                                                              */
  /* ------------------------------------------------------------------------ */

  if (!message?.isGroup) {
    return message.reply(
      "❌ This command can only be used in a group."
    );
  }

  try {
    /* ---------------------------------------------------------------------- */
    /* LOAD GROUP INFO                                                        */
    /* ---------------------------------------------------------------------- */

    await message.loadGroupInfo();

    const metadata =
      message.groupMetadata ||
      message.groupInfo ||
      {};

    const participants =
      Array.isArray(metadata.participants)
        ? metadata.participants
        : [];

    if (!participants.length) {
      return message.reply(
        "❌ Unable to read group participants."
      );
    }

    /* ---------------------------------------------------------------------- */
    /* GET SENDER                                                              */
    /* ---------------------------------------------------------------------- */

    const senderIds = [
      message.sender,
      message.participant,
      message.key?.participant,
      message.key?.remoteJid,
    ].filter(Boolean);

    /* ---------------------------------------------------------------------- */
    /* CHECK SENDER ADMIN                                                     */
    /* ---------------------------------------------------------------------- */

    let senderParticipant = null;

    for (const senderId of senderIds) {
      senderParticipant =
        findParticipant(
          participants,
          senderId
        );

      if (senderParticipant) break;
    }

    /*
     * Some serializers already expose message.isAdmin.
     * If available and true, accept it.
     */

    const senderIsAdmin =
      message.isAdmin === true ||
      isParticipantAdmin(senderParticipant);

    if (!senderIsAdmin) {
      return message.reply(
        "❌ Only group admins can use this command."
      );
    }

    /* ---------------------------------------------------------------------- */
    /* GET BOT JIDS                                                           */
    /* ---------------------------------------------------------------------- */

    const botUser =
      message.conn?.user || {};

    const botIds = [
      botUser.id,
      botUser.lid,
      botUser.jid,
      botUser?.phoneNumber,
      message.conn?.user?.verifiedName,
    ].filter(Boolean);

    /* ---------------------------------------------------------------------- */
    /* FIND BOT PARTICIPANT                                                   */
    /* ---------------------------------------------------------------------- */

    let botParticipant = null;

    for (const botId of botIds) {
      botParticipant =
        findParticipant(
          participants,
          botId
        );

      if (botParticipant) break;
    }

    /* ---------------------------------------------------------------------- */
    /* BOT ADMIN CHECK                                                        */
    /* ---------------------------------------------------------------------- */

    const botIsAdmin =
      isParticipantAdmin(botParticipant);

    /*
     * Some Baileys/serializers expose bot admin status directly.
     */

    const botAdminByMessage =
      message.isBotAdmin === true ||
      message.botIsAdmin === true;

    if (!botIsAdmin && !botAdminByMessage) {
      return message.reply(
        "❌ *Bot must be an admin to open the group.*\n\n" +
        "👉 👉 প্রথমে bot-কে group-এর admin করুন, তারপর `.open` পাঠান।"
      );
    }

    /* ---------------------------------------------------------------------- */
    /* OPEN GROUP                                                             */
    /* ---------------------------------------------------------------------- */

    await message.conn.groupSettingUpdate(
      message.from,
      "not_announcement"
    );

    /* ---------------------------------------------------------------------- */
    /* SUCCESS MESSAGE                                                        */
    /* ---------------------------------------------------------------------- */

    const text = `🔓 *GROUP OPENED SUCCESSFULLY* 🔓

╭─────────────────────╮
│ ✮⃟≛⃝≛⃟ ⃝≛⃟ *𝐆𝐫𝐨𝐮𝐩 𝐎𝐩𝐞𝐧* ⃟≛⃝≛⃟✮
│
│ ♡ ➤ *পাখির ডাকে সকাল হলো* 🕊️
│
│ ♡ ➤ *𝙂𝙤𝙤𝙙 𝙈𝙤𝙧𝙣𝙞𝙣𝙜 𝙎𝙤𝙗𝙖𝙞 𝘽𝙤𝙡𝙤* ☀️
│
│ ♡ ➤ *বউ থাকলে চুমু দাও* 😘
│
│ ♡ ➤ *𝙉𝙖 𝙏𝙝𝙖𝙠𝙡𝙚 𝘼𝙧𝙤 𝙂𝙝𝙪𝙢𝙖𝙤* 🛌
│
│ ♡ ➤ *জামাই থাকলে হাত ধরো* 🤝
│
│ ♡ ➤ *𝙉𝙖 𝙏𝙝𝙖𝙠𝙡𝙚 𝙈𝙤𝙗𝙖𝙞𝙡 𝙂𝙝𝙖𝙩𝙤* 📱
│
│ ♡ ➤ *চা কফি গরম গরম* ☕
│
│ ♡ ➤ *𝙎𝙞𝙣𝙜𝙡𝙚 𝙍𝙖 𝙋𝙖𝙞 𝙎𝙤𝙧𝙤𝙢* 😂
│
│ ♡ ➤ *গ্রুপে সবাই মজা করো* 🎉
│
│ ♡ ➤ *𝙍𝙖𝙩𝙚 𝘼𝙗𝙖𝙧 𝘼𝙙𝙙𝙖 𝙅𝙤𝙧𝙤* 🌃
│
│ ╰➤ *𝐆𝐫𝐨𝐮𝐩 :* 𝐎𝐅𝐅 ❌
│ ╰➤ *𝐆𝐫𝐨𝐮𝐩 :* 𝐎𝐍 ✅
│
│ 🥰 *𝐆𝐨𝐨𝐝 𝐌𝐨𝐫𝐧𝐢𝐧𝐠 𝐄𝐯𝐞𝐫𝐲𝐨𝐧𝐞* 🥰
╰─────────────────────╯

♡────────────────────♡
*𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧* 🫶🏻`;

    await message.reply(text);

  } catch (error) {
    console.error(
      "[open.js ERROR]",
      error?.stack ||
      error?.message ||
      error
    );

    await message.reply(
      `❌ *Failed to open the group.*\n\n` +
      `Error: ${
        error?.message ||
        error ||
        "Unknown error"
      }`
    );
  }
});
