import axios from "axios";
import sticker from "../lib/sticker.js";
import config from "../config.js";
import { Module } from "../lib/plugins.js";
import { isOwnerMessage } from "./groupstatus.js";

/*
 * ============================================================
 * BULK VIDEO STICKER SENDER
 * ============================================================
 *
 * Put direct MP4/WebM/MOV/GIF video URLs in VIDEO_STICKER_URLS.
 *
 * Supported:
 *   10 video sticker
 *   10 video stickers
 *   10 videosticker
 *   .videosticker 10
 *
 * The requested count controls how many stickers are sent.
 * If the count is larger than the number of URLs, URLs cycle.
 *
 * This is intentionally a separate plugin; the existing
 * image/GIF sticker bulk plugin remains unchanged.
 * ============================================================
 */

const MAX_BULK = 100;
const DELAY_MS = 700;
const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024;

const VIDEO_STICKER_URLS = [
"https://files.catbox.moe/65oeyc.mp4",
"https://files.catbox.moe/k9dhjk.mp4",
"https://files.catbox.moe/ct8ve6.mp4",
"https://files.catbox.moe/was54r.mp4",
"https://files.catbox.moe/rr5fxm.mp4",
"https://files.catbox.moe/tjo3ot.mp4",
];

const running = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseCount(value) {
  const n = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(n, MAX_BULK);
}

async function checkGroupAdmin(message) {
  try {
    if (!message.isGroup) {
      await message.send("❌ This command works only inside a group.");
      return false;
    }

    // Only the person who owns / has connected the bot can use this.
    // Group admin rights (for the sender OR the bot) are NOT required.
    if (!isOwnerMessage(message)) {
      await message.send("❌ Only the bot owner can use this command.");
      return false;
    }

    return true;
  } catch (error) {
    console.error("[video-sticker] permission error:", error);
    await message.send("❌ Failed to check group permissions.");
    return false;
  }
}

async function downloadVideoSticker(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: MAX_DOWNLOAD_BYTES,
    maxBodyLength: MAX_DOWNLOAD_BYTES,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "video/*,image/gif,*/*;q=0.8",
    },
  });

  const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
  if (!response.data || response.data.length < 1000) {
    throw new Error("Video response is empty or too small.");
  }

  if (contentType.includes("text/html")) {
    throw new Error("URL returned HTML instead of a video file.");
  }

  return Buffer.from(response.data);
}

async function sendVideoStickerBulk(message, count) {
  const key = String(message.from);

  if (running.has(key)) {
    return message.send("⏳ A video-sticker bulk send is already running in this group. Use `.stopbulk` first.");
  }

  const ok = await checkGroupAdmin(message);
  if (!ok) return;

  if (!VIDEO_STICKER_URLS.length) {
    return message.send(
      "❌ No video-sticker URLs configured.\n\n" +
      "Open `plugins/bulk-video-sticker.js` and add direct MP4/WebM/MOV/GIF URLs inside `VIDEO_STICKER_URLS`."
    );
  }

  running.add(key);

  try {
    await message.send(
      `🎬 Starting ${count} video-sticker messages.\n` +
      `⏱️ Delay: ${DELAY_MS}ms\n` +
      `🛑 Stop: .stopbulk`
    );

    let sent = 0;

    for (let i = 0; i < count; i++) {
      if (!running.has(key)) break;

      const url = VIDEO_STICKER_URLS[i % VIDEO_STICKER_URLS.length];

      try {
        const video = await downloadVideoSticker(url);

        // The existing sticker builder handles video -> animated WebP,
        // scales it to 512x512 and limits animated stickers to 6 seconds.
        const stickerBuffer = await sticker.toSticker("video", video, {
          packname: config.packname || "VX MD BOT",
          author: config.author || "VX MD BOT",
          categories: ["video", "sticker", "💖"],
        });

        await message.send({ sticker: stickerBuffer });
        sent++;
      } catch (error) {
        console.error(
          `[video-sticker] ${i + 1} failed:`,
          error?.stack || error?.message || error
        );
        await message.send(
          `⚠️ Video sticker ${i + 1} failed; continuing with the next URL.`
        );
      }

      if (i < count - 1) {
        await sleep(DELAY_MS);
      }
    }

    if (running.has(key)) {
      await message.send(`✅ Video-sticker bulk finished: ${sent}/${count}`);
    } else {
      await message.send(`🛑 Video-sticker bulk stopped: ${sent}/${count} sent.`);
    }
  } catch (error) {
    console.error("[video-sticker] bulk error:", error);
    await message.send(
      `❌ Video-sticker bulk failed: ${error?.message || "unknown error"}`
    );
  } finally {
    running.delete(key);
  }
}

// Natural text commands: `10 video sticker`, `10 video stickers`, `10 videosticker`
Module({
  on: "text",
  name: "bulk-video-sticker-text",
  package: "group",
  description: "Send configured video URLs as animated WhatsApp stickers",
})(async (message) => {
  try {
    const body = String(message.body || "").trim();
    const match = body.match(/^(\d{1,4})\s+video\s*stickers?$/i)
      || body.match(/^(\d{1,4})\s+videostickers?$/i);

    if (match) {
      return sendVideoStickerBulk(message, parseCount(match[1]));
    }
  } catch (error) {
    console.error("[video-sticker] text handler error:", error);
  }
});

// Explicit command form: `.videosticker 10`
Module({
  command: "videosticker",
  aliases: ["videostickers", "vstickerbulk"],
  package: "group",
  description: "Send configured video URLs as animated WhatsApp stickers",
})(async (message, match) => {
  const count = parseCount(match);
  if (!count) return message.send("Usage: `.videosticker 10` (max 100)");
  return sendVideoStickerBulk(message, count);
});

// Reuse the same stop command name without registering another handler.
// The existing bulk-link-sticker.js owns `.stopbulk`.

