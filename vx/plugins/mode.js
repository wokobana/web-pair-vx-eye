import { db } from "../lib/client.js";
import { Module } from "../lib/plugins.js";

Module({
  command: "mode",
  aliases: ["botmode"],
  package: "owner",
  description: "Set bot mode: public or private",
})(async (message, match) => {
  if (!message.isOwner) return message.reply("❌ Ye command sirf bot owner ke liye hai.");

  const mode = String(match || "").trim().toLowerCase();
  const current = db.get(message.botnum, "mode", true) === true ? "public" : "private";

  if (!mode || !["public", "private", "status"].includes(mode)) {
    return message.reply(
      `╭─〔 ⚙️ BOT MODE 〕─╮\n` +
      `┃ Current : *${current.toUpperCase()}*\n` +
      `┃ .mode public  — Everyone can use commands\n` +
      `┃ .mode private — Only owner can use commands\n` +
      `┃ .mode status  — Show current mode\n` +
      `╰━━━━━━━━━━━━━━━━╯`
    );
  }

  if (mode === "status") {
    return message.reply(`⚙️ Bot mode is currently *${current.toUpperCase()}*.`);
  }

  const isPublic = mode === "public";
  await db.set(message.botnum, "mode", isPublic);
  return message.reply(
    isPublic
      ? "✅ *PUBLIC MODE ON*\nAb sabhi users bot ke commands use kar sakte hain."
      : "🔒 *PRIVATE MODE ON*\nAb sirf bot owner ke commands process honge."
  );
});
