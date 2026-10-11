import { generateWAMessageFromContent, proto } from "@whiskeysockets/baileys";
import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";
import config from "../config.js";

/*
 * .setwelcometype  -> neeche V1..V8 ka button (single_select list) aata hai.
 * Jis button ko dabaoge sirf wahi type ON hoga (V1 dabao = V1, V8 dabao = V8).
 * Seedha bhi chalta hai: .setwelcometype v3
 * (Ye sirf welcome ka *type* badalta hai; welcome ON/OFF .welcome on/off se hota hai.)
 */

const VARIANTS = {
  1: { name: "Canvas Image", desc: "Member ki DP ke saath welcome (image + text)", emoji: "🎨" },
  2: { name: "Carousel Card", desc: "DP + text + Hello button wala card", emoji: "🃏" },
  3: { name: "Text Only", desc: "Sirf text, koi image nahi", emoji: "📝" },
  4: { name: "Group Style", desc: "Group style text message", emoji: "👥" },
  5: { name: "Simple Preview", desc: "Link preview card + DP", emoji: "✨" },
  6: { name: "Video", desc: "Video (URL se) + welcome caption", emoji: "🎥" },
  7: { name: "Interactive", desc: "DP + Hello button, forwarded style", emoji: "💬" },
  8: { name: "Super Simple", desc: "Bahut chhota ek line ka welcome", emoji: "👋" },
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
    id: `${prefix}setwelcometype v${id}`,
  }));

  const bodyText =
    `👋 *WELCOME TYPE*\n\n` +
    `> Abhi ON: *${VARIANTS[current].emoji} V${current} — ${VARIANTS[current].name}*\n\n` +
    `👇 Neeche button dabao — jo dabaoge sirf wahi type ON hoga.\n` +
    `_Button na dikhe to likho:_ *${prefix}setwelcometype v1* … *v8*`;

  const msg = generateWAMessageFromContent(
    chatId,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            body: proto.Message.InteractiveMessage.Body.create({ text: bodyText }),
            footer: proto.Message.InteractiveMessage.Footer.create({ text: config?.bot?.name || "VX MD BOT" }),
            header: proto.Message.InteractiveMessage.Header.create({ title: "Welcome Type", hasMediaAttachment: false }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              buttons: [
                {
                  name: "single_select",
                  buttonParamsJson: JSON.stringify({
                    title: "👋 Welcome Type Chuno",
                    sections: [{ title: "Welcome Types", rows }],
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
  `👋 *WELCOME TYPE*\n\n` +
  Object.entries(VARIANTS)
    .map(([id, v]) => `${Number(id) === current ? "✅" : "▫️"} ${prefix}setwelcometype v${id} — ${v.emoji} ${v.name}`)
    .join("\n");

Module({
  command: "setwelcometype",
  aliases: ["welcometype", "welcomevariant", "welcomestyle"],
  package: "owner",
  description: "Welcome ka type (V1-V8) button se chuno",
})(async (message, args = "") => {
  try {
    if (!isOwnerMessage(message)) return message.reply("❌ Owner only.");

    const conn = message.conn;
    const chatId = message?.from || message?.key?.remoteJid;
    const prefix = config.prefix || ".";
    const bn = botNumber(conn);
    const raw = String(args || "").trim().toLowerCase();
    const current = Number(await db.getAsync(bn, "setting:welcomeType", 1)) || 1;

    const mt = raw.match(/^v?([1-8])$/);
    if (mt) {
      const id = Number(mt[1]);
      await db.set(bn, "setting:welcomeType", id);
      return message.reply(
        `✅ *WELCOME TYPE ON*\n\n${VARIANTS[id].emoji} *V${id} — ${VARIANTS[id].name}*\n> ${VARIANTS[id].desc}\n\n` +
        `_Welcome chalu karne ke liye group me:_ *${prefix}welcome on*`
      );
    }

    try {
      await sendTypeButtons(conn, chatId, prefix, current);
    } catch (e) {
      console.warn("[setwelcometype] button failed, text fallback:", e?.message || e);
      await message.reply(textList(prefix, current));
    }
  } catch (e) {
    console.error("[setwelcometype]", e?.message || e);
  }
});
