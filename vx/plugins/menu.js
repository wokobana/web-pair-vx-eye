import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../lib/client.js";
import { Module, getEffectiveCommands } from "../lib/plugins.js";
import axios from "axios";
import config from "../config.js";
import { sendNativeButtons } from "../lib/native-buttons.js";
import { getMenuVideo } from "../lib/video-store.js";

/* -------------------------------------------------------------------------- */
/* PATH                                                                       */
/* -------------------------------------------------------------------------- */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------------------------------------------------- */
/* CONFIG                                                                     */
/* -------------------------------------------------------------------------- */

const name = "♡ 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧 ♡";

/*
 * ============================================================================
 * MENU DP
 * ============================================================================
 *
 * আপনার DP এখানে রাখুন:
 *
 * plugins/bin/menu.jpg
 *
 * ============================================================================
 */

const MENU_DP = path.join(
  __dirname,
  "bin",
  "menu.jpg"
);

/*
 * ============================================================================
 * ALAG ALAG MENU KE LIYE ALAG PHOTO (URL se)
 * ============================================================================
 *
 * Neeche jo category ka naam hai (owner, search, group, panel, general,
 * search, ai, group-fun, anti-link waghera - jo bhi ".menu <category>" me
 * dikhta hai), usi ke saamne apni photo ka seedha (direct) image URL daalo.
 *
 * Example:
 *   owner: "https://i.ibb.co/xxxxxxx/owner.jpg",
 *   group: "https://i.ibb.co/xxxxxxx/group.jpg",
 *
 * - URL http(s) se shuru hona chahiye aur seedha .jpg/.png par khulna
 *   chahiye (image hosting site jaise ibb.co, imgur, telegra.ph use karo).
 * - Category ka naam chhote letters (lowercase) me likho.
 * - Jis category ka URL yahan nahi daloge, uske liye DEFAULT_MENU_IMAGE
 *   (ya na ho to neeche wali local menu.jpg) use hogi.
 * ============================================================================
 */
const CATEGORY_IMAGES = {
  // owner: "https://i.ibb.co/xxxxxxx/owner.jpg",
  // search: "https://i.ibb.co/xxxxxxx/search.jpg",
  // group: "https://i.ibb.co/xxxxxxx/group.jpg",
  // panel: "https://i.ibb.co/xxxxxxx/panel.jpg",
  // general: "https://i.ibb.co/xxxxxxx/general.jpg",
};

/*
 * Poore (full) ".menu" (bina category ke) ke liye photo.
 *
 * Yahan EK se ZYADA URL daal sakte ho - har baar ".menu" likhne par
 * inme se EK RANDOM photo dikhegi, taaki DP baar baar badalta rahe.
 *
 *   const DEFAULT_MENU_IMAGES = [
 *     "https://i.ibb.co/xxxxxxx/menu1.jpg",
 *     "https://i.ibb.co/xxxxxxx/menu2.jpg",
 *     "https://i.ibb.co/xxxxxxx/menu3.jpg",
 *   ];
 *
 * Khaali list chhodo to neeche wali local menu.jpg (ya kuch bhi na ho to
 * sirf text) use hogi.
 */
const DEFAULT_MENU_IMAGES = [
  "https://files.catbox.moe/jiy7xh.jpg",
  "https://files.catbox.moe/i8x21j.jpg",
  "https://files.catbox.moe/i8x21j.jpg",
  "https://files.catbox.moe/hyh276.jpg",
  "https://files.catbox.moe/zjtxrj.jpg",
  "https://files.catbox.moe/8lduh7.jpg",
  "https://files.catbox.moe/znjdbv.jpg",
  "https://files.catbox.moe/jiy7xh.jpg",
  "https://files.catbox.moe/4ly443.jpg",
  "https://files.catbox.moe/q3hg2c.jpg",
  "https://files.catbox.moe/dmwhit.jpg",
  "https://files.catbox.moe/qg37nx.jpg",
  "https://files.catbox.moe/4dinla.jpg",
  "https://files.catbox.moe/vvbots.jpg",
  "https://files.catbox.moe/d5emjn.jpg",
  "https://files.catbox.moe/ruc4mn.jpg",
  "https://files.catbox.moe/2o60co.jpg",
];

/* Image URL ko download karke buffer banata hai. Fail ho to null deta hai,
 * taaki purani local menu.jpg (ya sirf text) par wapas gir jaaye. */
const _imgCache = new Map();
async function fetchMenuImage(url) {
  if (!url) return null;
  if (_imgCache.has(url)) return _imgCache.get(url);
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
      maxContentLength: 8 * 1024 * 1024,
    });
    const buf = Buffer.from(res.data);
    _imgCache.set(url, buf);
    return buf;
  } catch (e) {
    console.warn("[menu] image URL fetch failed:", url, e?.message || e);
    return null;
  }
}

/* Category (ya full menu) ke liye sahi photo chuno: pehle CATEGORY_IMAGES /
 * DEFAULT_MENU_IMAGE (URL), na mile to local menu.jpg. */
async function resolveMenuImage(categoryKey) {
  let url = categoryKey && CATEGORY_IMAGES[categoryKey];

  if (!url && !categoryKey && DEFAULT_MENU_IMAGES.length) {
    // full ".menu" -> ek random DP har baar
    url = DEFAULT_MENU_IMAGES[Math.floor(Math.random() * DEFAULT_MENU_IMAGES.length)];
  }

  const fromUrl = await fetchMenuImage(url || "");
  if (fromUrl) return fromUrl;
  if (hasMenuDP()) return fs.readFileSync(MENU_DP);
  return null;
}


/*
 * ============================================================================
 * MENU SONG
 * ============================================================================
 *
 * আপনার গান এখানে রাখুন:
 *
 * plugins/bin/menu.mp3
 *
 * Menu পাঠালে:
 *
 * 1. প্রথমে DP যাবে
 * 2. তারপর গান পাঠানো হবে
 *
 * ============================================================================
 */

const MENU_SONG = path.join(
  __dirname,
  "bin",
  "menu.mp3"
);


/* -------------------------------------------------------------------------- */
/* RUNTIME                                                                    */
/* -------------------------------------------------------------------------- */

const runtime = (secs) => {
  const pad = (s) =>
    String(s).padStart(2, "0");

  const h = Math.floor(
    secs / 3600
  );

  const m = Math.floor(
    (secs % 3600) / 60
  );

  const s = Math.floor(
    secs % 60
  );

  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
};

const readMore =
  String.fromCharCode(8206)
    .repeat(4001);


/* -------------------------------------------------------------------------- */
/* CHECK DP                                                                   */
/* -------------------------------------------------------------------------- */

function hasMenuDP() {
  try {
    return fs.existsSync(MENU_DP);
  } catch {
    return false;
  }
}


/* -------------------------------------------------------------------------- */
/* CHECK SONG                                                                 */
/* -------------------------------------------------------------------------- */

function hasMenuSong() {
  try {
    return fs.existsSync(MENU_SONG);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* BUILD COMMAND LIST                                                         */
/* -------------------------------------------------------------------------- */

// Menu is generated only from commands actually registered by this project.
function buildGroupedCommands(message) {
  const cmds = getEffectiveCommands();

  // Gaming commands are shown in the full/category menu only when Gaming is
  // enabled for the current group. The setting is per bot + group.
  const botNum =
    message?.botnum ||
    message?.conn?.user?.id ||
    message?.conn?.user?.jid ||
    "";
  const cleanBotNum = String(botNum).split("@")[0].split(":")[0].replace(/\D/g, "");
  const gamingKey = message?.isGroup
    ? `gaming:${message.from}:enabled`
    : null;
  const aiGroupKey = message?.isGroup
    ? `aifather:${message.from}:enabled`
    : null;
  const gamingOn =
    !!gamingKey &&
    !!cleanBotNum &&
    db.get(cleanBotNum, gamingKey, false) === true;
  const aiGroupOn =
    !!aiGroupKey &&
    !!cleanBotNum &&
    db.get(cleanBotNum, aiGroupKey, false) === true;

  const grouped = cmds
    .filter((cmd) => {
      if (!cmd || !cmd.command || cmd.command === "undefined") return false;
      const pkg = String(cmd.package || "").toLowerCase();
      if (pkg === "gaming" && !gamingOn) return false;
      if (pkg === "aigroup" && !aiGroupOn) return false;
      return true;
    })
    .reduce((acc, cmd) => {
      const pkg = String(cmd.package || "uncategorized").toLowerCase();
      if (!acc[pkg]) acc[pkg] = [];
      acc[pkg].push(cmd.command);
      return acc;
    }, {});

  return grouped;
}


/* -------------------------------------------------------------------------- */
/* MENU COMMAND                                                               */
/* -------------------------------------------------------------------------- */

async function sendFullMenu(message, match) {

  try {

    /* ---------------------------------------------------------------------- */
    /* REACTION                                                               */
    /* ---------------------------------------------------------------------- */

    try {
      await message.react("🤖");
    } catch {}


    /* ---------------------------------------------------------------------- */
    /* BOT INFORMATION                                                        */
    /* ---------------------------------------------------------------------- */

    const time =
      new Date().toLocaleTimeString(
        "en-ZA",
        {
          timeZone:
            "Africa/Johannesburg",
        }
      );

    const isPublic =
      db.get(
        message.botnum,
        "mode",
        true
      ) === true;

    const userName =
      message.pushName ||
      "User";

    const usedGB = (
      (
        os.totalmem() -
        os.freemem()
      ) /
      1073741824
    ).toFixed(2);

    const totGB = (
      os.totalmem() /
      1073741824
    ).toFixed(2);

    const ram =
      `${usedGB} / ${totGB} GB`;


    /* ---------------------------------------------------------------------- */
    /* COMMAND GROUPS                                                         */
    /* ---------------------------------------------------------------------- */

    const grouped =
      buildGroupedCommands(message);

    const categories =
      Object.keys(grouped)
        .sort();

    let menuText = "";


    /* ---------------------------------------------------------------------- */
    /* SPECIFIC PACKAGE                                                       */
    /* ---------------------------------------------------------------------- */

    const requestedPackage = String(match || "").trim().toLowerCase();
    
    if (
      match &&
      grouped[requestedPackage]
    ) {

      const pack = requestedPackage;

      menuText +=
        `\n*╭────❒ ${pack.toUpperCase()} ❒⁠⁠⁠⁠*\n`;

      grouped[pack]
        .sort((a, b) => a.localeCompare(b))
        .forEach((cmdName) => {
          menuText += `*├◈ ${cmdName}*\n`;
        });

      menuText += `*┕──────────────────❒*\n`;

    }


    /* ---------------------------------------------------------------------- */
    /* FULL MENU                                                              */
    /* ---------------------------------------------------------------------- */

    else {

      /*
       * ======================================================================
       * NEW MENU HEADER
       * ======================================================================
       */

      const totalCommands = categories.reduce(
        (sum, cat) => sum + grouped[cat].length,
        0
      );

      menuText +=
        `\n` +
        `╭━━━〔 ✦ 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧 ✦ 〕━━━╮\n` +
        `┃ 👤 User     : @${userName}\n` +
        `┃ 🤖 Bot      : 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧\n` +
        `┃ 🧠 Version  : 1.0.0\n` +
        `┃ ⚡ Mode     : ${isPublic ? "PUBLIC" : "PRIVATE"}\n` +
        `┃ 📦 Commands : ${totalCommands}\n` +
        `┃ 👑 Owner    : 𝗠𝗢𝗡𝗦𝗧𝗘𝗥 \n` +
        `┃ 👑 2nd Owner: 𝗟𝗢𝗖𝗞 𝗕𝗜𝗧 𝗚𝗔𝗡𝗚\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━╯\n` +
        `\n` +
        `╭━━〔 📚 𝗖𝗢𝗠𝗠𝗔𝗡𝗗 𝗠𝗘𝗡𝗨 〕━━╮\n` +
        `┃ 💡 Type *${config.prefix || "."}allmenu <category>* for one section\n` +
        `┃ ✨ Type *${config.prefix || "."}allmenu* for everything\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━━╯\n`;


      /* -------------------------------------------------------------------- */
      /* PACKAGE NOT FOUND                                                    */
      /* -------------------------------------------------------------------- */

      if (
        match &&
        !grouped[
          String(match)
            .toLowerCase()
        ]
      ) {

        menuText +=
          `\n🍌 *Package not found: ${match}*\n\n`;

        menuText +=
          `*Available Packages*:\n`;

        categories.forEach(
          (cat) => {

            menuText +=
              `├◈ ${cat}\n`;

          }
        );

      }


      /* -------------------------------------------------------------------- */
      /* ALL PACKAGES                                                         */
      /* -------------------------------------------------------------------- */

      else {

        for (
          const cat of categories
        ) {

          menuText +=
            `\n╭━━〔 ✦ ${cat.toUpperCase()} ✦ 〕━━╮\n`;

          grouped[cat]
            .sort((a, b) =>
              a.localeCompare(b)
            )
            .forEach(
              (cmdName) => {

                if (
                  cat === "group" &&
                  cmdName === "gstatus"
                ) {

                  menuText +=
                    `┃ ✧ *${cmdName}* _(${"gs / groupstatus / gcstatus"})_\n`;

                } else {

                  menuText +=
                    `┃ ✧ *${cmdName}*\n`;

                }

              }
            );

          menuText +=
            `╰━━━━━━━━━━━━━━━━━━━━╯\n`;
        }
      }

      menuText +=
        `\n╭━━〔 💖 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧 〕━━╮\n` +
        `┃ 🌸 Made with love & code\n` +
        `┃ 📲 Telegram: @vx_md_bot_1\n` +
        `╰━━━━━━━━━━━━━━━━━━━━╯`;
    }


    /* ---------------------------------------------------------------------- */
    /* SEND MENU IMAGE (per-category URL, ya local menu.jpg)                  */
    /* ---------------------------------------------------------------------- */

    const menuCategoryKey = (match && grouped[requestedPackage]) ? requestedPackage : null;

    const menuImageBuffer = await resolveMenuImage(menuCategoryKey);

    if (menuImageBuffer) {

      await message.conn.sendMessage(
        message.from,
        {
          image: menuImageBuffer,

          caption:
            menuText,

          mimetype:
            "image/jpeg",

          contextInfo: {
            forwardingScore: 2,

            isForwarded: true,

            forwardedNewsletterMessageInfo: {
              newsletterJid:
                "120363410099245350@newsletter",

              newsletterName:
                "© 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧",

              serverMessageId: 6,
            },
          },
        },
        {
          quoted:
            message.key
              ? {
                  key:
                    message.key,

                  message: {
                    conversation:
                      "Menu",
                  },
                }
              : undefined,
        }
      );

    } else {

      /* -------------------------------------------------------------------- */
      /* DP NOT FOUND                                                         */
      /* -------------------------------------------------------------------- */

      console.error(
        `[MENU] no image for category "${menuCategoryKey || "full"}" (URL fetch failed, MENU_DP: ${MENU_DP})`
      );

      await message.conn.sendMessage(
        message.from,
        {
          text:
            menuText +
            `\n\n⚠️ *মেনুর ছবি পাওয়া যায়নি!*\n` +
            `📁 প্রয়োজনীয় ফাইল:\n` +
            `\`plugins/bin/menu.jpg\``,
        },
        {
          quoted:
            message.key
              ? {
                  key:
                    message.key,

                  message: {
                    conversation:
                      "Menu",
                  },
                }
              : undefined,
        }
      );
    }


    /* ---------------------------------------------------------------------- */
    /* SEND MENU SONG                                                         */
    /* ---------------------------------------------------------------------- */

    if (hasMenuSong()) {

      try {

        await message.conn.sendMessage(
          message.from,
          {
            audio:
              fs.readFileSync(
                MENU_SONG
              ),

            mimetype:
              "audio/mpeg",

            fileName:
              "VX-MD-MENU.mp3",

            ptt: false,

            contextInfo: {
              forwardingScore: 2,

              isForwarded: true,

              forwardedNewsletterMessageInfo: {
                newsletterJid:
                  "120363410099245350@newsletter",

                newsletterName:
                  "© 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧",

                serverMessageId: 7,
              },
            },
          },
          {
            quoted:
              message.key
                ? {
                    key:
                      message.key,

                    message: {
                      conversation:
                        "Menu Song",
                    },
                  }
                : undefined,
          }
        );

      } catch (songError) {

        console.error(
          "❌ Menu song send error:",
          songError
        );

      }

    } else {

      console.log(
        `[MENU] Song not found: ${MENU_SONG}`
      );

    }


    /* ---------------------------------------------------------------------- */
    /* SUCCESS REACTION                                                       */
    /* ---------------------------------------------------------------------- */

    try {
      await message.react("✅");
    } catch {}


  } catch (err) {

    console.error(
      "❌ Menu command error:",
      err?.stack ||
        err?.message ||
        err
    );

    try {

      await message.conn.sendMessage(
        message.from,
        {
          text:
            `❌ মেনুতে সমস্যা:\n\n` +
            `${
              err?.message ||
              err
            }`,
        }
      );

    } catch {}
  }
}


/* -------------------------------------------------------------------------- */
/* TELEGRAM PAIR LINK                                                         */
/* -------------------------------------------------------------------------- */

/*
 * Telegram pair bot ka link.
 *  1. Railway Variable  TELEGRAM_PAIR_LINK  (poora link) ho to wahi use hoga
 *  2. Nahi to bot.js jo Telegram bot chalata hai uska username use hoga
 *  3. Nahi to neeche wala default
 */
const DEFAULT_TELEGRAM_PAIR_LINK = "https://t.me/vxmdbot999";

function getTelegramPairLink() {
  const envLink = String(process.env.TELEGRAM_PAIR_LINK || "https://t.me/vxmdbot999").trim();
  if (envLink) return envLink;
  const uname = String(globalThis.__VX_TG_BOT_USERNAME || "").replace(/^@/, "").trim();
  if (uname) return `https://t.me/${uname}`;
  return DEFAULT_TELEGRAM_PAIR_LINK;
}

const WA_CHANNEL_URL =
  process.env.WA_CHANNEL_LINK ||
  "https://whatsapp.com/channel/0029Vb9Zs0R5Ejy1dQMTH02e";


/* -------------------------------------------------------------------------- */
/* MAIN MENU  (.menu)  ->  short menu with buttons                            */
/* -------------------------------------------------------------------------- */

Module({
  command: "menu",
  package: "general",
  description: "Main menu — All Menu aur Telegram Pair buttons"
})(async (message, match) => {

  // ".menu <category>" / ".menu bangla" purane tareeke se kaam karta rahe
  if (String(match || "").trim()) {
    return sendFullMenu(message, match);
  }

  try {
    try { await message.react("🤖"); } catch {}

    const sock = message.conn;
    const prefix = config.prefix || ".";

    const isPublic = db.get(message.botnum, "mode", true) === true;
    const userName = message.pushName || "User";
    const senderJid = message.sender || message.key?.participant || message.key?.remoteJid;
    const senderNum = String(senderJid || "").split("@")[0].split(":")[0] || "User";

    const grouped = buildGroupedCommands(message);
    const totalCommands = Object.values(grouped).reduce((n, list) => n + list.length, 0);

    const hour = Number(
      new Date().toLocaleString("en-GB", {
        hour: "2-digit",
        hour12: false,
        timeZone: "Africa/Lagos",
      })
    );
    const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";
    const nowText = new Date().toLocaleString("en-GB", { timeZone: "Africa/Lagos" });

    const menuText = `
┏━━◆ ✦ 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧 ✦ ◆━━┓
┃ ⧎ ʜᴇʟʟᴏ  @${senderNum}
┃ ⧎ ʙᴏᴛ ɴᴀᴍᴇ 「 *𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧* 」
┃ ⧎ ᴠᴇʀsɪᴏɴ : *1.0.0*
┃ ⧎ ᴏᴡɴᴇʀ : *𝗠𝗢𝗡 𝗦𝗧𝗘𝗥  *
┃ ⧎ 2nd owner : 𝗟𝗢𝗖𝗞 𝗕𝗜𝗧 
┃ ⧎ ᴍᴏᴅᴇ : *${isPublic ? "PUBLIC" : "PRIVATE"}*
┃ ⧎ ʀᴜɴᴛɪᴍᴇ : ${runtime(process.uptime())}
┃ ⧎ ᴘʀᴇғɪx : 「 ${prefix} 」
┃ ⧎ ᴘʟᴀᴛғᴏʀᴍ : ${os.platform()}
┃ ⧎ ᴄᴏᴍᴍᴀɴᴅs : ${totalCommands} total
┃ 🕒 ${nowText}
┗━━━━━━━━━━━━━━━━━━━┛`;

    // Header photo (random DP, same as before) - optional
    let headerImage = null;
    try {
      headerImage = await resolveMenuImage(null);
    } catch {}

    // Normal ".menu" me DP ki jagah sirf VIDEO (silent, GIF-style, bina awaaz).
    // Video na mile / fail ho to purani DP wapas dikhegi.
    let headerVideo = null;
    try {
      headerVideo = await getMenuVideo(message.botnum || message.conn?.user?.id);
    } catch (e) {
      console.warn("[menu] video load failed:", e?.message || e);
    }

    await sendNativeButtons(sock, message.from, {
      title: "",
      text: menuText,
      footer: "⚙️ Powered by 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧 | © 2026",
      video: headerVideo,
      image: headerImage,
      buttons: [
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "📜 All Menu",
            id: `${prefix}allmenu`,
          }),
        },
        {
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: "📲 Telegram Pair",
            id: `${prefix}telegrampair`,
          }),
        },
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "📢 CHANNEL",
            url: WA_CHANNEL_URL,
            merchant_url: WA_CHANNEL_URL,
          }),
        },
      ],
      contextInfo: {
        mentionedJid: senderJid ? [senderJid] : [],
        forwardingScore: 2,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: "120363410099245350@newsletter",
          newsletterName: "© 𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧",
          serverMessageId: 6,
        },
      },
    });

    try { await message.react("✅"); } catch {}

  } catch (err) {
    console.error("❌ Main menu error:", err?.stack || err?.message || err);
    // Buttons na ja saken to bhi sirf chhota menu (text) bhejo - poora menu nahi
    try {
      const p = config.prefix || ".";
      await message.conn.sendMessage(message.from, {
        text:
          `┏━━◆ *𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧 - 𝐌𝐀𝐈𝐍 𝐌𝐄𝐍𝐔* ◆━━┓\n` +
          `│❖ ${p}allmenu  → poori command list\n` +
          `│❖ ${p}telegrampair  → Telegram pair link\n` +
          `┗━━━━━━━━━━━━━━━━━━━━┛`,
      });
    } catch {}
  }
});


/* -------------------------------------------------------------------------- */
/* ALL MENU  (.allmenu)  ->  poori command list (pehle wala full menu)        */
/* -------------------------------------------------------------------------- */

Module({
  command: "allmenu",
  aliases: ["commandlist"],
  package: "general",
  description: "সব কমান্ড বা নির্দিষ্ট বিভাগ দেখায়"
})(async (message, match) => {
  await sendFullMenu(message, match);
});


/* -------------------------------------------------------------------------- */
/* TELEGRAM PAIR  (.telegrampair)  ->  sirf Telegram ka link                  */
/* -------------------------------------------------------------------------- */

Module({
  command: "telegrampair",
  aliases: ["tgpair", "telepair", "telegram"],
  package: "general",
  description: "Telegram pair bot ka link bhejta hai"
})(async (message) => {
  try {
    // Sirf GROUP me, aur group ka har member (admin ho ya na ho) ye link le sakta hai
    const jid = String(message.from || message.key?.remoteJid || "");
    if (!jid.endsWith("@g.us")) return;
    const who = String(message.sender || message.key?.participant || "").split("@")[0].split(":")[0];
    const senderFull = String(message.sender || message.key?.participant || "");
    const mention = senderFull ? [senderFull] : [];
    await message.conn.sendMessage(
      message.from,
      {
        text: `${who ? `@${who} ` : ""}📲 Telegram Pair:\n${getTelegramPairLink()}\n\nTelegram me /pair 91XXXXXXXXXX bhejo, code milega.`,
        mentions: mention,
      },
      {
        quoted: message.key
          ? { key: message.key, message: { conversation: "Telegram Pair" } }
          : undefined,
      }
    );
  } catch (err) {
    console.error("❌ Telegram pair error:", err?.stack || err?.message || err);
  }
});



/* -------------------------------------------------------------------------- */
/* LIST COMMAND                                                               */
/* -------------------------------------------------------------------------- */

Module({
  command: "list",
  package: "general",
  description:
    "সব কমান্ডের তালিকা দেখায়",
})(async (message) => {

  try {

    const commands =
      getEffectiveCommands()
        .filter(
          (cmd) =>
            cmd &&
            cmd.command &&
            cmd.command !==
              "undefined"
        )
        .map(
          (cmd) =>
            cmd.command
        )
        .join("\n");

    await message.conn.sendMessage(
      message.from,
      {
        text:
          `*📜 LIST OF COMMANDS*\n\n` +
          commands,
      }
    );

  } catch (err) {

    console.error(
      "❌ List command error:",
      err
    );

    await message.conn.sendMessage(
      message.from,
      {
        text:
          `❌ Error: ${
            err?.message || err
          }`,
      }
    );
  }
});


/* -------------------------------------------------------------------------- */
/* ALIVE COMMAND                                                              */
/* -------------------------------------------------------------------------- */

Module({
  command: "alive",
  package: "general",
  description:
    "বট চালু আছে কি না দেখায়",
})(async (message) => {

  try {

    const hostname =
      os.hostname();

    const time =
      new Date().toLocaleTimeString(
        "en-ZA",
        {
          timeZone:
            "Africa/Johannesburg",
        }
      );

    const ramUsedMB = (
      process.memoryUsage()
        .heapUsed /
      1024 /
      1024
    ).toFixed(2);

    const uptime =
      process.uptime();

    const hours =
      Math.floor(
        uptime / 3600
      );

    const minutes =
      Math.floor(
        (uptime % 3600) / 60
      );

    const seconds =
      Math.floor(
        uptime % 60
      );

    const ctx =
      `*${name}* is online\n\n` +

      `*Time:* ${time}\n` +

      `*Host:* ${hostname}\n` +

      `*RAM Usage:* ${ramUsedMB} MB\n` +

      `*Uptime:* ` +
      `${hours}h ${minutes}m ${seconds}s`;


    /* ---------------------------------------------------------------------- */
    /* ALIVE WITH SAME PERSONAL DP                                            */
    /* ---------------------------------------------------------------------- */

    if (hasMenuDP()) {

      await message.conn.sendMessage(
        message.from,
        {
          image:
            fs.readFileSync(
              MENU_DP
            ),

          caption:
            ctx,

          mimetype:
            "image/jpeg",
        }
      );

    } else {

      await message.conn.sendMessage(
        message.from,
        {
          text: ctx,
        }
      );
    }

  } catch (err) {

    console.error(
      "❌ Alive command error:",
      err
    );

    await message.conn.sendMessage(
      message.from,
      {
        text:
          `❌ Error: ${
            err?.message || err
          }`,
      }
    );
  }
});
