import { Module } from "../lib/plugins.js";
import {
  makeGroupStatusContent,
  broadcastGroupStatus,
  isOwnerMessage,
  describeContent,
} from "./groupstatus.js";

/*
|--------------------------------------------------------------------------
| SWGCV2 ALL - GROUP STATUS V2 BROADCAST (direct, no confirmation)
|--------------------------------------------------------------------------
|   .swgcv2all Hello everyone            -> text (different colour in every group)
|   .swgcv2all #ff0000 Hello             -> text with one fixed colour
|   reply photo/video/audio + .swgcv2all -> media status in ALL groups
|
| NOTE: the alias "swgcall" was removed from this file. swgcall.js is its own
| command (with confirmation) and both used to fight over the same name.
|--------------------------------------------------------------------------
*/

Module({
  command: "swgcv2all",
  aliases: ["statusgrupv2all", "gswall"],
  package: "owner",
  description: "Post Group Status V2 ke SEMUA grup",
})(async (message, args = "") => {
  try {
    if (!isOwnerMessage(message)) {
      return message.reply("❌ *Only bot owner can use this command.*");
    }

    const conn = message?.conn;
    if (!conn) return message.reply("❌ *WhatsApp connection unavailable.*");

    const rawContent = await makeGroupStatusContent(message, args);

    if (!rawContent) {
      const prefix = String(message?.prefix || global.config?.PREFIX || global.config?.prefix || ".");
      return message.reply(
        `╭━━〔 *SWGCV2 ALL* 〕━━╮\n` +
          `┃\n` +
          `┃ 📝 Text:\n` +
          `┃ ${prefix}swgcv2all Hello everyone\n` +
          `┃ ${prefix}swgcv2all #ff0000 Hello\n` +
          `┃\n` +
          `┃ 🖼️ Image:\n` +
          `┃ Reply image + command\n` +
          `┃\n` +
          `┃ 🎥 Video:\n` +
          `┃ Reply video + command\n` +
          `┃\n` +
          `┃ 🎵 Audio:\n` +
          `┃ Reply audio + command\n` +
          `┃\n` +
          `╰━━━━━━━━━━━━━━━━━━╯`
      );
    }

    try { await message.react?.("🕕"); } catch {}

    if (typeof conn.groupFetchAllParticipating !== "function") {
      throw new Error("groupFetchAllParticipating is unavailable.");
    }

    global.isFetchingGroups = true;
    let groups;
    try {
      groups = await conn.groupFetchAllParticipating();
    } finally {
      global.isFetchingGroups = false;
    }

    const groupIds = Object.keys(groups || {});
    if (groupIds.length === 0) {
      await message.react?.("❌");
      return message.reply("❌ Bot tidak berada di grup manapun.");
    }

    const names = {};
    for (const id of groupIds) names[id] = groups[id]?.subject || id;

    const info = describeContent(rawContent);
    await message.reply(
      `⏳ *Memulai Broadcast Status Grup V2 ke ${groupIds.length} Grup...*\n\n` +
        `> ${info.icon} Tipe: ${info.label}\n` +
        `> Proses ini mungkin memakan waktu beberapa saat.`
    );

    const result = await broadcastGroupStatus(conn, groupIds, rawContent, { names });

    await message.react?.(result.success > 0 ? "✅" : "❌");

    let report =
      `✅ *sᴡɢᴄᴠ2 ᴀʟʟ sᴇʟᴇsᴀɪ*\n\n` +
      `╭┈┈⬡「 📊 *ʀᴇsᴜʟᴛ* 」\n` +
      `┃ 🌐 Total Grup: *${result.total}*\n` +
      `┃ ✅ Sukses: *${result.success}*\n` +
      `┃ ❌ Gagal: *${result.failed}*\n` +
      `┃ ⏳ Rate-limit retry: *${result.rateLimited}*\n` +
      `╰┈┈┈┈┈┈┈┈⬡\n\n`;

    if (result.failed > 0) {
      const shown = result.failures.slice(0, 5)
        .map((f) => `> • ${f.name}: ${String(f.error).slice(0, 80)}`)
        .join("\n");
      report += `*Gagal di:*\n${shown}` +
        (result.failures.length > 5 ? `\n> ...+${result.failures.length - 5} lainnya` : "") + `\n\n`;
    }

    report += result.failed === 0
      ? `> Broadcast Status Grup V2 berhasil dikirim ke semua grup!`
      : `> Broadcast selesai (sebagian grup gagal, lihat daftar di atas).`;

    await message.reply(report);
  } catch (error) {
    global.isFetchingGroups = false;
    console.error("[SwgcV2All] Error:", error?.message || error);
    try { await message.react?.("☢"); } catch {}
    await message.reply(`❌ *ᴇʀʀᴏʀ*\n\n> ${error?.message || "Unknown error"}`);
  }
});
