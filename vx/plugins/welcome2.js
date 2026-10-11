import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";
import config from "../config.js";
import { jidNormalizedUser, generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";
import { KINDS, botName, botNum, gKey, sendNotice } from "../lib/welcome2-core.js";

/* =========================================================================
   Welcome 2  —  Rimuru MD ka welcome, same-to-same, English me.
   (Aapka Bengali "welcome" alag hai aur waisa hi chalta rahega.)

     .welcome2 on / off          -> is group me ON/OFF   (group admin)
     .welcome2                   -> status panel
     .setwelcome2 <text>         -> custom message   |  .setwelcome2 reset
     .setwelcome2type            -> V1..V8 button (jo dabaoge wahi type)  (owner)
     .setwelcome2type v5         -> seedha type set
   Placeholders: {user} {number} {group} {desc} {count} {owner} {date} {time} {day} {bot} {prefix}
   Sab kuch har bot number + group ke hisaab se alag save hota hai.
   ========================================================================= */

const KIND = "welcome";
const { variants: VARIANTS, typeKey: TYPE_KEY } = KINDS[KIND];
const ACTIONS = ["add", "invite", "joined"];

Module({ on: "group-participants.update" })(async (_msg, event, conn) => {
  try {
    if (!event?.id || !Array.isArray(event.participants)) return;
    const action = String(event.action || "").toLowerCase();
    if (!ACTIONS.includes(action)) return;

    const bn = botNum(conn);
    const cfg = await db.getAsync(bn, gKey(KIND, event.id), null);
    if (!cfg || !(cfg.status === true || cfg.status === "true")) return;

    const type = Number(await db.getAsync(bn, TYPE_KEY, 1)) || 1;
    const botJid = jidNormalizedUser(conn?.user?.id);
    let meta = event.groupMetadata && event.groupMetadata.subject ? event.groupMetadata : null;
    if (!meta) meta = await conn.groupMetadata(event.id).catch(() => ({}));

    for (const p of event.participants) {
      const jid = jidNormalizedUser(typeof p === "string" ? p : p?.id || p?.jid || "");
      if (!jid || jid === botJid) continue;
      await sendNotice(KIND, conn, event.id, jid, meta, type, cfg.customText);
    }
  } catch (e) {
    console.error("[welcome2] event error:", e?.message || e);
  }
});

const isOwnerMessage = (m) => {
  if (m?.isFromMe || m?.isfromMe || m?.fromMe || m?.key?.fromMe || m?.isOwner) return true;
  const num = String(m?.sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  return [config.owner, config.sudo].map((x) => String(x || "").replace(/\D/g, "")).filter(Boolean).includes(num);
};

async function adminGate(message) {
  const gid = message.from || message.key?.remoteJid;
  if (!gid || !gid.endsWith("@g.us")) { await message.reply("❌ Use this command inside a group."); return null; }
  await message.loadGroupInfo?.();
  if (!message.isAdmin && !isOwnerMessage(message)) { await message.reply("❌ Only group admins can change this."); return null; }
  return gid;
}

Module({
  command: "welcome2",
  aliases: ["wlc2"],
  package: "group",
  description: "Rimuru-style welcome (English) ON/OFF",
})(async (message, match = "") => {
  try {
    const gid = await adminGate(message);
    if (!gid) return;
    const bn = botNum(message.conn);
    const cur = (await db.getAsync(bn, gKey(KIND, gid), null)) || {};
    const arg = String(match || "").trim().toLowerCase();
    const prefix = config.prefix || ".";
    if (arg === "on" || arg === "off") {
      await db.set(bn, gKey(KIND, gid), { ...cur, status: arg === "on" });
      return message.reply(arg === "on" ? "✅ *Welcome 2 ON*" : "❌ *Welcome 2 OFF*");
    }
    const type = Number(await db.getAsync(bn, TYPE_KEY, 1)) || 1;
    return message.reply(
      `👋 *Welcome 2 SETTINGS*\n\n> Status: *${cur.status ? "✅ ON" : "❌ OFF"}*\n> Type: *V${type} — ${VARIANTS[type].name}*\n> Message: ${cur.customText ? "Custom" : "Default"}\n\n` +
      `${prefix}welcome2 on / off\n${prefix}setwelcome2 <text>\n${prefix}setwelcome2type`
    );
  } catch (e) { console.error("[welcome2] cmd:", e?.message || e); }
});

Module({
  command: "setwelcome2",
  aliases: ["setwlc2"],
  package: "group",
  description: "Custom message for Welcome 2",
})(async (message, match = "") => {
  try {
    const gid = await adminGate(message);
    if (!gid) return;
    const bn = botNum(message.conn);
    const cur = (await db.getAsync(bn, gKey(KIND, gid), null)) || {};
    const raw = String(match || "").trim();
    if (!raw) {
      return message.reply("✍️ *Usage*\n.setwelcome2 Welcome {user} to {group}! We are {count} members.\n.setwelcome2 reset\n\nPlaceholders: {user} {number} {group} {desc} {count} {owner} {date} {time} {day} {bot} {prefix}");
    }
    if (/^(reset|default)$/i.test(raw)) {
      const { customText, ...rest } = cur;
      await db.set(bn, gKey(KIND, gid), rest);
      return message.reply("✅ Custom text removed. Default message will be used.");
    }
    await db.set(bn, gKey(KIND, gid), { ...cur, customText: raw });
    return message.reply("✅ Custom message saved.");
  } catch (e) { console.error("[setwelcome2] cmd:", e?.message || e); }
});

async function sendTypeButtons(conn, chatId, prefix, current) {
  const rows = Object.entries(VARIANTS).map(([id, v]) => ({
    header: "", title: `${v.emoji} V${id} — ${v.name}${Number(id) === current ? "  ✓ ON" : ""}`, description: v.desc, id: `${prefix}setwelcome2type v${id}`,
  }));
  const bodyText = `👋 *Welcome 2 TYPE*\n\n> Active: *${VARIANTS[current].emoji} V${current} — ${VARIANTS[current].name}*\n\n👇 Tap a button — only that type will be ON.\n_No button? Type:_ *${prefix}setwelcome2type v1* … *v8*`;
  const msg = generateWAMessageFromContent(chatId, {
    viewOnceMessage: { message: {
      messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
      interactiveMessage: proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
        footer: proto.Message.InteractiveMessage.Footer.create({ text: botName() }),
        header: proto.Message.InteractiveMessage.Header.create({ title: "Welcome 2 Type", hasMediaAttachment: false }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
          buttons: [{ name: "single_select", buttonParamsJson: JSON.stringify({ title: "👋 Choose Type", sections: [{ title: "Welcome 2 Types", rows }] }) }],
        }),
      }),
    } },
  }, { userJid: conn.user?.id });
  await conn.relayMessage(chatId, msg.message, {
    messageId: msg.key.id,
    additionalNodes: [{ tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] }],
  });
}

Module({
  command: "setwelcome2type",
  aliases: ["welcome2type", "wlc2type"],
  package: "owner",
  description: "Choose Welcome 2 type V1-V8 with buttons",
})(async (message, match = "") => {
  try {
    if (!isOwnerMessage(message)) return message.reply("❌ Owner only.");
    const conn = message.conn;
    const chatId = message.from || message.key?.remoteJid;
    const bn = botNum(conn);
    const prefix = config.prefix || ".";
    const current = Number(await db.getAsync(bn, TYPE_KEY, 1)) || 1;
    const mt = String(match || "").trim().toLowerCase().match(/^v?([1-8])$/);
    if (mt) {
      const id = Number(mt[1]);
      await db.set(bn, TYPE_KEY, id);
      return message.reply(`✅ *Welcome 2 TYPE ON*\n\n${VARIANTS[id].emoji} *V${id} — ${VARIANTS[id].name}*\n> ${VARIANTS[id].desc}\n\n_Turn it on in a group:_ *${prefix}welcome2 on*`);
    }
    try { await sendTypeButtons(conn, chatId, prefix, current); }
    catch (e) {
      console.warn("[welcome2] buttons failed, text list:", e?.message || e);
      await message.reply(`👋 *Welcome 2 TYPE*\n\n` + Object.entries(VARIANTS).map(([id, v]) => `${Number(id) === current ? "✅" : "▫️"} ${prefix}setwelcome2type v${id} — ${v.emoji} ${v.name}`).join("\n"));
    }
  } catch (e) { console.error("[setwelcome2type] cmd:", e?.message || e); }
});
