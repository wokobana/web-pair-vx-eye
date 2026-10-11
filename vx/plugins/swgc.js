import { generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";
import { Module } from "../lib/plugins.js";
import config from "../config.js";
import {
  makeGroupStatusContent,
  broadcastGroupStatus,
  isOwnerMessage,
  describeContent,
  getGroupsCached,
  isRateLimitError,
} from "./groupstatus.js";

/*
|--------------------------------------------------------------------------
| SWGC - Group Status to SELECTED group(s)
|--------------------------------------------------------------------------
| 1) Prepare:   .swgc Hello   |  reply photo/video/audio + .swgc
| 2) Bot sends a TAPPABLE LIST of your groups (button) — tap one to post
|    instantly to that single group.
|    Fallback (if the list-button doesn't render on your account / WA
|    client): a numbered list is shown, same as before —
|      .swgc 3       -> one group
|      .swgc 1,4,7   -> several groups
| Cancel:       .cancelswgc  (or .swgc --cancel)
|
| Text statuses get a different background colour for every group.
| (Old button flow `.swgc --confirm <groupId>` is still understood.)
|--------------------------------------------------------------------------
*/

const PENDING_TTL_MS = 10 * 60 * 1000;
const pendingSwgc = new Map(); // single slot: owner only
const LIST_ROW_PREFIX = "swgc:";

function getPending() {
  const p = pendingSwgc.get("owner");
  if (!p) return null;
  if (Date.now() - p.timestamp > PENDING_TTL_MS) {
    pendingSwgc.delete("owner");
    return null;
  }
  return p;
}

const short = (s, n = 42) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));

/*
 * Pulls a WhatsApp list/button reply's selected id out of whatever shape
 * this WA/Baileys version happens to use. Different client + library
 * versions surface it under different keys, so we check them all.
 */
function extractSelectedRowId(msg) {
  const m = msg?.message || {};
  return (
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson &&
      safeParseSelectedId(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson) ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.templateButtonReplyMessage?.selectedId ||
    null
  );
}

function safeParseSelectedId(paramsJson) {
  try {
    const parsed = JSON.parse(paramsJson);
    return parsed?.id || parsed?.selectedRowId || null;
  } catch {
    return null;
  }
}

/*
 * Attached ONCE (module-level guard) so we don't stack duplicate listeners
 * every time .swgc runs. Watches for the owner tapping a row on the group
 * list and, if it matches a still-pending SWGC request, posts the story to
 * that single group.
 */
const listenerConns = new WeakSet(); // per-connection, so it re-attaches after a reconnect

function attachListListener(conn) {
  if (listenerConns.has(conn)) return;
  listenerConns.add(conn);

  conn.ev.on("messages.upsert", async (upsert) => {
    try {
      const messages = upsert?.messages || [];

      for (const msg of messages) {
        if (!msg?.key?.fromMe) continue; // only the owner's own tap counts

        const rowId = extractSelectedRowId(msg);
        if (!rowId || !rowId.startsWith(LIST_ROW_PREFIX)) continue;

        const pending = getPending();
        if (!pending) continue;

        const targetId = rowId.slice(LIST_ROW_PREFIX.length);
        const match = pending.groups.find(([id]) => id === targetId);
        if (!match) continue;

        const chatId = msg.key.remoteJid;
        const name = match[1]?.subject || targetId;

        pendingSwgc.delete("owner");

        try {
          await conn.sendMessage(chatId, { react: { text: "🕕", key: msg.key } });
        } catch {}

        const result = await broadcastGroupStatus(conn, [targetId], pending.content, {
          names: { [targetId]: name },
          delayMin: 0,
          delayMax: 0,
        });

        const ok = result.success === 1;

        try {
          await conn.sendMessage(chatId, { react: { text: ok ? "✅" : "❌", key: msg.key } });
        } catch {}

        await conn.sendMessage(chatId, {
          text: ok
            ? `✅ Berhasil up sw ke grup *${short(name)}*`
            : `❌ *ᴇʀʀᴏʀ*\n\n> Gagal posting story.\n> _${result.failures?.[0]?.error || "unknown"}_`,
        });
      }
    } catch (error) {
      console.error("[swgc] list listener error:", error);
    }
  });
}

/*
 * Sends the group list as a REAL tappable button (native-flow "single_select").
 *
 * FIX: the old code used conn.sendMessage({ text, sections, buttonText }).
 * Baileys 7 doesn't know that legacy list shape, so it did NOT throw - it
 * just sent the caption as plain text and no button ever appeared (see
 * screenshot). Now the interactive message is built and relayed properly,
 * with the biz/native_flow node WhatsApp needs to render the button.
 *
 * Each row = group name (title) + group ID (description).
 * WhatsApp allows 10 rows per section, so groups are split in sections of 10.
 */
async function sendGroupListButton(conn, chatId, groupList, info) {
  const MAX_SECTIONS = 10;
  const PER_SECTION = 10;

  const sections = [];
  for (let i = 0; i < groupList.length && sections.length < MAX_SECTIONS; i += PER_SECTION) {
    const chunk = groupList.slice(i, i + PER_SECTION);
    sections.push({
      title: `Group ${i + 1} - ${i + chunk.length}`,
      rows: chunk.map(([id, meta], j) => ({
        header: "",
        title: short(`${i + j + 1}. ${meta?.subject || "Unknown Group"}`, 60),
        description: id,
        id: `${LIST_ROW_PREFIX}${id}`,
      })),
    });
  }

  const shown = Math.min(groupList.length, MAX_SECTIONS * PER_SECTION);
  const extra =
    groupList.length > shown
      ? `\n\n⚠️ Button me pehle ${shown} groups hain. Baaki ke liye number use karo: *.swgc 105*`
      : "";

  const bodyText =
    `📋 *ᴘɪʟɪʜ ɢʀᴜᴘ ᴜɴᴛᴜᴋ ᴘᴏsᴛ sᴛᴏʀʏ*\n\n` +
    `> Media: *${info.icon} ${info.label}*\n` +
    `> Total Grup: *${groupList.length}*\n\n` +
    `👇 Button dabakar group choose karo (ek group me turant post ho jayega).\n` +
    `_Ya number se:_ *.swgc 1,4,7* _(multiple groups)_\n` +
    `_Button na dikhe to:_ *.swgc list*` +
    extra;

  const waMsg = generateWAMessageFromContent(
    chatId,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: config?.bot?.name || "VX MD BOT",
            }),
            header: proto.Message.InteractiveMessage.Header.create({
              title: "Group Status",
              hasMediaAttachment: false,
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({ title: "📋 Group Chuno", sections }),
                },
              ],
            }),
          }),
        },
      },
    },
    { userJid: conn.user?.id }
  );

  await conn.relayMessage(chatId, waMsg.message, {
    messageId: waMsg.key.id,
    additionalNodes: [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: { type: "native_flow", v: "1" },
            content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
          },
        ],
      },
    ],
  });
}

function numberedGroupText(groupList, info, prefix) {
  const rows = groupList
    .map(([, meta], i) => `${i + 1}. ${short(meta?.subject || "Unknown Group")}`)
    .join("\n");
  return (
    `📋 *ᴘɪʟɪʜ ɢʀᴜᴘ ᴜɴᴛᴜᴋ ᴘᴏsᴛ sᴛᴏʀʏ*\n\n` +
    `> Media: *${info.icon} ${info.label}*\n` +
    `> Total Grup: *${groupList.length}*\n\n` +
    `${rows}\n\n` +
    `✍️ Satu grup: *${prefix}swgc 3*\n` +
    `✍️ Beberapa grup: *${prefix}swgc 1,4,7*\n` +
    `❌ Batal: *${prefix}cancelswgc*\n\n` +
    `_Pilihan berlaku 10 menit._`
  );
}

Module({
  command: "swgc",
  aliases: ["statusgrup", "swgroup", "groupstory", "toswgc", "cancelswgc"],
  package: "owner",
  description: "Post Group Status/Story ke grup pilihan",
})(async (message, args = "") => {
  try {
    if (!isOwnerMessage(message)) return message.reply("❌ Owner only.");

    const conn = message.conn;
    if (!conn) return message.reply("❌ *WhatsApp connection unavailable.*");

    attachListListener(conn);

    const chatId = message?.from || message?.key?.remoteJid;
    const prefix = config.prefix || ".";
    const body = String(message.body || "").trim();
    const usedCmd = body.startsWith(prefix)
      ? body.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()
      : "";
    const argText = String(args || "").trim();

    /* ---------------------------- cancel ---------------------------- */
    if (usedCmd === "cancelswgc" || /^--cancel$/i.test(argText)) {
      pendingSwgc.delete("owner");
      return message.reply("❌ *SWGC DIBATALKAN*\n\n> Pemilihan grup dan posting story dibatalkan.");
    }

    /* ---- .swgc list : show numbered list if the button doesn't render ---- */
    if (/^list$/i.test(argText) && getPending()) {
      const p = getPending();
      return message.reply(numberedGroupText(p.groups, describeContent(p.content), prefix));
    }

    /* ------------------- choose group(s) and post ------------------- */
    /* (still works if the tappable list didn't render for you) */
    const pending = getPending();
    const quotedIsMedia = /^(image|video|audio)message$/i.test(String(message.quoted?.type || ""));
    const confirmMatch = argText.match(/^--confirm\s+(\S+@g\.us)$/i);
    const numberMatch = argText.match(/^\d+(?:\s*[,\s]\s*\d+)*$/);

    if (pending && !quotedIsMedia && (confirmMatch || numberMatch)) {
      let targets = [];

      if (confirmMatch) {
        targets = [confirmMatch[1]];
      } else {
        const picks = [...new Set(argText.split(/[,\s]+/).map(Number))];
        const bad = picks.filter((n) => !Number.isInteger(n) || n < 1 || n > pending.groups.length);
        if (bad.length) {
          return message.reply(`⚠️ Nomor tidak valid: *${bad.join(", ")}*\n\n> Pilih angka 1 - ${pending.groups.length}.`);
        }
        targets = picks.map((n) => pending.groups[n - 1][0]);
      }

      const names = {};
      for (const [id, meta] of pending.groups) names[id] = meta?.subject || id;

      await message.react?.("🕕");

      const result = await broadcastGroupStatus(conn, targets, pending.content, {
        names,
        delayMin: 800,
        delayMax: 1500,
      });

      pendingSwgc.delete("owner");

      if (result.total === 1) {
        if (result.success === 1) {
          await message.react?.("✅");
          return message.reply(`✅ Berhasil up sw ke grup *${short(names[targets[0]])}*`);
        }
        await message.react?.("❌");
        return message.reply(
          `❌ *ᴇʀʀᴏʀ*\n\n> Gagal posting story.\n> _${result.failures[0]?.error || "unknown"}_`
        );
      }

      let report =
        `✅ *SWGC selesai*\n\n> Total: *${result.total}* grup\n> Sukses: *${result.success}* ✅\n> Gagal: *${result.failed}* ❌`;
      if (result.failed > 0) {
        report +=
          `\n\n*Grup gagal:*\n` +
          result.failures.map((f) => `> • ${short(f.name)} — ${String(f.error).slice(0, 60)}`).join("\n");
      }
      await message.react?.(result.success > 0 ? "✅" : "❌");
      return message.reply(report);
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
          `> \`${prefix}swgc teks\` - Story teks\n` +
          `> \`${prefix}swgc #ff0000 teks\` - teks dengan warna sendiri\n` +
          `> Reply gambar/video/audio + \`${prefix}swgc\`\n` +
          `> Kirim gambar/video + caption \`${prefix}swgc\``
      );
    }

    const groups = await getGroupsCached(conn);

    const groupList = Object.entries(groups || {}).sort((a, b) =>
      String(a[1]?.subject || "").localeCompare(String(b[1]?.subject || ""))
    );

    if (groupList.length === 0) return message.reply("⚠️ *Bot tidak berada di grup manapun.*");

    pendingSwgc.set("owner", { content, groups: groupList, timestamp: Date.now() });

    const info = describeContent(content);

    /* Try the tappable list-button first; if it fails (older WA client,
     * banned interactive-message support, etc.) fall back to plain text. */
    try {
      await sendGroupListButton(conn, chatId, groupList, info);
    } catch (error) {
      console.warn("[swgc] list-button send failed, falling back to text list:", error?.message || error);

      await message.reply(numberedGroupText(groupList, info, prefix));
    }
  } catch (error) {
    global.isFetchingGroups = false;
    console.error("[swgc]", error);
    if (isRateLimitError(error)) {
      return message.reply("⏳ WhatsApp ne thodi der rok diya (rate limit).\n\n> 1-2 minute ruk kar *.swgc* dobara bhejo. Baar baar turant mat bhejo.");
    }
    await message.reply(`❌ *ᴇʀʀᴏʀ*\n\n> ${error?.message || "Unknown error"}`);
  }
});

export { pendingSwgc };
