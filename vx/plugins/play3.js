import axios from "axios";
import yts from "yt-search";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const pluginConfig = {
  name: "play3",
  alias: ["p3"],
  category: "search",
  description: "Pemutar musik সাথে tampilan playlist এবং kontrol interসক্রিয়",
  usage: ".play3 <judul> [# nama playlist] | .play3 next | .play3 prev | .play3 stop",
  example: ".play3 about you # Being Funny In A Foreign Language",
  cooldown: 10,
  energi: 1,
  isEnabled: true,
};

if (!global.play3Sessions) global.play3Sessions = new Map();

function fmtDuration(seconds = 0) {
  const s = Number(seconds) || 0;
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${m}:${sec}`;
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

async function downloadAudio(url) {
  const res = await axios.get(
    `https://api.azbry.com/api/download/ytmp3?url=${encodeURIComponent(url)}`,
    { timeout: 60000 },
  );
  const data = res.data;
  if (!data?.status || !data?.result?.download) throw new Error("API auএo না mengembalikan link download");
  const audio = await axios.get(data.result.download, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: 50 * 1024 * 1024,
  });
  const buf = Buffer.from(audio.data);
  if (buf.length < 10000) throw new Error("Auএo hasil download না valid");
  return buf;
}

async function renderPlayer(video, playlistName, index, total) {
  const width = 1000;
  const height = 1120;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#29232a");
  bg.addColorStop(1, "#0e0e10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#f4f4f5";
  ctx.font = "700 28px sans-serif";
  ctx.fillText("PLAYLIST", 70, 68);
  ctx.font = "600 36px sans-serif";
  ctx.fillText(playlistName.slice(0, 34), 70, 110);

  let thumb;
  try {
    thumb = await loadImage(video.thumbnail);
    const size = 760;
    const x = (width - size) / 2;
    const y = 150;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 28);
    ctx.clip();
    ctx.drawImage(thumb, x, y, size, size);
    ctx.restore();
  } catch {
    ctx.fillStyle = "#333338";
    ctx.fillRect(120, 150, 760, 760);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 42px sans-serif";
  ctx.fillText((video.title || "Unknown").slice(0, 34), 70, 980);
  ctx.fillStyle = "#babac0";
  ctx.font = "500 28px sans-serif";
  ctx.fillText((video.author?.name || "Unknown artist").slice(0, 40), 70, 1022);

  const duration = Number(video.seconds || 0);
  const progress = duration ? clamp(0, 0, 1) : 0;
  const barX = 70, barY = 1055, barW = 860;
  ctx.fillStyle = "#5d5d63";
  ctx.roundRect(barX, barY, barW, 7, 4);
  ctx.fill();
  ctx.fillStyle = "#f5f5f5";
  ctx.beginPath();
  ctx.arc(barX + barW * progress, barY + 3.5, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "500 22px sans-serif";
  ctx.fillStyle = "#b5b5ba";
  ctx.fillText("0:00", barX, 1098);
  ctx.textAlign = "right";
  ctx.fillText(fmtDuration(duration), barX + barW, 1098);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

async function sendPlayer(sock, m, session, status = "") {
  const { results, index, playlist } = session;
  const video = results[index];
  const card = await renderPlayer(video, playlist, index, results.length);

  const subtitle = [
    status || `Track ${index + 1}/${results.length}`,
    `• ${video.author?.name || "Unknown artist"}`,
    `• ${video.duration?.timestamp || fmtDuration(video.seconds)}`,
  ].join(" ");

  const buttons = [
    ["⏮ Seএখনওnহ্যাঁ", `${m.prefix}play3 prev`],
    ["▶️ Putar আবার", `${m.prefix}play3 replay`],
    ["⏭ পরবর্তী", `${m.prefix}play3 next`],
    ["🔁 Ganti Playlist", `${m.prefix}play3`],
  ];

  if (typeof sock.sendMedia === "function") {
    await sock.sendMedia(m.chat, card, subtitle, m, { type: "image" });
  } else {
    await sock.sendMessage(m.chat, { image: card, caption: subtitle }, { quoted: m });
  }

  // Keep controls as normal quick replies so they remain compatible with the bot's existing handler.
  if (typeof sock.relayMessage === "function") {
    const buttonsMsg = {
      viewOnceMessage: {
        message: {
          messageContextInfo: {},
          interactiveMessage: {
            body: { text: `🎵 *${video.title}*\n${subtitle}` },
            footer: { text: "Kontrol pemutar" },
            nativeFlowMessage: {
              buttons: buttons.map(([display_text, id]) => ({
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({ display_text, id }),
              })),
            },
          },
        },
      },
    };
    await sock.relayMessage(m.chat, buttonsMsg, {});
  }
}

async function playCurrent(sock, m, session) {
  const video = session.results[session.index];
  m.react("🎵");
  const audio = await downloadAudio(video.url);
  await sock.sendMessage(
    m.chat,
    {
      audio,
      mimetype: "audio/mpeg",
      ptt: false,
      fileName: `${video.title.replace(/[\\/:*?"<>|]/g, "_")}.mp3`,
    },
    { quoted: m },
  );
  await sendPlayer(sock, m, session);
  m.react("✅");
}

async function handler(m, { sock }) {
  const raw = m.text?.trim() || "";
  if (!raw) return m.reply(`🎵 *PLAY3*\n\nউদাহরণ:\n${m.prefix}play3 about you # Being Funny In A Foreign Language`);

  const parts = raw.split(/\s+#\s*/);
  const input = parts[0].trim();
  const playlist = (parts[1]?.trim() || "My Playlist").slice(0, 60);
  const action = input.toLowerCase();
  let session = global.play3Sessions.get(m.chat);

  try {
    if (action === "next" || action === "prev" || action === "replay" || action === "stop") {
      if (!session) return m.reply(`এখনও নেই pemutar সক্রিয়. ব্যবহার করুন ${m.prefix}play3 <judul lagu>`);
      if (action === "stop") {
        global.play3Sessions.delete(m.chat);
        return m.reply("✅ Pemutar PLAY3 dihentikan.");
      }
      if (action === "next") session.index = (session.index + 1) % session.results.length;
      if (action === "prev") session.index = (session.index - 1 + session.results.length) % session.results.length;
      return playCurrent(sock, m, session);
    }

    if (session && /^replay$/.test(action)) return playCurrent(sock, m, session);

    m.react("🔎");
    const search = await yts(input);
    const results = (search.videos || [])
      .filter((v) => Number(v.seconds || 0) > 0 && Number(v.seconds || 0) < 900)
      .slice(0, 10);
    if (!results.length) return m.reply("❌ Lagu tidak ditemukan.");

    session = { query: input, playlist, results, index: 0, createdAt: Date.now() };
    global.play3Sessions.set(m.chat, session);
    await playCurrent(sock, m, session);
  } catch (error) {
    console.error("[Play3]", error);
    m.react("❌");
    return m.reply("❌ PLAY3 gagal memutar lagu. Coba lagi beberapa saat.");
  }
}



import { Module } from "../lib/plugins.js";
import { makeLegacyMessage, runLegacyContext, getDatabase as getLegacyDatabase, withLegacySocket } from "../lib/miku-legacy.js";
const __meta = {"command": "play3", "aliases": ["p3"], "package": "search", "description": "Pemutar musik সাথে tampilan playlist এবং kontrol interসক্রিয়", "isOwner": false, "isGroup": false, "isAdmin": false, "isBotAdmin": false};
async function __runLegacy(message,args) {
  const sock=withLegacySocket(message.conn);
  const rawCommand=String(message.body||"").trim().replace(/^\./,"").split(/\s+/)[0].toLowerCase();
  const lm=makeLegacyMessage(message,args,rawCommand||__meta.command);
  if(lm.isGroup) { try{ await lm.loadGroupInfo(); }catch{} }
  if(__meta.isOwner && !lm.isOwner) return lm.reply("❌ Owner only.");
  if(__meta.isGroup && !lm.isGroup) return lm.reply("❌ This command can only be used in groups.");
  if(__meta.isAdmin && !lm.isAdmin && !lm.isOwner) return lm.reply("❌ Only group admins can use this command.");
  if(__meta.isBotAdmin && !lm.isBotAdmin) return lm.reply("❌ Bot must be a group admin to use this command.");
  return runLegacyContext(lm,()=>handler(lm,{sock,db:getLegacyDatabase(lm),text:String(args||"")}));
}
Module(__meta)(async (message,args="")=>__runLegacy(message,args));
