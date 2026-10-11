import { Module } from "../lib/plugins.js";
import config from "../config.js";
import {
  makeGroupStatusContent,
  broadcastGroupStatus,
  isOwnerMessage,
  describeContent,
} from "./groupstatus.js";

/*
|--------------------------------------------------------------------------
| SWGCALL - Group Status to ALL groups (with confirmation)
|--------------------------------------------------------------------------
|   .swgcall Hello                    -> prepare text status
|   reply photo/video/audio + .swgcall -> prepare media status
|   .swgcall --yes                    -> confirm and broadcast
|   .swgcall --cancel  (or .cancelswgcall)
|
| The confirmation works with plain text commands, so it does NOT depend on
| interactive buttons (stock Baileys cannot send `interactiveButtons`). Buttons
| are still attempted through gifted-btns as an extra convenience.
|--------------------------------------------------------------------------
*/

const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingSwgcall = new Map(); // single slot: owner only

function getPending() {
  const p = pendingSwgcall.get("owner");
  if (!p) return null;
  if (Date.now() - p.timestamp > PENDING_TTL_MS) {
    pendingSwgcall.delete("owner");
    return null;
  }
  return p;
}

async function trySendButtons(message, { title, text, footer, buttons }) {
  try {
    const mod = await import("gifted-btns");
    const send = mod.sendButtons || mod.default?.sendButtons;
    if (typeof send !== "function") return false;
    await send(message.conn, message.from, { title, text, footer, buttons });
    return true;
  } catch (e) {
    console.warn("[swgcall] buttons unavailable, using text:", e?.message || e);
    return false;
  }
}

Module({
  command: "swgcall",
  aliases: ["swgcbroadcast", "swgcbc", "cancelswgcall"],
  package: "owner",
  description: "Post Group Status/Story ke SEMUA grup (dengan konfirmasi)",
})(async (message, args = "") => {
  try {
    if (!isOwnerMessage(message)) return message.reply("❌ Owner only.");

    const conn = message.conn;
    if (!conn) return message.reply("❌ *WhatsApp connection unavailable.*");

    const prefix = config.prefix || ".";
    const body = String(message.body || "").trim();
    const usedCmd = body.startsWith(prefix)
      ? body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()
      : "";
    const argText = String(args || "").trim();

    /* ---------------------------- cancel ---------------------------- */
    if (usedCmd === "cancelswgcall" || /^--cancel$/i.test(argText)) {
      pendingSwgcall.delete("owner");
      return message.reply("❌ *SWGCALL DIBATALKAN*\n\n> Broadcast story dibatalkan.");
    }

    /* ---------------------------- confirm --------------------------- */
    if (/^--yes$/i.test(argText)) {
      const pending = getPending();
      if (!pending) {
        return message.reply(
          `⚠️ *Tidak ada data pending / sudah kadaluarsa.*\n\n> Kirim ulang media atau teks dengan ${prefix}swgcall`
        );
      }
      pendingSwgcall.delete("owner"); // prevents double broadcast

      await message.react?.("🔄");

      global.isFetchingGroups = true;
      let groups;
      try {
        groups = await conn.groupFetchAllParticipating();
      } finally {
        global.isFetchingGroups = false;
      }

      const groupIds = Object.keys(groups || {});
      if (groupIds.length === 0) return message.reply("⚠️ *Bot tidak berada di grup manapun.*");

      const names = {};
      for (const id of groupIds) names[id] = groups[id]?.subject || id;

      await message.reply(`⏳ *Broadcast dimulai ke ${groupIds.length} grup...*`);

      const result = await broadcastGroupStatus(conn, groupIds, pending.content, {
        names,
        delayMin: 1200,
        delayMax: 2200,
      });

      let report =
        `✅ *ʙʀᴏᴀᴅᴄᴀsᴛ sᴡɢᴄ sᴇʟᴇsᴀɪ*\n\n` +
        `> Total: *${result.total}* grup\n` +
        `> Sukses: *${result.success}* ✅\n` +
        `> Gagal: *${result.failed}* ❌`;

      if (result.failed > 0) {
        report +=
          `\n\n*Grup gagal:*\n` +
          result.failures.slice(0, 10).map((f) => `> • ${f.name} — ${String(f.error).slice(0, 60)}`).join("\n") +
          (result.failures.length > 10 ? `\n> ...+${result.failures.length - 10} lainnya` : "");
      }

      await message.reply(report);
      await message.react?.(result.success > 0 ? "✅" : "❌");
      return;
    }

    /* ------------------------ prepare content ----------------------- */
    let content;
    try {
      content = await makeGroupStatusContent(message, argText);
    } catch (e) {
      return message.reply(`❌ *ᴇʀʀᴏʀ*\n\n> ${e?.message || "Media download failed."}`);
    }

    if (!content) {
      return message.reply(
        `⚠️ *ᴄᴀʀᴀ ᴘᴀᴋᴀɪ*\n\n` +
          `> \`${prefix}swgcall teks\` - Story teks ke semua grup\n` +
          `> \`${prefix}swgcall #ff0000 teks\` - teks dengan warna sendiri\n` +
          `> Reply gambar/video/audio + \`${prefix}swgcall\`\n` +
          `> Kirim gambar/video + caption \`${prefix}swgcall\``
      );
    }

    global.isFetchingGroups = true;
    let groupCount = 0;
    try {
      const groups = await conn.groupFetchAllParticipating();
      groupCount = Object.keys(groups || {}).length;
    } finally {
      global.isFetchingGroups = false;
    }

    if (groupCount === 0) return message.reply("⚠️ *Bot tidak berada di grup manapun.*");

    pendingSwgcall.set("owner", { content, timestamp: Date.now() });

    const info = describeContent(content);
    const estimate = Math.ceil(groupCount * 2);
    const text =
      `📢 *ᴋᴏɴꜰɪʀᴍᴀsɪ ʙʀᴏᴀᴅᴄᴀsᴛ sᴡɢᴄ*\n\n` +
      `> Media: *${info.icon} ${info.label}*\n` +
      `> Total Grup: *${groupCount}*\n` +
      `> Estimasi: *~${estimate} detik*\n\n` +
      `✅ Kirim: *${prefix}swgcall --yes*\n` +
      `❌ Batal: *${prefix}swgcall --cancel*\n\n` +
      `_Konfirmasi berlaku 5 menit._`;

    const sent = await trySendButtons(message, {
      title: "📢 Konfirmasi Broadcast SWGC",
      text,
      footer: "𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧",
      buttons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: `✅ Kirim ke ${groupCount} Grup`,
            id: `${prefix}swgcall --yes`,
          }),
        },
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({ display_text: "❌ Batal", id: `${prefix}swgcall --cancel` }),
        },
      ],
    });

    if (!sent) await message.reply(text);
  } catch (error) {
    global.isFetchingGroups = false;
    console.error("[swgcall]", error);
    await message.reply(`❌ *ᴇʀʀᴏʀ*\n\n> ${error?.message || "Unknown error"}`);
  }
});

export { pendingSwgcall };
