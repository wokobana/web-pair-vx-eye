import fs from "fs";
import path from "path";
import crypto from "crypto";
import { tmpdir } from "os";
import fluentFfmpeg from "fluent-ffmpeg";
import { fileURLToPath } from "url";
import sticker from "./sticker.js";
import config from "../config.js";

const ffmpeg = fluentFfmpeg.default || fluentFfmpeg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.join(HERE, "..", "plugins", "bin", "fonts", "NotoSansBengali-SemiBold.ttf");

function temp(ext) {
  return path.join(tmpdir(), `vx-text-${crypto.randomBytes(8).toString("hex")}.${ext}`);
}

function wrapText(input, maxChars = 18) {
  const clean = String(input || "").replace(/\s+/g, " ").trim().slice(0, 140);
  if (!clean) return "";
  const words = clean.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if ((line + " " + word).length <= maxChars) line += " " + word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.slice(0, 7).join("\n");
}

function escapeFilterPath(file) {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export async function makeTextSticker(text) {
  if (!fs.existsSync(FONT)) throw new Error("Bengali sticker font missing");
  const inputText = wrapText(text);
  if (!inputText) throw new Error("Empty sticker text");

  const textFile = temp("txt");
  const output = temp("webp");
  fs.writeFileSync(textFile, inputText, "utf8");

  const fontFile = escapeFilterPath(FONT);
  const textFileEscaped = escapeFilterPath(textFile);
  const filter =
    `drawtext=fontfile='${fontFile}':textfile='${textFileEscaped}':fontcolor=white:` +
    `fontsize=58:line_spacing=10:borderw=8:bordercolor=black@0.85:` +
    `shadowcolor=black@0.6:shadowx=3:shadowy=3:` +
    `x=(w-text_w)/2:y=(h-text_h)/2:` +
    `alpha='if(lt(t,0.20),t/0.20,if(gt(t,1.80),(2.00-t)/0.20,1))'`;

  try {
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input("color=c=black@0.0:s=512x512:r=12")
        .inputFormat("lavfi")
        .duration(2)
        .videoFilters(filter)
        .outputOptions([
          "-c:v", "libwebp",
          "-lossless", "0",
          "-q:v", "55",
          "-loop", "0",
          "-an",
          "-pix_fmt", "yuva420p",
        ])
        .on("end", resolve)
        .on("error", reject)
        .save(output);
    });

    const buffer = fs.readFileSync(output);
    return await sticker.addExif(buffer, {
      packname: config.packname || "VX MD BOT",
      author: config.author || "VX MD BOT",
      categories: ["💬", "✨", "🎌"],
    });
  } finally {
    for (const file of [textFile, output]) {
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    }
  }
}
