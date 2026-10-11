import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

/*
 * Per-bot + per-group custom welcome message.
 *
 * Usage:
 *   .setwelcome <message>
 *   .setwelcome reset
 *
 * Placeholders:
 *   &mention / &username  -> new member mention
 *   &name / &group        -> group name
 *   &size                 -> group member count
 *   &pp                   -> member DP (when DP is enabled)
 *
 * Example:
 *   .setwelcome 👋 Welcome &mention to &group! We are now &size members.
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
  return `group:${groupJid}:welcome`;
}

Module({
  command: "setwelcome",
  aliases: ["setwlc"],
  package: "group",
  description: "Set a custom per-group welcome message",
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
        : { status: false, dp: false, video: false };

    if (!raw) {
      return message.sendreply?.(
        `╭─〔 *CUSTOM WELCOME* 〕\n` +
        `├─ Status: ${cfg.status ? "✅ ON" : "❌ OFF"}\n` +
        `├─ Message: ${cfg.customText ? cfg.customText : "Default welcome"}\n` +
        `╰─➤ .setwelcome Your message`
      );
    }

    if (raw.toLowerCase() === "reset" || raw.toLowerCase() === "default") {
      delete cfg.customText;
      await db.set(botNumber, key, cfg);
      return message.send?.("✅ Custom welcome মুছে দেওয়া হয়েছে। এখন default welcome message চলবে।");
    }

    cfg.customText = raw;
    await db.set(botNumber, key, cfg);

    return message.send?.(
      "✅ Custom welcome message save হয়েছে।\n\n" +
      "Available: &mention, &username, &name, &group, &size, &pp"
    );
  } catch (err) {
    console.error("[setwelcome] error:", err?.message || err);
    return message.send?.("❌ Welcome message save হয়নি।");
  }
});
