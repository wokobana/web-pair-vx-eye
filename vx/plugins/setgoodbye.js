import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

/*
 * Per-bot + per-group custom goodbye message.
 *
 * Usage:
 *   .setgoodbye <message>
 *   .setgoodbye reset
 *
 * Placeholders:
 *   &mention / &username  -> leaving member mention
 *   &name / &group        -> group name
 *   &size                 -> group member count
 *   &pp                   -> member DP
 *
 * Example:
 *   .setgoodbye 👋 &mention left &group. Members: &size
 *
 * Every connected bot has its own setting because the database key contains
 * the connected bot number and the group JID.
 */

function getGroupJid(message) {
  return message.from || message.chat || message.key?.remoteJid;
}

function getBotNumber(message) {
  return (
    (message.conn?.user?.id &&
      String(message.conn.user.id).split(":")[0]) ||
    "bot"
  );
}

function getKey(groupJid) {
  return `group:${groupJid}:goodbye`;
}

Module({
  command: "setgoodbye",
  aliases: [],
  package: "group",
  description: "Set a custom per-group goodbye message",
})(async (message, match = "") => {
  try {
    const groupJid = getGroupJid(message);

    if (!groupJid || !groupJid.includes("@g.us")) {
      return message.send?.("❌ এই command শুধুমাত্র Group-এ ব্যবহার করুন।");
    }

    await message.loadGroupInfo?.();

    if (!message.isAdmin && !message.isFromMe && !message.isfromMe) {
      return message.send?.("❌ শুধুমাত্র Group Admin এই setting পরিবর্তন করতে পারবেন।");
    }

    const botNumber = getBotNumber(message);
    const key = getKey(groupJid);
    const raw = String(match || "").trim();

    const current = await db.getAsync(botNumber, key, null);
    const cfg =
      current && typeof current === "object"
        ? { ...current }
        : { status: false };

    if (!raw) {
      return message.sendreply?.(
        `╭─〔 *CUSTOM GOODBYE* 〕\n` +
        `├─ Status: ${cfg.status ? "✅ ON" : "❌ OFF"}\n` +
        `├─ Message: ${cfg.customText ? cfg.customText : "Default goodbye"}\n` +
        `╰─➤ .setgoodbye Your message`
      );
    }

    if (raw.toLowerCase() === "reset" || raw.toLowerCase() === "default") {
      delete cfg.customText;
      await db.set(botNumber, key, cfg);
      return message.send?.("✅ Custom goodbye মুছে দেওয়া হয়েছে। এখন default goodbye message চলবে।");
    }

    cfg.customText = raw;
    await db.set(botNumber, key, cfg);

    return message.send?.(
      "✅ Custom goodbye message save হয়েছে।\n\n" +
      "Available: &mention, &username, &name, &group, &size, &pp"
    );
  } catch (err) {
    console.error("[setgoodbye] error:", err?.message || err);
    return message.send?.("❌ Goodbye message save হয়নি।");
  }
});
