import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { tmpdir } from "os";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { Module, commands } from "../lib/plugins.js";
import config from "../config.js";
import sticker from "../lib/sticker.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const API = "https://nekos.best/api/v2/kiss";
let lastUrl = "";
const stickerCache = new Map();

function tmp(ext) {
  return path.join(tmpdir(), `kiss-${crypto.randomBytes(6).toString("hex")}.${ext}`);
}

async function getKissUrl() {
  for (let i = 0; i < 4; i++) {
    const res = await axios.get(API, { timeout: 15000 });
    const url = res?.data?.results?.[0]?.url;
    if (url && url !== lastUrl) {
      lastUrl = url;
      return url;
    }
  }
  throw new Error("Could not get a different anime kiss sticker.");
}

async function gifToSticker(gifBuffer) {
  // Use the same full-frame animated WebP conversion as .sticker.
  // No crop is applied, so portrait/landscape anime frames stay complete.
  const input = tmp("gif");
  fs.writeFileSync(input, gifBuffer);

  try {
    const video = await new Promise((resolve, reject) => {
      const output = tmp("mp4");
      ffmpeg(input)
        .outputOptions([
          "-movflags faststart",
          "-pix_fmt yuv420p",
          "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ])
        .on("error", (err) => {
          try { fs.unlinkSync(output); } catch {}
          reject(err);
        })
        .on("end", () => {
          try {
            resolve(fs.readFileSync(output));
          } finally {
            try { fs.unlinkSync(output); } catch {}
          }
        })
        .save(output);
    });

    return await sticker.toSticker("video", video, {
      packname: config.packname || "VX MD BOT",
      author: config.author || "VX MD BOT",
      categories: ["anime", "kiss", "💋"],
    });
  } finally {
    try { fs.unlinkSync(input); } catch {}
  }
}

async function getSticker() {
  const url = await getKissUrl();
  if (stickerCache.has(url)) return stickerCache.get(url);

  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
  });

  const sticker = await gifToSticker(Buffer.from(res.data));
  const withExif = await addExif(sticker);
  stickerCache.set(url, withExif);

  // Keep memory bounded while retaining enough variety for different members.
  if (stickerCache.size > 12) {
    const first = stickerCache.keys().next().value;
    stickerCache.delete(first);
  }

  return withExif;
}

async function addExif(webpBuffer) {
  try {
    const { default: Webpmux } = await import("node-webpmux");
    const img = new Webpmux.Image();
    const packname = config.packname || "VX MD BOT";
    const author = config.author || "VX MD BOT";
    const json = {
      "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
      "sticker-pack-name": packname,
      "sticker-pack-publisher": author,
      emojis: ["💋", "😘", "❤️"],
    };
    const attr = Buffer.from([
      0x49,0x49,0x2a,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,
      0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00,
    ]);
    const body = Buffer.from(JSON.stringify(json), "utf8");
    const exif = Buffer.concat([attr, body]);
    exif.writeUIntLE(body.length, 14, 4);
    await img.load(webpBuffer);
    img.exif = exif;
    return await img.save(null);
  } catch {
    return webpBuffer;
  }
}

async function sendKiss(message) {
  try {
    const sticker = await getSticker();
    await message.react("💋");
    return message.send({ sticker });
  } catch (error) {
    console.error("[kiss] anime sticker error:", error?.message || error);
    return message.send("❌ Anime kiss sticker এখনও পাওয়া যায়নি। আবার `kiss` লিখুন।");
  }
}

// Type `kiss` directly — works for every member.
Module({
  on: "text",
  name: "anime-kiss-sticker",
  package: "reactions",
  description: "Send a different anime kiss sticker on each kiss",
})(async (message) => {
  if ((message.body || "").trim().toLowerCase() !== "kiss") return;
  await sendKiss(message);
});

// Also support `.kiss`, but never overwrite the richer anime group-fun
// implementation when it is already registered.
if (!commands.has("kiss")) {
  Module({
    command: "kiss",
    aliases: ["kissme"],
    package: "anime",
    description: "Send a different anime kiss sticker",
  })(async (message) => {
    await sendKiss(message);
  });
}
