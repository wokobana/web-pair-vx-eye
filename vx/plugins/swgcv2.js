import { fileTypeFromBuffer } from "file-type";
import fs from "fs";
import path from "path";
import { generateWAMessageFromContent } from "@whiskeysockets/baileys";
import { sendGroupStatusWithRetry as sendCommonGroupStatus, getGroupsCached, isRateLimitError } from "./groupstatus.js";
import { randomBytes } from "crypto";
import { Module } from "../lib/plugins.js";

/*
|--------------------------------------------------------------------------
| SWGCV2 - GROUP STATUS V2
|--------------------------------------------------------------------------
| Ported from the SWGCV2 implementation supplied in Rimuru_MD_4.4.
| Project-specific imports are adapted to this bot's plugin system.
|--------------------------------------------------------------------------
*/

function buildSyntheticSwGcRawMessage(sock, remoteJid, innerMessage, messageId) {
  const botJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
  return {
    key: {
      remoteJid,
      fromMe: true,
      id: messageId,
      participant: botJid,
    },
    message: {
      groupStatusMessageV2: {
        message: innerMessage,
      },
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
}

const pendingSwgcV2 = new Map();

Module({
  command: "swgcv2",
  aliases: ["statusgrupv2"],
  package: "owner",
  description: "Post Group Status V2 ke grup pilihan",
})(
  async (m, args = "") => {
    const argText = String(args || "").trim();
    const argList = argText ? argText.split(/\s+/) : [];
    const text = argText;
    const prefix = m.prefix || global.config?.PREFIX || global.config?.prefix || ".";

    if (argList[0] === "--confirm" && argList[1]) {
      const targetGroupId = argList[1];
      const pendingData = pendingSwgcV2.get(m.sender);

      if (!pendingData) {
        await m.reply(
          `⚠️ *Tidak ada data pending. Silakan kirim ulang media + .swgcv2*`,
        );
        return;
      }

      try {
        let groupName = "Grup";
        try {
          const meta = await m.conn.groupMetadata(targetGroupId);
          groupName = meta.subject;
        } catch (e) {}

        await m.react("🕕");

        const rawContent = pendingData.rawContent;

        let baseContent = {};
        if (rawContent.image) {
          baseContent = { image: rawContent.image, caption: rawContent.caption || "" };
        } else if (rawContent.video) {
          baseContent = { video: rawContent.video, caption: rawContent.caption || "" };
        } else if (rawContent.audio) {
          baseContent = {
            audio: rawContent.audio,
            mimetype: rawContent.mimetype || "audio/mpeg",
            ptt: rawContent.ptt || false,
          };
        } else if (rawContent.text) {
          baseContent = { text: rawContent.text };
        }

        const sendResult = await sendCommonGroupStatus(m.conn, targetGroupId, rawContent, { retries: 4, baseDelay: 2500 });
        const messageId = sendResult.messageId;

        // Keep the synthetic SW GC V2 message shape used by the source
        // implementation. The current project has no rimuru anti-SW-GC
        // handler, so it is intentionally not invoked here.
        buildSyntheticSwGcRawMessage(
          m.conn,
          targetGroupId,
          sendResult.mediaMessage || baseContent,
          messageId,
        );

        const successMsg = `✅ Berhasil up sw (V2) ke grup ${groupName}`;

        await m.reply(successMsg);
        pendingSwgcV2.delete(m.sender);

        if (pendingData.tempFile && fs.existsSync(pendingData.tempFile)) {
          setTimeout(() => {
            try {
              fs.unlinkSync(pendingData.tempFile);
            } catch (e) {}
          }, 5000);
        }
      } catch (error) {
        await m.reply(
          `❌ *ᴇʀʀᴏʀ*\n\n` +
            `> Gagal posting story V2.\n` +
            `> _${error.message}_`,
        );
      }
      return;
    }

    let rawContent = {};
    let buffer, ext, tempFile;

    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    if (
      m.quoted &&
      (m.quoted.isImage ||
        m.quoted.isVideo ||
        m.quoted.isAudio ||
        m.quoted.mimetype?.startsWith("audio"))
    ) {
      try {
        buffer = await m.quoted.download();

        if (!buffer) {
          await m.reply(`❌ Gagal mengambil media.`);
          return;
        }

        const fileType = await fileTypeFromBuffer(buffer);
        ext = fileType?.ext || "bin";
        tempFile = path.join(tempDir, `swgcv2_${Date.now()}.${ext}`);
        fs.writeFileSync(tempFile, buffer);

        if (m.quoted.isImage) {
          rawContent.image = buffer;
          rawContent.caption = text || "";
        } else if (m.quoted.isVideo) {
          rawContent.video = buffer;
          rawContent.caption = text || "";
        } else if (
          m.quoted.isAudio ||
          m.quoted.mimetype?.startsWith("audio")
        ) {
          rawContent.audio = buffer;
          rawContent.mimetype =
            fileType?.mime || m.quoted.mimetype || "audio/mpeg";
          rawContent.ptt = m.quoted.msg?.ptt || false;
        }
      } catch (e) {
        await m.reply(
          `❌ *ᴇʀʀᴏʀ*\n\n> ${e?.message || "Media download failed."}`,
        );
        return;
      }
    } else if (
      m.isImage ||
      m.isVideo ||
      m.isAudio ||
      m.mimetype?.startsWith("audio")
    ) {
      try {
        buffer = await m.download();

        if (!buffer) {
          await m.reply(`❌ Gagal mengambil media.`);
          return;
        }

        const fileType = await fileTypeFromBuffer(buffer);
        ext = fileType?.ext || "bin";
        tempFile = path.join(tempDir, `swgcv2_${Date.now()}.${ext}`);
        fs.writeFileSync(tempFile, buffer);

        if (m.isImage) {
          rawContent.image = buffer;
          rawContent.caption = text || "";
        } else if (m.isVideo) {
          rawContent.video = buffer;
          rawContent.caption = text || "";
        } else if (
          m.isAudio ||
          m.mimetype?.startsWith("audio")
        ) {
          rawContent.audio = buffer;
          rawContent.mimetype = fileType?.mime || m.mimetype || "audio/mpeg";
          rawContent.ptt = m.msg?.ptt || false;
        }
      } catch (e) {
        await m.reply(
          `❌ *ᴇʀʀᴏʀ*\n\n> ${e?.message || "Media download failed."}`,
        );
        return;
      }
    } else if (text && text.trim()) {
      rawContent.text = text;
      rawContent.font = 0;
      // Color is assigned by the shared Group Status engine.
    } else {
      await m.reply(
        `⚠️ *ᴄᴀʀᴀ ᴘᴀᴋᴀɪ*\n\n` +
          `> \`${prefix}swgcv2 teks\` - Story teks\n` +
          `> Reply gambar/video/audio + \`${prefix}swgcv2\`\n` +
          `> Kirim gambar/video + caption \`${prefix}swgcv2\``,
      );
      return;
    }

    pendingSwgcV2.set(m.sender, {
      rawContent,
      tempFile,
      timestamp: Date.now(),
    });

    try {
      const groups = await getGroupsCached(m.conn);

      const groupList = Object.entries(groups);

      if (groupList.length === 0) {
        await m.reply(`⚠️ *Bot tidak berada di grup manapun.*`);
        return;
      }

      const groupRows = groupList.map(([id, meta]) => ({
        title: meta.subject || "Unknown Group",
        description: id,
        id: `${prefix}swgcv2 --confirm ${id}`,
      }));

      const mediaType = rawContent.text
        ? "Teks"
        : rawContent.image
          ? "Gambar"
          : rawContent.video
            ? "Video"
            : rawContent.audio
              ? "Audio"
              : "Media";

      const newsletterJid =
        global.config?.saluran?.id ||
        global.config?.channel?.id ||
        undefined;
      const newsletterName =
        global.config?.saluran?.name ||
        global.config?.channel?.name ||
        undefined;

      const contextInfo =
        newsletterJid || newsletterName
          ? {
              forwardedNewsletterMessageInfo: {
                newsletterJid,
                newsletterName,
              },
            }
          : undefined;

      await m.conn.sendMessage(m.chat, {
        text:
          `📋 *ᴘɪʟɪʜ ɢʀᴜᴘ ᴜɴᴛᴜᴋ ᴘᴏsᴛ sᴛᴏʀʏ ᴠ2*\n\n` +
          `> Media: *${mediaType}*\n` +
          `> Total Grup: *${groupList.length}*\n\n` +
          `_Pilih grup dari daftar di bawah:_`,
        ...(contextInfo ? { contextInfo } : {}),
        footer: "rimuru",
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "🏠 Pilih Grup",
              sections: [
                {
                  title: "Daftar Grup",
                  rows: groupRows,
                },
              ],
            }),
          },
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: "❌ Batal",
              id: `${prefix}cancelswgcv2`,
            }),
          },
        ],
      });
    } catch (error) {
      global.isFetchingGroups = false;
      await m.reply(
        `❌ *ᴇʀʀᴏʀ*\n\n` +
          `> Gagal mengambil daftar grup.\n` +
          (isRateLimitError(error)
            ? `> ⏳ WhatsApp rate limit - 1-2 minute ruk kar dobara try karo.`
            : `> _${error.message}_`),
      );

      if (tempFile && fs.existsSync(tempFile)) {
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {}
      }

      pendingSwgcV2.delete(m.sender);
    }
  },
);

export { pendingSwgcV2 };
