import { generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";
import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";
import config from "../config.js";

/*
 * .setgoodbyetype  -> neeche V1..V8 ka button (single_select list) aata hai.
 * Jis button ko dabaoge sirf wahi type ON hoga (V1 dabao = V1, V8 dabao = V8).
 * Seedha bhi chalta hai: .setgoodbyetype v3
 * (Ye sirf goodbye ka *type* badalta hai; goodbye ON/OFF .goodbye on/off se hota hai.)
 */

const VARIANTS = {
  1: { name: "Canvas Image", desc: "Member ki DP ke saath goodbye (image + text)", emoji: "🎨" },
  2: { name: "Carousel Card", desc: "DP + text + Hello button wala card", emoji: "🃏" },
  3: { name: "Text Only", desc: "Sirf text, koi image nahi", emoji: "📝" },
  4: { name: "Group Style", desc: "Group style text message", emoji: "👥" },
  5: { name: "Simple Preview", desc: "Link preview card + DP", emoji: "✨" },
  6: { name: "Video", desc: "Video (URL se) + goodbye caption", emoji: "🎥" },
  7: { name: "Interactive", desc: "DP + Hello button, forwarded style", emoji: "💬" },
  8: { name: "Super Simple", desc: "Bahut chhota ek line ka goodbye", emoji: "👋" },
};

function isOwnerMessage(m) {
  if (m?.isFromMe || m?.isfromMe || m?.fromMe || m?.key?.fromMe || m?.isOwner) return true;
  const num = String(m?.sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  const owners = [config.owner, config.sudo].map((x) => String(x || "").replace(/\D/g, "")).filter(Boolean);
  return Boolean(num) && owners.includes(num);
}

const botNumber = (conn) => (conn?.user?.id && String(conn.user.id).split(":")[0]) || "bot";

async function sendTypeButtons(conn, chatId, prefix, current) {
  const rows = Object.entries(VARIANTS).map(([id, v]) => ({
    header: "",
    title: `${v.emoji} V${id} — ${v.name}${Number(id) === current ? "  ✓ ON" : ""}`,
    description: v.desc,
    id: `${prefix}setgoodbyetype v${id}`,
  }));

  const bodyText =
    `👋 *GOODBYE TYPE*\n\n` +
    `> Abhi ON: *${VARIANTS[current].emoji} V${current} — ${VARIANTS[current].name}*\n\n` +
    `👇 Neeche button dabao — jo dabaoge sirf wahi type ON hoga.\n` +
    `_Button na dikhe to likho:_ *${prefix}setgoodbyetype v1* … *v8*`;

  const msg = generateWAMessageFromContent(
    chatId,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: config?.bot?.name || "VX MD BOT" }),
            header: proto.Message.InteractiveMessage.Header.create({ title: "Goodbye Type", hasMediaAttachment: false }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: "👋 Goodbye Type Chuno",
                    sections: [{ title: "Goodbye Types", rows }],
                  }),
                },
              ],
            }),
          }),
        },
      },
    },
    { userJid: conn.user?.id }
  );

  await conn.relayMessage(chatId, msg.message, {
    messageId: msg.key.id,
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

const textList = (prefix, current) =>
  `👋 *GOODBYE TYPE*\n\n` +
  Object.entries(VARIANTS)
    .map(([id, v]) => `${Number(id) === current ? "✅" : "▫️"} ${prefix}setgoodbyetype v${id} — ${v.emoji} ${v.name}`)
    .join("\n");

Module({
  command: "setgoodbyetype",
  aliases: ["goodbyetype", "goodbyevariant", "goodbyestyle"],
  package: "owner",
  description: "Goodbye ka type (V1-V8) button se chuno",
})(async (message, args = "") => {
  try {
    if (!isOwnerMessage(message)) return message.reply("❌ Owner only.");

    const conn = message.conn;
    const chatId = message?.from || message?.key?.remoteJid;
    const prefix = config.prefix || ".";
    const bn = botNumber(conn);
    const raw = String(args || "").trim().toLowerCase();
    const current = Number(await db.getAsync(bn, "setting:goodbyeType", 1)) || 1;

    const mt = raw.match(/^v?([1-8])$/);
    if (mt) {
      const id = Number(mt[1]);
      await db.set(bn, "setting:goodbyeType", id);
      return message.reply(
        `✅ *GOODBYE TYPE ON*\n\n${VARIANTS[id].emoji} *V${id} — ${VARIANTS[id].name}*\n> ${VARIANTS[id].desc}\n\n` +
        `_Goodbye chalu karne ke liye group me:_ *${prefix}goodbye on*`
      );
    }

    try {
      await sendTypeButtons(conn, chatId, prefix, current);
    } catch (e) {
      console.warn("[setgoodbyetype] button failed, text fallback:", e?.message || e);
      await message.reply(textList(prefix, current));
    }
  } catch (e) {
    console.error("[setgoodbyetype]", e?.message || e);
  }
});
