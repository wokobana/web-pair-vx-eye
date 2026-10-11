import fs from "fs";
import { tmpdir } from "os";
import crypto from "crypto";
import path from "path";

let webp = null;
let ffmpeg = null;
let ffmpegPathSet = false;

async function ensureTools() {
  if (!webp) {
    const webpPkg = await import("node-webpmux");
    webp = webpPkg.default || webpPkg;
  }
  if (!ffmpeg) {
    const ffmpegModule = await import("fluent-ffmpeg");
    ffmpeg = ffmpegModule.default || ffmpegModule;
  }
  if (!ffmpegPathSet) {
    try {
      const installer = await import("@ffmpeg-installer/ffmpeg");
      const p = installer.default?.path || installer.path;
      if (p) ffmpeg.setFfmpegPath(p);
    } catch {
      // Fall back to ffmpeg from PATH.
    }
    ffmpegPathSet = true;
  }
}

class StickerBuilder {
  constructor() {
    this.tmp = tmpdir();
  }

  _tmp(ext) {
    return path.join(
      this.tmp,
      `${crypto.randomBytes(8).toString("hex")}.${ext}`
    );
  }

  _mediaKind(type) {
    const value = String(type || "").toLowerCase();
    if (value === "image" || value.includes("image")) return "image";
    if (value === "gif" || value.includes("gif")) return "gif";
    return "video";
  }

  _cleanup(...files) {
    for (const file of files) {
      try {
        if (file && fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    }
  }

  /**
   * Convert image/GIF/video to a WhatsApp animated/static WebP sticker.
   * The source is always FIT inside a square canvas; it is never cropped.
   * 512x512 is the WhatsApp sticker canvas, so portrait and landscape frames
   * remain completely visible with transparent padding where necessary.
   */
  async toSticker(type, media, exif = null) {
    await ensureTools();

    const kind = this._mediaKind(type);
    const inputExt = kind === "image" ? "jpg" : kind === "gif" ? "gif" : "mp4";
    const input = this._tmp(inputExt);
    const output = this._tmp("webp");

    fs.writeFileSync(input, media);

    const fitFilter =
      "scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos," +
      "pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=yuva420p";

    try {
      await new Promise((resolve, reject) => {
        const command = ffmpeg(input)
          .on("error", reject)
          .on("end", resolve)
          .addOutputOptions([
            "-vcodec", "libwebp",
            "-vf", kind === "image"
              ? fitFilter
              : `${fitFilter},fps=10`,
            "-an",
            "-loop", "0",
            "-compression_level", "6",
            "-q:v", kind === "image" ? "75" : "55",
          ]);

        if (kind !== "image") {
          command.addOutputOptions([
            "-ss", "0",
            "-t", "00:00:06",
            "-vsync", "0",
          ]);
        } else {
          command.addOutputOptions(["-frames:v", "1"]);
        }

        command.toFormat("webp").save(output);
      });

      const buffer = fs.readFileSync(output);
      return exif ? await this.addExif(buffer, exif) : buffer;
    } finally {
      this._cleanup(input, output);
    }
  }

  async circleImage(media) {
    await ensureTools();
    const input = this._tmp("png");
    const output = this._tmp("png");

    fs.writeFileSync(input, media);

    try {
      await new Promise((resolve, reject) => {
        ffmpeg(input)
          .on("error", reject)
          .on("end", resolve)
          .addOutputOptions([
            "-vf",
            "scale=320:320:force_original_aspect_ratio=increase,crop=320:320," +
              "format=rgba,geq='if((X-W/2)^2+(Y-H/2)^2>(min(W,H)/2)^2,0,255)':128:128:128",
          ])
          .toFormat("png")
          .save(output);
      });

      return fs.readFileSync(output);
    } finally {
      this._cleanup(input, output);
    }
  }

  async toCircleSticker(media, exif = null) {
    const circled = await this.circleImage(media);
    return await this.toSticker("image", circled, exif);
  }

  async addExif(webpSticker, info) {
    await ensureTools();
    const img = new webp.Image();
    const { packname, author, categories } = info || {};

    const json = {
      "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
      "sticker-pack-name": packname || "",
      "sticker-pack-publisher": author || "",
      emojis: categories || ["💖"],
      "android-app-store-link": "https://github.com/naxordeve/whatsapp-bot",
      "ios-app-store-link": "https://github.com/naxordeve/whatsapp-bot",
    };

    const exifAttr = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);

    const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    await img.load(webpSticker);
    img.exif = exif;
    return await img.save(null);
  }

  async getExif(sticker) {
    await ensureTools();
    const img = new webp.Image();
    await img.load(sticker);
    const json = JSON.parse(
      img.exif
        .slice(22)
        .toString()
        .replace("sticker-pack-name", "sticker_pack_name")
        .replace("sticker-pack-publisher", "sticker_pack_publisher")
    );
    return {
      packname: json.sticker_pack_name,
      author: json.sticker_pack_publisher,
    };
  }
}

export default new StickerBuilder();
