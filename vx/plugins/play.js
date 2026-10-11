import axios from "axios";
import { Module } from "../lib/plugins.js";
import {
  cleanQuery,
  searchVideo,
  downloadSongAudio,
  sendSongAudio,
  replyText,
  songErrorText,
  songHelp,
  formatViews,
} from "./song.js";

/*
 * .play / .ytplay
 * ------------------------------------------------------------
 * Sends a good-looking "Now Playing" card (thumbnail + details)
 * and then the song as a real MP3 file.
 *
 * The download engine lives in song.js (shared), so there is only
 * ONE place to maintain. The old play.js imported a package
 * (@itsliaaa/baileys) that is not installed, so the whole file
 * failed to load — that is fixed here.
 *
 * If you want audio only (no card), use .song instead.
 */

function buildCard(video, requestedBy) {
  return (
    "╭━━━━〔 🎧 *NOW PLAYING* 〕━━━━⬣\n" +
    `┃ 🎵 *${video.title}*\n` +
    "┃\n" +
    `┃ 👤 Channel : ${video.author || "Unknown"}\n` +
    `┃ ⏱️ Duration : ${video.timestamp || "-"}\n` +
    `┃ 👀 Views : ${formatViews(video.views)}\n` +
    `┃ 📅 Uploaded : ${video.ago || "-"}\n` +
    `┃ 🙋 Requested by : ${requestedBy}\n` +
    "╰━━━━━━━━━━━━━━━━━━━⬣\n" +
    "⏳ _MP3 तैयार हो रहा है..._"
  );
}

async function sendCard(message, video) {
  const conn = message.conn;
  const opts = message.raw ? { quoted: message.raw } : {};
  const caption = buildCard(video, message.pushName || "Group Member");

  try {
    if (video.thumbnail) {
      const img = await axios.get(video.thumbnail, { responseType: "arraybuffer", timeout: 15_000 });
      await conn.sendMessage(message.from, { image: Buffer.from(img.data), caption }, opts);
      return;
    }
  } catch {}
  await conn.sendMessage(message.from, { text: caption }, opts).catch(() => {});
}

Module({
  command: "play",
  aliases: ["ytplay"],
  package: "downloader",
  description: "Play a song from YouTube (info card + MP3)",
})(async (message, match) => {
  const query = cleanQuery(match);
  if (!query) return replyText(message, songHelp());

  try {
    await message.react("🔎");
    const video = await searchVideo(query);

    await sendCard(message, video); // card first, so the group sees progress
    await message.react("⏳");

    const audio = await downloadSongAudio(video);
    await sendSongAudio(message, audio);
    await message.react("✅");
  } catch (error) {
    console.error("[play] error:", error?.stack || error?.message || error);
    await message.react("❌");
    await replyText(message, songErrorText(error, query));
  }
});
