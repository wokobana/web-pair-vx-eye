// Welcome 2 / Goodbye 2 — shared code (Rimuru MD ke welcome/goodbye ka English, same-to-same port)
import axios from "axios";
import { createRequire } from "module";
import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
import config from "../config.js";
import { getWelcomeVideo } from "./video-store.js";

const requireCjs = createRequire(import.meta.url);
const mikuConfig = requireCjs("../../config.js");

export const KINDS = {
  welcome: {
    key: "welcome2", typeKey: "setting:welcome2Type", title: "Welcome 2",
    variants: {
      1: { name: "Classic Text", desc: "Full welcome card text (default)", emoji: "👋" },
      2: { name: "Carousel Card", desc: "Interactive carousel card with member DP", emoji: "🃏" },
      3: { name: "Text Only", desc: "Short plain welcome text", emoji: "📝" },
      4: { name: "Channel Style", desc: "Text shown as forwarded from the channel", emoji: "📢" },
      5: { name: "Small DP Card", desc: "Link-preview card with a small member DP", emoji: "✨" },
      6: { name: "Video", desc: "Welcome video (from URL) with caption", emoji: "🎥" },
      7: { name: "Interactive Quoted", desc: "DP + button, forwarded style", emoji: "💬" },
      8: { name: "Super Simple", desc: "One short line, no decoration", emoji: "🙂" },
    },
  },
  goodbye: {
    key: "goodbye2", typeKey: "setting:goodbye2Type", title: "Goodbye 2",
    variants: {
      1: { name: "Canvas Card", desc: "Goodbye image card with member DP + text (default)", emoji: "🎨" },
      2: { name: "Carousel Card", desc: "Interactive carousel card with member DP", emoji: "🃏" },
      3: { name: "Text Only", desc: "Short plain goodbye text", emoji: "📝" },
      4: { name: "Channel Style", desc: "Text shown as forwarded from the channel", emoji: "📢" },
      5: { name: "Small DP Card", desc: "Link-preview card with a small member DP", emoji: "✨" },
      6: { name: "Video", desc: "Goodbye video (from URL) with caption", emoji: "🎥" },
      7: { name: "Interactive Quoted", desc: "DP + button, forwarded style", emoji: "💬" },
      8: { name: "Super Simple", desc: "One short line, no decoration", emoji: "🙂" },
    },
  },
};

const TZ = mikuConfig.timezone || "Asia/Kolkata";
export const botName = () => config.bot?.name || mikuConfig.botName || "VX MD BOT";
export const botNum = (conn) => (conn?.user?.id && String(conn.user.id).split(":")[0]) || "bot";
export const gKey = (kind, gid) => `group:${gid}:${KINDS[kind].key}`;
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

function nowParts() {
  const d = new Date();
  const f = (o) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...o }).format(d);
  return {
    date: f({ day: "2-digit", month: "2-digit", year: "numeric" }),
    time: f({ hour: "2-digit", minute: "2-digit", hour12: false }),
    day: new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(d),
  };
}

export function resolvePlaceholders(tpl, o) {
  const n = nowParts();
  return String(tpl)
    .replace(/{user}/gi, `@${o.number}`)
    .replace(/{number}/gi, o.number)
    .replace(/{group}/gi, o.group || "Group")
    .replace(/{desc}/gi, o.desc || "")
    .replace(/{count}/gi, String(o.count ?? 0))
    .replace(/{owner}/gi, o.owner || "Admin")
    .replace(/{date}/gi, n.date)
    .replace(/{time}/gi, n.time)
    .replace(/{day}/gi, n.day)
    .replace(/{bot}/gi, botName())
    .replace(/{prefix}/gi, config.prefix || ".");
}

export function buildDefaultText(kind, { number, group, desc, count }) {
  const { date } = nowParts();
  if (kind === "goodbye") {
    const farewells = ["Sayonara", "See you", "Bye bye", "Take care", "See you later", "Be well", "Oyasumi~"];
    const quotes = [
      "May your steps be made easy ahead.",
      "Thank you for being part of this group.",
      "Hope we meet again some day.",
      "The door is always open if you ever want to come back.",
      "Take good care of yourself, tomodachi.",
      "The memories here will always stay.",
    ];
    const emojis = ["🌙", "👋", "🥀", "💫", "😢", "🤍"];
    const headers = [
      `🌙 Oyasumi~ minna-san...\nToday one tomodachi has to say goodbye.\nMay the new journey be full of kindness.`,
      `🥀 Minna-san...\nThere is a small farewell today.\nThank you for walking together with us.`,
      `💫 Sayonara~\nNot an end, only a see-you-later.\nMay your days always be warm.`,
      `🌌 Minna-san...\nOne star moved to another sky tonight.\nLet's wish them all the best.`,
    ];
    let msg = `👋🏻 *SAYONARA MEMBER* 👋🏻\n\n`;
    msg += `${rnd(headers)}\n`;
    msg += `${rnd(emojis)} ${rnd(farewells)}, *@${number}* 🤍\n\n`;
    msg += `📌 *GROUP INFO*\n`;
    msg += `> 🏠 *Name* : ${group}\n`;
    msg += `> 👥 *Members Left* : ${count}\n`;
    msg += `> 📅 *Date* : ${date}\n\n`;
    msg += `💌 *Message*\n> 「 ${rnd(quotes)} 」\n\n🌸 _See you again, tomodachi._ 🤍`;
    return msg;
  }
  const greetings = ["Finally here", "Welcome", "Welcome aboard", "Hello", "Hi", "Yokoso~", "Ohayou~"];
  const quotes = [
    "Don't be a silent reader!",
    "Relax, treat this place like home!",
    "Let's start chatting right away!",
    "Get ready for the fun!",
    "Don't be shy, we're all friends here!",
    "If you're unsure how to start, just say hi 😄",
  ];
  const emojis = ["🎐", "🌸", "✨", "💫", "🪸", "🔥", "💖"];
  const headers = [
    `🎐 Ohayou~ minna-san!\nToday we have a new tomodachi 🌱\nLet's welcome them together~`,
    `🌸 Ohayou minna-san!\nOne new friend has finally joined ✨\nHope you enjoy it here and join the chat~`,
    `✨ Ohayou~!\nA new tomodachi arrives with fresh vibes 💫\nYoroshiku ne~ let's have fun together!`,
    `🪸 Ohayou minna-san!\nThis group just gained another family member 🤍\nLet's spend great times together~`,
  ];
  let msg = `👋🏻 *NEW MEMBER WELCOME* 👋🏻\n\n`;
  msg += `${rnd(headers)}\n`;
  msg += `${rnd(emojis)} ${rnd(greetings)}, *@${number}* 💫\n\n`;
  msg += `📌 *GROUP INFO*\n`;
  msg += `> 🏠 *Name* : ${group}\n`;
  msg += `> 👥 *Members* : ${count}\n`;
  msg += `> 📅 *Date* : ${date}\n`;
  if (desc) msg += `\n📝 *Description*\n> ❝ ${desc.slice(0, 120)}${desc.length > 120 ? "..." : ""} ❞\n`;
  msg += `\n✨ *Tip of the Day*\n> 「 ${rnd(quotes)} 」\n\n🌸 _Yoroshiku ne~ hope you enjoy your stay!_ 🤍`;
  return msg;
}

/* ------------------------------ media helpers ------------------------------ */

async function fetchBuf(url, timeout = 25000) {
  const res = await axios.get(url, { responseType: "arraybuffer", timeout, maxContentLength: 60 * 1024 * 1024, headers: { "User-Agent": "Mozilla/5.0" } });
  return Buffer.from(res.data);
}

export async function memberDp(conn, jid) {
  try {
    const url = await conn.profilePictureUrl(jid, "image");
    if (url) return await fetchBuf(url);
  } catch {}
  try {
    const fb = (mikuConfig.dpUrls && mikuConfig.dpUrls[0]) || mikuConfig.menuImage;
    if (fb && /^https?:/i.test(fb)) return await fetchBuf(fb);
  } catch {}
  return null;
}

async function smallThumb(buf) {
  if (!buf) return null;
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buf).resize(200, 200, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();
  } catch { return buf; }
}

const URL_VIDEO_CACHE = new Map();
async function videoFor(botNumber) {
  try { const own = await getWelcomeVideo(0, botNumber); if (own) return own; } catch {}
  const urls = (mikuConfig.welcomeVideoUrls || []).filter((u) => /^https?:\/\//i.test(String(u || "")));
  const order = urls.map((u) => [Math.random(), u]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).slice(0, 5);
  for (const u of order) {
    try {
      if (URL_VIDEO_CACHE.has(u)) return URL_VIDEO_CACHE.get(u);
      const buf = await fetchBuf(u, 45000);
      if (buf.length < 10 * 1024) throw new Error("invalid video");
      if (URL_VIDEO_CACHE.size >= 4) URL_VIDEO_CACHE.delete(URL_VIDEO_CACHE.keys().next().value);
      URL_VIDEO_CACHE.set(u, buf);
      return buf;
    } catch (e) { console.error("[welcome2] video URL failed:", u, e?.message || e); }
  }
  return null;
}

const channelInfo = () => ({
  newsletterJid: config.saluran?.id || mikuConfig.channelJid || "",
  newsletterName: config.saluran?.name || mikuConfig.channelName || botName(),
  serverMessageId: 127,
});
const ctxFwd = (mentions) => {
  const c = channelInfo();
  return { mentionedJid: mentions, ...(c.newsletterJid ? { isForwarded: true, forwardingScore: 9, forwardedNewsletterMessageInfo: c } : {}) };
};

/* ------------------------------ sender (V1..V8) ------------------------------ */

async function sendOne(kind, conn, groupJid, jid, meta, type, customText) {
  const isBye = kind === "goodbye";
  const number = jid.split("@")[0];
  const group = meta?.subject || "Group";
  const count = meta?.participants?.length || 0;
  const desc = meta?.desc || "";
  const owner = (meta?.owner || "").split("@")[0];
  const vars = { number, group, desc, count, owner };
  const mentions = [jid];

  const fullText = customText ? resolvePlaceholders(customText, vars) : buildDefaultText(kind, vars);
  const shortText = customText ? fullText : isBye ? `*Sayonara* @${number} 👋` : `*Hello* @${number} 👋\nWelcome to the group *${group}* 🌸`;

  const needsDp = isBye ? [1, 2, 5, 7].includes(type) : [2, 5, 7].includes(type);
  const dp = needsDp ? await memberDp(conn, jid) : null;

  if (type === 2) {
    const cardBody = customText ? fullText : isBye ? `Thank you for being in *${group}*\n${count} members left` : `Welcome to the group *${group}* 🎉\nMember #${count}`;
    const media = dp ? await prepareWAMessageMedia({ image: dp }, { upload: conn.waUploadToServer }) : null;
    const msg = generateWAMessageFromContent(groupJid, {
      viewOnceMessage: { message: { messageContextInfo: {}, interactiveMessage: {
        header: { title: isBye ? "Goodbye" : "Welcome", hasMediaAttachment: false },
        body: { text: isBye ? `👋 *Sayonara* *@${number}*` : `👋 Welcome *@${number}*` },
        footer: { text: botName() },
        carouselMessage: { cards: [{
          header: { title: "", hasMediaAttachment: !!media, ...(media ? { imageMessage: media.imageMessage } : {}) },
          body: { text: cardBody }, footer: { text: botName() },
          nativeFlowMessage: { buttons: [{ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: isBye ? "👋 Goodbye" : `👋 Hello @${number}`, id: isBye ? "bye" : "hi" }) }] },
        }], messageVersion: 1 },
        contextInfo: { mentionedJid: mentions },
      } } },
    }, { userJid: conn.user?.id });
    return conn.relayMessage(groupJid, msg.message, { messageId: msg.key.id });
  }
  if (type === 3) return conn.sendMessage(groupJid, { text: shortText, mentions, contextInfo: ctxFwd(mentions) });
  if (type === 4) return conn.sendMessage(groupJid, { text: fullText, mentions, contextInfo: ctxFwd(mentions) });
  if (type === 5) {
    const thumb = await smallThumb(dp);
    const site = isBye ? "https://goodbye.guys" : "https://welcome.guys";
    return conn.sendMessage(groupJid, {
      text: site + " " + fullText, mentions,
      contextInfo: { mentionedJid: mentions, externalAdReply: {
        title: isBye ? `Goodbye from ${group}` : `Welcome to ${group}`,
        body: isBye ? `👋 Sayonara ${number}!` : `👋 Hello ${number}!`,
        mediaType: 1, renderLargerThumbnail: false, showAdAttribution: false, sourceUrl: site,
        ...(thumb ? { thumbnail: thumb } : {}),
      } },
    });
  }
  if (type === 6) {
    const video = await videoFor(botNum(conn));
    if (video) {
      try { return await conn.sendMessage(groupJid, { video, gifPlayback: true, mimetype: "video/mp4", caption: fullText, mentions, contextInfo: { mentionedJid: mentions } }); }
      catch (e) {
        console.error(`[${KINDS[kind].key}] video send failed:`, e?.message || e);
        try { return await conn.sendMessage(groupJid, { video, caption: fullText, mentions }); } catch {}
      }
    }
    return conn.sendMessage(groupJid, { text: fullText, mentions });
  }
  if (type === 7) {
    const qFake = { key: { fromMe: false, participant: jid, remoteJid: jid }, message: { conversation: isBye ? "Bye everyone! 👋" : "Hello everyone! 👋" } };
    const media = dp ? await prepareWAMessageMedia({ image: dp }, { upload: conn.waUploadToServer }) : null;
    const msg = generateWAMessageFromContent(groupJid, {
      viewOnceMessage: { message: { messageContextInfo: {}, interactiveMessage: {
        header: media ? { title: "", subtitle: "", hasMediaAttachment: true, imageMessage: media.imageMessage } : { title: isBye ? "Goodbye" : "Welcome", hasMediaAttachment: false },
        body: { text: fullText }, footer: { text: botName() },
        contextInfo: ctxFwd(mentions),
        nativeFlowMessage: { buttons: [{ name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: isBye ? "👋 Goodbye" : "👋 Hello", id: isBye ? "bye" : "hi" }) }] },
      } } },
    }, { quoted: qFake, userJid: conn.user?.id });
    return conn.relayMessage(groupJid, msg.message, { messageId: msg.key.id });
  }
  if (type === 8) {
    return conn.sendMessage(groupJid, { text: customText ? fullText : isBye ? `Goodbye @${number}, from the group ${group}` : `Hi @${number}, welcome to the group ${group}`, mentions });
  }
  // V1 default: welcome = text, goodbye = canvas card (Rimuru)
  if (isBye) {
    try {
      const { createGoodbyeCard } = await import("./rimuru-card.js");
      const avatar = dp || (await memberDp(conn, jid));
      const card = await createGoodbyeCard(number, avatar, group, count.toLocaleString());
      return await conn.sendMessage(groupJid, { image: card, caption: fullText, mentions, contextInfo: ctxFwd(mentions) });
    } catch (e) {
      console.error("[goodbye2] canvas card failed, text fallback:", e?.message || e);
    }
  }
  return conn.sendMessage(groupJid, { text: fullText, mentions });
}

export async function sendNotice(kind, conn, groupJid, jid, meta, type, customText) {
  try {
    return await sendOne(kind, conn, groupJid, jid, meta, type, customText);
  } catch (e) {
    console.error(`[${KINDS[kind].key}] V${type} failed, plain text fallback:`, e?.message || e);
    const number = jid.split("@")[0];
    const vars = { number, group: meta?.subject || "Group", desc: meta?.desc || "", count: meta?.participants?.length || 0, owner: (meta?.owner || "").split("@")[0] };
    const text = customText ? resolvePlaceholders(customText, vars) : buildDefaultText(kind, vars);
    return conn.sendMessage(groupJid, { text, mentions: [jid] });
  }
}
