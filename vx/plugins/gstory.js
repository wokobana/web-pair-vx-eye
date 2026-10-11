import { Module } from "../lib/plugins.js";
import config from "../config.js";
import {
  parseStatusStyle,
  styleTextContent,
  sendGroupStatus,
  broadcastGroupStatus,
  isOwnerMessage,
  randomIndex,
  sleep,
  listColorNames,
} from "./groupstatus.js";

/*
|--------------------------------------------------------------------------
| GSTORY  - colourful multi-card Group Status  (NEW FEATURE)
|--------------------------------------------------------------------------
| Every card gets its own background colour AND font, so the group sees a
| colourful "story series" instead of one boring status.
|
|  .gstory Hello | Kaise ho | Sab badhiya   -> 3 cards, 3 colours (use  |  )
|  .gstory shayari                          -> 1 random shayari card
|  .gstory love 3                           -> 3 random love cards
|  .gstory rainbow Jai Shree Ram            -> same text in 5 colours
|  .gstory #ff0000 Hello | World            -> fixed colour for all cards
|  .gstory all good morning                 -> post in ALL groups (max 3 cards)
|  .gstory list                             -> categories / colours
|  add  --notify  to also send a small "new status" message in the group
|--------------------------------------------------------------------------
*/

const TEMPLATES = {
  shayari: [
    "প্রতিটি হাসির পিছনে একটি গল্প থাকে,\nপ্রতিটি নীরবতার মধ্যে একটি কথা লুকিয়ে থাকে। ✨",
    "রাস্তা কঠিন হলে কী হয়েছে,\nগন্তব্যও তো সবচেয়ে বিশেষ। 🌙",
    "সময় বদলায়, মানুষ বদলায়,\nকিন্তু যারা হৃদয়ে থাকে তারা কোথায় বদলায়। ❤️",
    "চাঁদের আলোয় তোমার কথা মনে পড়ল,\nহৃদয় বলল — চলো আবার একটু হাসি। 🌌",
    "কিছু সম্পর্ক কথার মুখাপেক্ষী নয়,\nশুধু অনুভূতিই যথেষ্ট। 🕊️",
    "জীবন একটি বই, প্রতিদিন একটি নতুন পাতা,\nলিখতে থাকো, শুধু ভালো কিছু লিখো। 📖",
  ],

  love: [
    "তুমি পাশে থাকলে প্রতিটি দিনই বিশেষ। ❤️",
    "তোমার হাসি আমার সবচেয়ে প্রিয় প্রার্থনা। 🌹",
    "কিছু মানুষ হৃদয়ে নয়, আত্মায় বসবাস করে। 💞",
    "তুমি আমার অভ্যাস নও, আমার প্রয়োজন। 💖",
    "ভালোবাসা সেটা নয় যা পাওয়া যায়,\nভালোবাসা হলো যেটা শেষ পর্যন্ত निभানো যায়। 💫",
    "তোমাকে ছাড়া প্রতিটি আনন্দই অসম্পূর্ণ লাগে। 🥀",
  ],

  attitude: [
    "জঙ্গলে একটি সিংহ একাই যথেষ্ট। 🦁",
    "আমরা তাদের মতো নই যারা পরিস্থিতি দেখে বদলে যায়। 😎",
    "চোখ নিচু নয়, লক্ষ্য ও ইচ্ছা উঁচু রাখো। 🔥",
    "যা আমার নয়, তার জন্য চিন্তাও নেই। 👑",
    "আমাদের নীরবতা দুর্বলতা নয়, এটাই আমাদের অ্যাটিটিউড। 🖤",
    "দুনিয়া কী বলবে, সেটা ভাবার সময় নেই। 😏",
  ],

  motivation: [
    "আজকের পরিশ্রমই আগামী দিনের পরিচয় তৈরি করে। 💪",
    "পড়ে যাওয়া হার নয়,\nউঠে না দাঁড়ানোই হার। 🚀",
    "ছোট ছোট পদক্ষেপও গন্তব্যে পৌঁছে দেয়। 🎯",
    "নিজের উপর বিশ্বাস রাখো,\nবাকিটা নিজে থেকেই ঠিক হয়ে যাবে। ✨",
    "স্বপ্ন সেটা নয় যা ঘুমের মধ্যে আসে,\nস্বপ্ন হলো যা তোমাকে ঘুমাতে দেয় না। 🔥",
    "প্রতিটি সকাল একটি নতুন সুযোগ,\nএটাকে নষ্ট করো না। 🌅",
  ],

  joke: [
    "শিক্ষক: ৫ থেকে ২ চলে গেলে কী বাকি থাকে?\nছাত্র: স্যার, ছুটি! 😂",
    "বন্ধু: তুই এত শান্ত থাকিস কীভাবে?\nআমি: WiFi স্লো, রাগও লোড হচ্ছে। 🐢😂",
    "মা: পড়াশোনা করছিস?\nআমি: হ্যাঁ মা, Google করছি। 😅",
    "বস: ছুটি কেন চাই?\nআমি: স্যার, জীবনেও একটু আপডেট দরকার। 😜",
    "অ্যালার্ম: উঠে পড়!\nআমি: আর মাত্র ৫ মিনিট... (২ ঘণ্টা পরে) 😴",
    "ডাক্তার: আপনার বিশ্রাম দরকার।\nআমি: সেটা তো জন্ম থেকেই দরকার। 😆",
  ],

  goodmorning: [
    "🌅 সুপ্রভাত!\nআজকের দিনটি আপনার জন্য অনেক সুখ নিয়ে আসুক।",
    "☀️ গুড মর্নিং!\nহাসুন, আজকের দিনটি আপনার।",
    "🌼 নতুন সকাল, নতুন আশা, নতুন উদ্যম!\nশুভ সকাল 🙏",
    "☕ চায়ের চুমুক, সকালের সতেজতা —\nআপনার দিনটি মঙ্গলময় হোক!",
    "🐦 পাখিদের মিষ্টি ডাকের সাথে\nআপনার সকালটি সুন্দর হোক!",
  ],

  goodnight: [
    "🌙 শুভ রাত্রি!\nমিষ্টি স্বপ্নে হারিয়ে যান।",
    "✨ গুড নাইট!\nআগামীকাল আবার একটি নতুন শুরু হবে।",
    "😴 সারাদিনের ক্লান্তি ভুলে\nশান্তির ঘুম উপভোগ করুন। শুভ রাত্রি 🌌",
    "🌠 তারার ছায়ায়\nআপনার রাতটি সুন্দর হোক।",
  ],
};

const CATEGORY_ALIASES = {
  shayri: "shayari", shairi: "shayari",
  pyar: "love", pyaar: "love",
  atitude: "attitude", attitude: "attitude",
  motivate: "motivation", motivational: "motivation",
  jokes: "joke", funny: "joke", mazak: "joke",
  gm: "goodmorning", morning: "goodmorning", suprabhat: "goodmorning",
  gn: "goodnight", night: "goodnight", shubhratri: "goodnight",
};

const MAX_CARDS_GROUP = 10;
const MAX_CARDS_ALL = 3;
const CARD_GAP_MS = 1500;

function pickRandom(list, count) {
  const pool = [...list];
  const out = [];
  while (out.length < count && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function helpText(prefix) {
  return (
    `╭━━〔 🎨 *GSTORY* 〕━━╮\n` +
    `┃ রঙিন মাল্টি-কার্ড গ্রুপ স্ট্যাটাস\n` +
    `┃ (প্রতিটি কার্ডে আলাদা রঙ + ফন্ট)\n` +
    `┃\n` +
    `┃ 📝 ${prefix}gstory Hello | Kaise ho | Bye\n` +
    `┃ 💌 ${prefix}gstory shayari\n` +
    `┃ 🔢 ${prefix}gstory love 3\n` +
    `┃ 🌈 ${prefix}gstory rainbow Jai Shree Ram\n` +
    `┃ 🎯 ${prefix}gstory #ff0000 Hello | World\n` +
    `┃ 🌍 ${prefix}gstory all good morning\n` +
    `┃ 📋 ${prefix}gstory list\n` +
    `┃ 🔔 --notify = গ্রুপে একটি ছোট মেসেজও পাঠাবে\n` +
    `╰━━━━━━━━━━━━━━━━━━╯`
  );
}

Module({
  command: "gstory",
  aliases: ["gsfun", "gsseries", "colorstatus"],
  package: "group",
  description: "Colourful multi-card Group Status (shayari, love, rainbow, series)",
  usage: ".gstory Hello | Kaise ho | Bye  /  .gstory shayari  /  .gstory rainbow <text>",
})(async (message, args = "") => {
  try {
    if (!isOwnerMessage(message)) {
      return message.reply("❌ শুধুমাত্র বটের মালিক এই কমান্ডটি ব্যবহার করতে পারবেন।");
    }

    const conn = message.conn;
    if (!conn) return message.reply("❌ *WhatsApp সংযোগ পাওয়া যাচ্ছে না।*");

    const prefix = config.prefix || ".";
    let input = String(args || "").trim();

    /* ---- flags ---- */
    let notify = false;
    if (/(^|\s)--notify(\s|$)/i.test(input)) {
      notify = true;
      input = input.replace(/(^|\s)--notify(?=\s|$)/gi, " ").trim();
    }

    let toAll = false;
    const allMatch = input.match(/^all(?:\s+([\s\S]*))?$/i);
    if (allMatch) {
      toAll = true;
      input = String(allMatch[1] || "").trim();
    }

    /* ---- style prefix (#color / bg:color / font:N) ---- */
    const style = parseStatusStyle(input);
    input = style.text;

    if (!input || /^(help|menu)$/i.test(input)) {
      return message.reply(helpText(prefix));
    }

    if (/^list$/i.test(input)) {
      return message.reply(
        `🎨 *GSTORY ক্যাটাগরি*\n\n` +
          Object.keys(TEMPLATES).map((k) => `> • ${k} (${TEMPLATES[k].length})`).join("\n") +
          `\n\n🌈 *rainbow* <text>\n\n` +
          `🖌️ *রঙ:* ${listColorNames().join(", ")}\n` +
          `> অথবা সরাসরি hex color ব্যবহার করুন: #ff5722`
      );
    }

    /* ---- build cards ---- */
    let cards = [];
    const words = input.split(/\s+/);
    const first = words[0].toLowerCase();
    const category = TEMPLATES[first] ? first : CATEGORY_ALIASES[first];

    if (first === "rainbow") {
      const text = input.slice(words[0].length).trim();
      if (!text) return message.reply(`⚠️ কিছু টেক্সট লিখুন: ${prefix}gstory rainbow Jai Shree Ram`);
      cards = Array.from({ length: 5 }, () => text);
    } else if (category && (words.length === 1 || (words.length === 2 && /^\d+$/.test(words[1])))) {
      const count = Math.min(Math.max(parseInt(words[1], 10) || 1, 1), 5);
      cards = pickRandom(TEMPLATES[category], count);
    } else {
      cards = input.split("|").map((s) => s.trim()).filter(Boolean);
    }

    const maxCards = toAll ? MAX_CARDS_ALL : MAX_CARDS_GROUP;
    if (cards.length > maxCards) cards = cards.slice(0, maxCards);
    if (!cards.length) return message.reply(helpText(prefix));

    const base = randomIndex();
    const makeCard = (text) => ({
      text,
      font: style.font ?? 0,
      backgroundColor: style.color || "#8E24AA",
      fixedColor: Boolean(style.color),
      fixedFont: style.font !== null,
    });

    /* ------------------------ ALL GROUPS ------------------------ */
    if (toAll) {
      await message.react?.("🕕");

      global.isFetchingGroups = true;
      let groups;
      try {
        groups = await conn.groupFetchAllParticipating();
      } finally {
        global.isFetchingGroups = false;
      }

      const groupIds = Object.keys(groups || {});
      if (!groupIds.length) return message.reply("⚠️ বট কোনো গ্রুপে নেই।");

      const names = {};
      for (const id of groupIds) names[id] = groups[id]?.subject || id;

      await message.reply(
        `🌍 *GSTORY ALL* শুরু হয়েছে...\n\n> কার্ড: *${cards.length}*\n> গ্রুপ: *${groupIds.length}*`
      );

      let ok = 0;
      let fail = 0;
      for (let i = 0; i < cards.length; i++) {
        const result = await broadcastGroupStatus(conn, groupIds, makeCard(cards[i]), {
          names,
          rotateFont: true,
          colorOffset: base + i * 7,
        });
        ok += result.success;
        fail += result.failed;
        if (i < cards.length - 1) await sleep(3000);
      }

      await message.react?.(ok > 0 ? "✅" : "❌");
      return message.reply(
        `✅ *GSTORY ALL সম্পন্ন হয়েছে*\n\n> কার্ড: *${cards.length}*\n> গ্রুপ: *${groupIds.length}*\n> সফল: *${ok}* ✅\n> ব্যর্থ: *${fail}* ❌`
      );
    }

    /* ----------------------- CURRENT GROUP ----------------------- */
    if (!message.isGroup) {
      return message.reply(
        `❌ এই কমান্ডটি গ্রুপে ব্যবহার করুন, অথবা সব গ্রুপের জন্য:\n> ${prefix}gstory all <text>`
      );
    }

    const groupJid = message.from || message.key?.remoteJid;
    await message.react?.("⏳");

    let posted = 0;
    let lastError = null;
    for (let i = 0; i < cards.length; i++) {
      try {
        const styled = styleTextContent(makeCard(cards[i]), base + i, { rotateFont: true });
        await sendGroupStatus(conn, groupJid, styled);
        posted++;
      } catch (e) {
        lastError = e;
        console.error("[gstory] card failed:", e?.message || e);
      }
      if (i < cards.length - 1) await sleep(CARD_GAP_MS);
    }

    if (!posted) {
      await message.react?.("❌");
      return message.reply(`❌ *GSTORY ব্যর্থ হয়েছে*\n\n> ${lastError?.message || "অজানা সমস্যা"}`);
    }

    await message.react?.("✅");
    if (notify) {
      await conn
        .sendMessage(groupJid, {
          text: `✨ *নতুন Group Status দেওয়া হয়েছে!* ✨\n\n👀 দেখে নিন এবং React করুন 🔥  (${posted} card${posted > 1 ? "s" : ""})`,
        })
        .catch(() => {});
    }

    return message.reply(
      `✅ *GSTORY পোস্ট হয়েছে:* ${posted}/${cards.length} card${posted > 1 ? "s" : ""} 🎨` +
        (posted < cards.length ? `\n> ⚠️ ${cards.length - posted} টি কার্ড ব্যর্থ হয়েছে` : "")
    );
  } catch (error) {
    global.isFetchingGroups = false;
    console.error("[gstory]", error);
    await message.react?.("❌");
    return message.reply(`❌ *GSTORY তে সমস্যা হয়েছে*\n\n> ${error?.message || error}`);
  }
});
