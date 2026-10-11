import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
} from "@whiskeysockets/baileys";
import { registerButtons } from "./button-router.js";

/*
 * sendNativeButtons(sock, jid, options)
 *
 * WhatsApp ke asli tappable buttons (quick_reply / cta_url / single_select).
 * Ye wahi tareeka hai jo is bot ke yts.js aur swgc.js me pehle se chalta hai:
 *   viewOnceMessage + interactiveMessage + relayMessage + "biz" extra node.
 * (Bina biz node ke stock Baileys me buttons dikhte hi nahi.)
 *
 * options = {
 *   title?, text, footer?,
 *   image?:   Buffer   (optional header photo),
 *   video?:   Buffer   (optional header video, silent GIF-style; image is fallback),
 *   buttons:  [{ name, buttonParamsJson }],
 *   contextInfo?: object,
 *   quoted?:  message (optional)
 * }
 *
 * Ye throw karta hai agar bhejna fail ho, taaki caller text fallback de sake.
 */

const BIZ_NODES = [
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
];

function buildMessage(sock, jid, { title, text, footer, media, buttons, contextInfo, quoted }) {
  const header = proto.Message.InteractiveMessage.Header.create({
    title: title || "",
    subtitle: "",
    hasMediaAttachment: !!(media?.imageMessage || media?.videoMessage),
    ...(media?.videoMessage
      ? { videoMessage: media.videoMessage }
      : media?.imageMessage
        ? { imageMessage: media.imageMessage }
        : {}),
  });

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text: text || " " }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || "" }),
    header,
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons,
    }),
    ...(contextInfo ? { contextInfo } : {}),
  });

  return generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage,
        },
      },
    },
    {
      userJid: sock?.user?.id,
      ...(quoted ? { quoted } : {}),
    }
  );
}

export async function sendNativeButtons(sock, jid, options = {}) {
  const { image, video, buttons = [] } = options;
  if (!sock || typeof sock.relayMessage !== "function") {
    throw new Error("socket.relayMessage not available");
  }
  if (!buttons.length) throw new Error("no buttons given");

  // 0) header VIDEO (silent GIF-style) - fail ho to photo par girega
  if (video && typeof sock.waUploadToServer === "function") {
    try {
      const media = await prepareWAMessageMedia(
        { video, gifPlayback: true, mimetype: "video/mp4" },
        { upload: sock.waUploadToServer }
      );
      if (media?.videoMessage) media.videoMessage.gifPlayback = true;
      const msg = buildMessage(sock, jid, { ...options, media });
      registerButtons(msg.key.id, buttons);
      await sock.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: BIZ_NODES,
      });
      return msg;
    } catch (e) {
      console.warn("[native-buttons] with-video send failed, falling back to image:", e?.message || e);
    }
  }

  // 1) try with the header photo (if one was given)
  if (image && typeof sock.waUploadToServer === "function") {
    try {
      const media = await prepareWAMessageMedia(
        { image },
        { upload: sock.waUploadToServer }
      );
      const msg = buildMessage(sock, jid, { ...options, media });
      registerButtons(msg.key.id, buttons);
      await sock.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: BIZ_NODES,
      });
      return msg;
    } catch (e) {
      console.warn("[native-buttons] with-image send failed, retrying without image:", e?.message || e);
    }
  }

  // 2) plain text + buttons
  const msg = buildMessage(sock, jid, { ...options, media: null });
  registerButtons(msg.key.id, buttons);
  await sock.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    additionalNodes: BIZ_NODES,
  });
  return msg;
}
