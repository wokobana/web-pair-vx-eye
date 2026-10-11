import { Module } from "../lib/plugins.js";
import { areJidsSameUser, jidNormalizedUser } from "@whiskeysockets/baileys";

function normalizeJid(jid) {
  if (!jid) return null;
  const value = String(jid).trim();
  if (!value) return null;
  try {
    if (value.includes("@")) return jidNormalizedUser(value);
  } catch {}
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? `${digits}@s.whatsapp.net` : null;
}

function sameUser(a, b) {
  const A = normalizeJid(a);
  const B = normalizeJid(b);
  if (!A || !B) return false;
  try {
    return areJidsSameUser(A, B);
  } catch {
    const clean = (jid) => String(jid).replace(/:\d+(?=@)/, "").toLowerCase();
    return clean(A) === clean(B);
  }
}

function getBotJids(message) {
  const ids = [
    message?.botJid,
    message?.bot,
    message?.conn?.user?.id,
    message?.conn?.user?.lid,
    message?.client?.user?.id,
    message?.client?.user?.lid,
  ].filter(Boolean);

  return [...new Set(ids.map(normalizeJid).filter(Boolean))];
}

Module({
  command: "kick",
  aliases: ["remove"],
  package: "group",
  description: "Remove a member from the group (admins only)",
})(async (message) => {
  try {
    if (!message.isGroup) {
      return message.reply("❌ *এই কমান্ডটি শুধুমাত্র Group-এ ব্যবহার করা যাবে।*");
    }

    await message.loadGroupInfo();

    if (!message.isAdmin && !message.isFromMe && !message.isfromMe) {
      return message.reply("❌ শুধুমাত্র Group Admin-ই member-কে kick করতে পারবেন।");
    }

    if (!message.isBotAdmin) {
      return message.reply("❌ *প্রথমে আমাকে Group Admin করুন, তারপর আমি member-কে kick করতে পারব।*");
    }

    // Priority: mention > replied message
    let target = message.mentions?.[0] || message.quoted?.participant || null;
    target = normalizeJid(target);

    if (!target) {
      return message.reply(
        "❌ কাকে kick করতে হবে?\n\n" +
        "📌 কারও message-এ Reply করে `.kick` লিখুন\n" +
        "অথবা `.kick @user` লিখুন।"
      );
    }

    // IMPORTANT: compare both PN and LID forms so the bot can never
    // accidentally remove its own account when WhatsApp returns a LID.
    const botJids = getBotJids(message);
    if (botJids.some((botJid) => sameUser(target, botJid))) {
      return message.reply("❌ *আমি নিজেকে kick করতে পারি না।*");
    }

    const owner = normalizeJid(message.groupOwner);
    if (owner && sameUser(target, owner)) {
      return message.reply("❌ *Group Owner-কে kick করা যাবে না।*");
    }

    const participants = Array.isArray(message.groupParticipants)
      ? message.groupParticipants
      : [];

    const participant = participants.find((p) =>
      sameUser(typeof p === "string" ? p : p?.id, target)
    );

    if (!participant) {
      return message.reply("❌ *এই user এই Group-এর member নয়।*");
    }

    const participantJid = normalizeJid(
      typeof participant === "string" ? participant : participant?.id
    );

    // Re-check the actual participant returned by group metadata.
    if (botJids.some((botJid) => sameUser(participantJid, botJid))) {
      return message.reply("❌ *Safety protection: bot account cannot be removed.*");
    }

    const targetIsAdmin = message.groupAdmins?.some((admin) =>
      sameUser(admin, participantJid || target)
    );

    if (targetIsAdmin) {
      return message.reply("❌ *অন্য কোনো Group Admin-কে kick করা যাবে না।*");
    }

    const result = await message.removeParticipant(participantJid || target);

    if (!result) {
      return message.reply("❌ *Member-কে kick করতে সমস্যা হয়েছে।*");
    }

    return message.reply(
      `╭──────꒷꒦♡꒦꒷─────♪꯭➛
*│তোমাকে 𝐆𝐫𝐨𝐮𝐩 থেকে 𝐑𝐞𝐦𝐨𝐯𝐞*
*│করা হলো কিছু মনে কোরো না।*
*│ যদি জানতে ইচ্ছে করে কেন*      
*│𝐑𝐞𝐦𝐨𝐯𝐞 করা হয়েছে।*
*│তাহলে 𝐀𝐝𝐦𝐢𝐧 কে 𝐬𝐦𝐬 দাও*😮‍💨🥰
*╰── ═════════════════♪꯭➛*\n\n👤 @${(participantJid || target).split("@")[0]}`,
      { mentions: [participantJid || target] }
    );
  } catch (error) {
    console.error("[kick] error:", error?.message || error);
    return message.reply(`❌ Kick failed!\n\n${error?.message || "Unknown error"}`);
  }
});
