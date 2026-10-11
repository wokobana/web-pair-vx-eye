// plugins/welcome-goodbye.js

import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";
import { WELCOME_TEXTS, GOODBYE_TEXTS, pickRandom } from "./bin/text.js";
import axios from "axios";
import { getWelcomeVideo, countAvailableWelcome } from "../lib/video-store.js";
import fs from "fs";
import path from "path";
import { jidNormalizedUser } from "@whiskeysockets/baileys";

import { createRequire } from "module";
const requireCjs = createRequire(import.meta.url);
const mikuConfig = requireCjs("../../config.js");

// Welcome aur Goodbye dono ka Bengali text ek hi jagah (plugins/bin/text.js) se aata hai.
// Har member ke liye naya random text chunta hai.
const randomWelcomeText = () => pickRandom(WELCOME_TEXTS);
const randomGoodbyeText = () => pickRandom(GOODBYE_TEXTS);

/* =========================================================
   WELCOME VIDEO
   Put your video here:
   media/welcome.mp4
   ========================================================= */

// Resolve the welcome video from the project root first, then fall back to
// the plugin's own directory. This keeps it working even when the hosting
// process uses a different working directory.
const WELCOME_VIDEO_CANDIDATES = [
  path.join(process.cwd(), "media", "welcome.mp4"),
  path.join(process.cwd(), "plugins", "bin", "welcome.mp4"),
  path.resolve(new URL("../media/welcome.mp4", import.meta.url).pathname),
];

function getWelcomeVideoPath() {
  for (const file of WELCOME_VIDEO_CANDIDATES) {
    try {
      if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    } catch {}
  }
  return WELCOME_VIDEO_CANDIDATES[0];
}

/* ---------------- helpers ---------------- */

function toBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;

  if (typeof v === "string") {
    return ["true", "1", "yes", "on"].includes(v.toLowerCase());
  }

  return Boolean(v);
}

/* ---------------- text builder ---------------- */

function buildText(template = "", replacements = {}) {
  let text = template || "";

  const wantsPp = text.includes("&pp");

  // Remove &pp from caption
  text = text.replace(/&pp/g, "").trim();

  // Replace member username / mention
  text = text.replace(
    /&mention/g,
    replacements.mentionText || ""
  );
  text = text.replace(
    /&username/g,
    replacements.username || replacements.mentionText || ""
  );

  // Replace group name
  text = text.replace(
    /&group/g,
    replacements.group || replacements.name || ""
  );
  text = text.replace(
    /&name/g,
    replacements.name || replacements.group || ""
  );

  // Replace group size
  text = text.replace(
    /&size/g,
    String(replacements.size ?? "")
  );

  return {
    text,
    wantsPp,
  };
}

/* =========================================================
   WELCOME MEDIA SETTINGS

   welcome: on/off        -> text welcome
   welcome dp on/off     -> member DP
   welcome video on/off  -> welcome video
   ========================================================= */

async function getWelcomeConfig(botNumber, groupJid) {
  const key = `group:${groupJid}:welcome`;
  const raw = await db.getAsync(botNumber, key, null);
  const cfg = raw && typeof raw === "object" ? raw : {};

  return {
    status: toBool(cfg.status),
    dp: toBool(cfg.dp),
    video: toBool(cfg.video),
    videoCount: Math.max(0, parseInt(cfg.videoCount, 10) || 0),
  };
}

async function saveWelcomeConfig(botNumber, groupJid, changes = {}) {
  const current = await getWelcomeConfig(botNumber, groupJid);
  const cfg = { ...current, ...changes };
  await db.set(botNumber, `group:${groupJid}:welcome`, cfg);
  return cfg;
}

/* =========================================================
   FETCH MEMBER PROFILE PICTURE
   ========================================================= */

async function fetchProfileBuffer(conn, jid) {
  try {
    const getUrl =
      typeof conn.profilePictureUrl === "function"
        ? () =>
            conn
              .profilePictureUrl(jid, "image")
              .catch(() => null)
        : () => Promise.resolve(null);

    const url = await getUrl();

    if (!url) {
      return null;
    }

    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
    });

    return Buffer.from(res.data);
  } catch (e) {
    console.error(
      "[welcome-goodbye] fetchProfileBuffer error:",
      e?.message || e
    );

    return null;
  }
}

/* =========================================================
   LOAD WELCOME VIDEO
   ========================================================= */

async function getWelcomeVideoBuffer(limit = 0, botNumber = "") {
  // 1) Is bot ka apna set kiya hua video (.setwelcomevideo) — sirf isi bot ke liye
  try {
    const own = await getWelcomeVideo(limit, botNumber);
    if (own) return own;
  } catch (e) {
    console.error("[welcome-goodbye] getWelcomeVideo error:", e?.message || e);
  }
  // 2) Warna config.js ke welcomeVideoUrls: random URL ko pehle khud download karke Buffer banao
  //    (seedha {url} bhejne par WhatsApp upload aksar fail ho jata tha). Ek URL na chale to agla try.
  const urls = (mikuConfig.welcomeVideoUrls || []).filter((u) => /^https?:\/\//i.test(String(u || "")));
  const order = urls.map((u) => [Math.random(), u]).sort((x, y) => x[0] - y[0]).map((x) => x[1]).slice(0, 5);
  for (const u of order) {
    try {
      if (URL_VIDEO_CACHE.has(u)) return URL_VIDEO_CACHE.get(u);
      const res = await axios.get(u, {
        responseType: "arraybuffer",
        timeout: 45000,
        maxContentLength: 60 * 1024 * 1024,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "video/*,*/*" },
      });
      const buf = Buffer.from(res.data);
      if (buf.length < 10 * 1024) throw new Error("video bahut chhota/invalid: " + buf.length);
      if (URL_VIDEO_CACHE.size >= 4) URL_VIDEO_CACHE.delete(URL_VIDEO_CACHE.keys().next().value);
      URL_VIDEO_CACHE.set(u, buf);
      return buf;
    } catch (e) {
      console.error("[welcome-goodbye] welcome video URL fail:", u, e?.message || e);
    }
  }
  return null;
}
const URL_VIDEO_CACHE = new Map();

/* =========================================================
   SEND WELCOME MESSAGE
   ========================================================= */

async function sendWelcomeMsg(
  conn,
  groupJid,
  text,
  mentions = [],
  imgBuffer = null,
  videoBuffer = null
) {
  try {
    /*
      Priority:

      1. Welcome video
      2. Member DP
      3. Text only
    */

    let mediaSent = false;

    // Video and DP are independent. If both are ON, send both.
    if (videoBuffer) {
      await conn.sendMessage(groupJid, {
        video: videoBuffer,
        caption: text,
        mentions,
        mimetype: "video/mp4",
      });
      mediaSent = true;
    }

    if (imgBuffer) {
      await conn.sendMessage(groupJid, {
        image: imgBuffer,
        caption: mediaSent ? "" : text,
        mentions,
      });
      mediaSent = true;
    }

    if (!mediaSent) {
      await conn.sendMessage(groupJid, {
        text,
        mentions,
      });
    }
  } catch (err) {
    console.error(
      "[welcome-goodbye] sendWelcomeMsg primary error:",
      err?.message || err
    );

    /* ---------------- fallback ---------------- */

    try {
      let fallbackSent = false;

      if (videoBuffer) {
        await conn.sendMessage(groupJid, {
          video: videoBuffer,
          caption: text,
          mimetype: "video/mp4",
        });
        fallbackSent = true;
      }

      if (imgBuffer) {
        await conn.sendMessage(groupJid, {
          image: imgBuffer,
          caption: fallbackSent ? "" : text,
        });
        fallbackSent = true;
      }

      if (!fallbackSent) {
        await conn.sendMessage(groupJid, {
          text: text,
        });
      }
    } catch (e) {
      console.error(
        "[welcome-goodbye] sendWelcomeMsg fallback error:",
        e?.message || e
      );
    }
  }
}


async function sendTypedGroupMessage(conn, groupJid, text, mentions, imgBuffer, videoBuffer, type, kind, _unused, groupName, userName) {
  const t=Number(type)||1;
  const ctx={mentions,...(kind==="welcome"?{}:{}),contextInfo:{mentionedJid:mentions}};

  // If the group has Welcome Video enabled, the video must not be skipped
  // by another welcome variant (V1/V2/V5/V7). Video is the explicit
  // per-group media setting and therefore takes priority for welcome events.
  if (kind === "welcome" && videoBuffer) {
    try {
      return await conn.sendMessage(groupJid, {
        video: videoBuffer,
        caption: text,
        mentions,
        mimetype: "video/mp4",
        contextInfo: { mentionedJid: mentions },
      });
    } catch (e) {
      // URL wala video na chale to welcome band na ho — text/DP se bhej do
      console.error("[welcome-goodbye] welcome video send failed, fallback:", e?.message || e);
      try { // sabse simple video message ek baar aur try (sirf video + caption)
        return await conn.sendMessage(groupJid, { video: videoBuffer, caption: text, mentions });
      } catch (e2) { console.error("[welcome-goodbye] simple video send failed too:", e2?.message || e2); }
      if (imgBuffer) return conn.sendMessage(groupJid, { image: imgBuffer, caption: text, mentions });
      return conn.sendMessage(groupJid, { text, mentions, contextInfo: { mentionedJid: mentions } });
    }
  }

  // .welcome dp on: text wale types (V3/V4/V8) me bhi member ki DP ke saath welcome jaye
  if(kind==="welcome" && imgBuffer && [3,4,8].includes(t)) return conn.sendMessage(groupJid,{image:imgBuffer,caption:text,mentions,contextInfo:{mentionedJid:mentions}});
  if(t===3) return conn.sendMessage(groupJid,{text,contextInfo:{mentionedJid:mentions}});
  if(t===4) return conn.sendText?conn.sendText(groupJid,text,null,{mentions,contextInfo:{mentionedJid:mentions}}):conn.sendMessage(groupJid,{text,mentions});
  if(t===5) return imgBuffer ? conn.sendMessage(groupJid,{image:imgBuffer,caption:`${kind==="welcome"?"https://welcome.guys":"https://goodbye.guys"} ${text}`,mentions}) : conn.sendMessage(groupJid,{text,mentions});
  if(t===6 && videoBuffer) return conn.sendMessage(groupJid,{video:videoBuffer,gifPlayback:true,caption:text,mimetype:"video/mp4",mentions,contextInfo:{mentionedJid:mentions}});
  if(t===2 && kind==="welcome") {
    // Carousel card (member DP + welcome text + button)
    try {
      const {prepareWAMessageMedia,generateWAMessageFromContent}=await import("@whiskeysockets/baileys");
      const media=imgBuffer?await prepareWAMessageMedia({image:imgBuffer},{upload:conn.waUploadToServer}):null;
      const botName=mikuConfig.botName||"VX MD BOT";
      const msg=generateWAMessageFromContent(groupJid,{viewOnceMessage:{message:{messageContextInfo:{},interactiveMessage:{
        header:{title:"Welcome",hasMediaAttachment:false},
        body:{text:`👋 Welcome @${userName}`},
        footer:{text:botName},
        carouselMessage:{cards:[{
          header:{title:"",hasMediaAttachment:!!media,...(media?{imageMessage:media.imageMessage}:{})},
          body:{text},
          footer:{text:botName},
          nativeFlowMessage:{buttons:[{name:"quick_reply",buttonParamsJson:JSON.stringify({display_text:"👋 Hello",id:"hi"})}]},
        }],messageVersion:1},
        contextInfo:{mentionedJid:mentions},
      }}}},{userJid:conn.user?.id});
      return await conn.relayMessage(groupJid,msg.message,{messageId:msg.key.id});
    } catch(e) { console.error("[welcome-goodbye] carousel failed, text fallback:",e?.message||e); }
    return conn.sendMessage(groupJid,{text,mentions,contextInfo:{mentionedJid:mentions}});
  }
  if(t===7 && imgBuffer) {
    const {prepareWAMessageMedia,generateWAMessageFromContent}=await import("@whiskeysockets/baileys");
    const media=await prepareWAMessageMedia({image:imgBuffer},{upload:conn.waUploadToServer});
    const msg=generateWAMessageFromContent(groupJid,{viewOnceMessage:{message:{interactiveMessage:{header:{title:"",hasMediaAttachment:true,imageMessage:media.imageMessage},body:{text},footer:{text:"VX MD BOT"},contextInfo:{mentionedJid:mentions,isForwarded:true,forwardingScore:9},nativeFlowMessage:{buttons:[{name:"quick_reply",buttonParamsJson:JSON.stringify({display_text:kind==="welcome"?"👋 Hello":"👋 Goodbye",id:kind==="welcome"?"hi":"bye"})}]}}}}},{userJid:conn.user?.id});
    return conn.relayMessage(groupJid,msg.message,{messageId:msg.key.id});
  }
  if(t===8) return conn.sendMessage(groupJid,{text:`${kind==="welcome"?"Hai":"Goodbye"} @${userName}, ${kind==="welcome"?"welcome to":"from"} grup ${groupName}`,mentions});
  if(t===2) return conn.sendMessage(groupJid,{text:`👋 ${text}`,mentions});
  if(t===1 && imgBuffer) return conn.sendMessage(groupJid,{image:imgBuffer,caption:text,mentions,contextInfo:{mentionedJid:mentions}});
  return sendWelcomeMsg(conn,groupJid,text,mentions,imgBuffer,videoBuffer);
}

/* =========================================================
   COMMAND: WELCOME
   ========================================================= */

Module({
  command: "welcome",
  package: "group",
  description: "Turn welcome, DP or welcome video ON/OFF",
})(async (message, match) => {
  try {
    const groupJid = message.from || message.chat || message.key?.remoteJid;

    if (!groupJid || !groupJid.includes("@g.us")) {
      return message.send?.("❌ Use this command inside the group.");
    }

    await message.loadGroupInfo();

    if (!message.isAdmin && !message.isFromMe && !message.isfromMe) {
      return message.send?.("❌ শুধুমাত্র Group Admin এই setting পরিবর্তন করতে পারবেন।");
    }

    const botNumber =
      (message.conn?.user?.id && String(message.conn.user.id).split(":")[0]) ||
      "bot";

    const raw = String(match || "").trim().toLowerCase().replace(/\s+/g, " ");

    if (!raw) {
      const cfg = await getWelcomeConfig(botNumber, groupJid);
      return message.sendreply?.(
        `╭─〔 *WELCOME SETTINGS* 〕\n` +
        `├─ Welcome: ${cfg.status ? "✅ ON" : "❌ OFF"}\n` +
        `├─ DP: ${cfg.dp ? "✅ ON" : "❌ OFF"}\n` +
        `├─ Video: ${cfg.video ? "✅ ON" + (cfg.videoCount ? " (" + cfg.videoCount + " videos)" : " (sab videos)") : "❌ OFF"}\n` +
        `╰─➤ Use: .welcome on/off | .welcome dp on/off | .welcome video on/off`
      );
    }

    const parts = raw.split(" ");

    if (parts.length === 1 && (parts[0] === "on" || parts[0] === "off")) {
      const cfg = await saveWelcomeConfig(botNumber, groupJid, {
        status: parts[0] === "on",
      });
      await message.react?.(cfg.status ? "✅" : "❌");
      return message.send?.(cfg.status ? "✅ Welcome ON" : "❌ Welcome OFF");
    }

    if (parts[0] === "video" && parts[1] === "on" && parts.length === 3 && /^\d+$/.test(parts[2])) {
      const n = Math.max(1, parseInt(parts[2], 10));
      const cfg = await saveWelcomeConfig(botNumber, groupJid, { video: true, videoCount: n });
      await message.react?.("✅");
      return message.send?.(`✅ Welcome VIDEO ON — ${n} alag-alag video (available: ${countAvailableWelcome(botNumber)})`);
    }

    if (parts.length === 2 && ["dp", "video"].includes(parts[0]) && ["on", "off"].includes(parts[1])) {
      const field = parts[0];
      const enabled = parts[1] === "on";
      const cfg = await saveWelcomeConfig(botNumber, groupJid, field === "video" ? { video: enabled, videoCount: 0 } : { [field]: enabled });

      await message.react?.(enabled ? "✅" : "❌");
      return message.send?.(
        enabled
          ? `✅ Welcome ${field.toUpperCase()} ON`
          : `❌ Welcome ${field.toUpperCase()} OFF`
      );
    }

    return message.send?.(
      "❌ সঠিক নিয়ম:\n" +
      ".welcome on\n" +
      ".welcome off\n" +
      ".welcome dp on\n" +
      ".welcome dp off\n" +
      ".welcome video on\n" +
      ".welcome video on 10  (10 alag videos)\n" +
      ".welcome video off\n" +
      "(short: .wdp on/off, .wvideo on/off)"
    );
  } catch (err) {
    console.error("[welcome-goodbye] welcome command error:", err?.message || err);
  }
});

/* ---------------------------------------------------------
   SHORT COMMANDS: .wdp on/off and .wvideo on/off  (.dp / .video naam YouTube video command se takrate the)
   These change only the welcome media setting.
   --------------------------------------------------------- */

Module({
  command: "wdp",
  aliases: ["welcomedp"],
  package: "group",
  description: "Turn welcome member DP ON/OFF",
})(async (message, match) => {
  try {
    if (!message.isGroup) return message.reply("❌ এই command শুধুমাত্র Group-এ ব্যবহার করা যেতে পারে।");
    await message.loadGroupInfo();
    if (!message.isAdmin && !message.isFromMe && !message.isfromMe) return message.reply("❌ শুধুমাত্র Group Admin এই setting পরিবর্তন করতে পারবেন।");

    const value = String(match || "").trim().toLowerCase();
    if (!["on", "off"].includes(value)) {
      return message.reply("❌ `.wdp on` অথবা `.wdp off` ব্যবহার করুন");
    }

    const botNumber = (message.conn?.user?.id && String(message.conn.user.id).split(":")[0]) || "bot";
    const cfg = await saveWelcomeConfig(botNumber, message.from, { dp: value === "on" });
    return message.reply(cfg.dp ? "✅ Welcome DP ON" : "❌ Welcome DP OFF");
  } catch (e) {
    console.error("[welcome-goodbye] dp command error:", e?.message || e);
  }
});

Module({
  command: "wvideo",
  aliases: ["welcomevideotoggle"],
  package: "group",
  description: "Turn welcome video ON/OFF",
})(async (message, match) => {
  try {
    if (!message.isGroup) return message.reply("❌ এই command শুধুমাত্র Group-এ ব্যবহার করা যেতে পারে।");
    await message.loadGroupInfo();
    if (!message.isAdmin && !message.isFromMe && !message.isfromMe) return message.reply("❌ শুধুমাত্র Group Admin এই setting পরিবর্তন করতে পারবেন।");

    const vp = String(match || "").trim().toLowerCase().split(/\s+/);
    const value = vp[0];
    if (!["on", "off"].includes(value)) {
      return message.reply("❌ `.wvideo on`, `.wvideo on 10` অথবা `.wvideo off` ব্যবহার করুন");
    }
    const count = value === "on" && /^\d+$/.test(vp[1] || "") ? Math.max(1, parseInt(vp[1], 10)) : 0;

    const botNumber = (message.conn?.user?.id && String(message.conn.user.id).split(":")[0]) || "bot";
    const cfg = await saveWelcomeConfig(botNumber, message.from, { video: value === "on", videoCount: count });
    return message.reply(cfg.video ? `✅ Welcome Video ON${count ? ` (${count} videos)` : " (sab videos)"}` : "❌ Welcome Video OFF");
  } catch (e) {
    console.error("[welcome-goodbye] video command error:", e?.message || e);
  }
});

/* =========================================================
   COMMAND: GOODBYE
   ========================================================= */

Module({
  command: "goodbye",
  package: "group",
  description:
    "Turn per-group goodbye ON or OFF (must be used inside the group).",
})(async (message, match) => {
  try {
    const groupJid =
      message.from ||
      message.chat ||
      message.key?.remoteJid ||
      (message.isGroup ? message.isGroup : null);

    if (!groupJid || !groupJid.includes("@g.us")) {
      return await message.send?.(
        "❌ Use this command inside the group to toggle goodbye messages."
      );
    }

    const raw = (match || "").trim().toLowerCase();

    /* ---------------- check status ---------------- */

    if (!raw) {
      const botNumber =
        (message.conn?.user?.id &&
          String(message.conn.user.id).split(":")[0]) ||
        "bot";

      const key = `group:${groupJid}:goodbye`;

      const cfg = await db.getAsync(
        botNumber,
        key,
        null
      );

      const status =
        cfg && typeof cfg === "object"
          ? toBool(cfg.status)
          : false;

      return await message.sendreply?.(
        `Goodbye is ${
          status ? "✅ ON" : "❌ OFF"
        } for this group.`
      );
    }

    /* ---------------- validate ---------------- */

    if (raw !== "on" && raw !== "off") {
      return await message.send?.(
        "❌ Invalid option. Use `on` or `off`."
      );
    }

    const botNumber =
      (message.conn?.user?.id &&
        String(message.conn.user.id).split(":")[0]) ||
      "bot";

    const key = `group:${groupJid}:goodbye`;

    const cfg = {
      status: raw === "on",
    };

    await db.set(
      botNumber,
      key,
      cfg
    );

    await message.react?.("✅");

    return await message.send(
      cfg.status
        ? "✅ Goodbye ENABLED for this group"
        : "❌ Goodbye DISABLED for this group"
    );
  } catch (err) {
    console.error(
      "[welcome-goodbye] goodbye command error:",
      err?.message || err
    );
  }
});

/* =========================================================
   EVENT: GROUP PARTICIPANTS UPDATE
   ========================================================= */

Module({
  on: "group-participants.update",
})(async (_msg, event, conn) => {
  try {
    if (
      !event ||
      !event.id ||
      !event.action ||
      !Array.isArray(event.participants)
    ) {
      return;
    }

    const groupJid = event.id;

    const groupName =
      event.groupName ||
      (event.groupMetadata &&
        event.groupMetadata.subject) ||
      "";

    const groupSize =
      typeof event.groupSize === "number"
        ? event.groupSize
        : event.groupMetadata &&
          Array.isArray(
            event.groupMetadata.participants
          )
        ? event.groupMetadata.participants.length
        : event.groupMetadata &&
          event.groupMetadata.participants
        ? event.groupMetadata.participants.length
        : 0;

    /* ---------------- bot number ---------------- */

    const botNumber =
      (conn?.user?.id &&
        String(conn.user.id).split(":")[0]) ||
      "bot";

    const action = String(
      event.action
    ).toLowerCase();

    const botJidFull = jidNormalizedUser(
      conn?.user?.id
    );

    /* =====================================================
       LOAD WELCOME VIDEO ONCE PER EVENT
       ===================================================== */

    let welcomeVideoBuffer = null;

    if (
      action === "add" ||
      action === "invite" ||
      action === "joined"
    ) {
      const welcomeCfg = await getWelcomeConfig(botNumber, groupJid);
      const welcomeType = Number(await db.getAsync(botNumber, "setting:welcomeType", 1)) || 1;
      if (welcomeCfg.video || welcomeType === 6) {
        welcomeVideoBuffer = await getWelcomeVideoBuffer(welcomeCfg.videoCount, botNumber);
      }
    }

    /* =====================================================
       PROCESS PARTICIPANTS
       ===================================================== */

    for (const p of event.participants) {
      try {
        const participantJid =
          jidNormalizedUser(
            typeof p === "string"
              ? p
              : p.id || p.jid || ""
          );

        if (!participantJid) {
          continue;
        }

        /* Skip bot itself */

        if (
          botJidFull &&
          participantJid === botJidFull
        ) {
          continue;
        }

        /* =================================================
           WELCOME
           ================================================= */

        if (
          action === "add" ||
          action === "invite" ||
          action === "joined"
        ) {
          const key =
            `group:${groupJid}:welcome`;

          const cfgRaw =
            await db.getAsync(
              botNumber,
              key,
              null
            );

          const enabled =
            cfgRaw &&
            typeof cfgRaw === "object"
              ? toBool(cfgRaw.status)
              : false;

          if (!enabled) {
            continue;
          }

          const mentionText =
            `@${participantJid.split("@")[0]}`;
          const userName = participantJid.split("@")[0] || "User";
          const welcomeType = Number(await db.getAsync(botNumber, "setting:welcomeType", 1)) || 1;

          const replacements = {
            mentionText,
            username: mentionText,
            name: groupName,
            group: groupName,
            size: groupSize,
          };

          const {
            text,
            wantsPp,
          } = buildText(
            cfgRaw.customText || randomWelcomeText(),
            replacements
          );

          /* ---------------- member DP ---------------- */

          let imgBuf = null;
          const welcomeCfg = await getWelcomeConfig(botNumber, groupJid);

          // DP is controlled independently, but variants that require an image
          // (V1/V2/V5/V7) also fetch the profile automatically.
          if (welcomeCfg.dp || [1,2,5,7].includes(welcomeType)) {
            imgBuf = await fetchProfileBuffer(conn, participantJid);
          }
          if (welcomeType === 6 && !welcomeVideoBuffer) welcomeVideoBuffer = await getWelcomeVideoBuffer(0, botNumber);

          /* ---------------- send welcome ---------------- */

          try {
            await sendTypedGroupMessage(conn,groupJid,text,[participantJid],imgBuf,welcomeVideoBuffer,welcomeType,"welcome",imgBuf,groupName,userName);
          } catch (sendErr) {
            console.error("[welcome-goodbye] welcome send failed, plain text fallback:", sendErr?.message || sendErr);
            await conn.sendMessage(groupJid, { text, mentions: [participantJid] });
          }

          continue;
        }

        /* =================================================
           GOODBYE
           ================================================= */

        if (
          action === "remove" ||
          action === "leave" ||
          action === "left" ||
          action === "kicked"
        ) {
          const key =
            `group:${groupJid}:goodbye`;

          const cfgRaw =
            await db.getAsync(
              botNumber,
              key,
              null
            );

          const enabled =
            cfgRaw &&
            typeof cfgRaw === "object"
              ? toBool(cfgRaw.status)
              : false;

          if (!enabled) {
            continue;
          }

          const mentionText =
            `@${participantJid.split("@")[0]}`;
          const userName = participantJid.split("@")[0] || "User";
          const goodbyeType = Number(await db.getAsync(botNumber, "setting:goodbyeType", 1)) || 1;

          const replacements = {
            mentionText,
            username: mentionText,
            name: groupName,
            group: groupName,
            size: groupSize,
          };

          const {
            text,
            wantsPp,
          } = buildText(
            cfgRaw.customText || randomGoodbyeText(),
            replacements
          );

          let imgBuf = null;

          if (wantsPp || [1,2,5,7].includes(goodbyeType)) {
            imgBuf = await fetchProfileBuffer(conn, participantJid);
          }

          const goodbyeVideo = goodbyeType===6 ? await getWelcomeVideoBuffer() : null;
          try {
            await sendTypedGroupMessage(conn,groupJid,text,[participantJid],imgBuf,goodbyeVideo,goodbyeType,"goodbye",imgBuf,groupName,userName);
          } catch (sendErr) {
            console.error("[welcome-goodbye] goodbye send failed, plain text fallback:", sendErr?.message || sendErr);
            await conn.sendMessage(groupJid, { text, mentions: [participantJid] });
          }

          continue;
        }

        /* =================================================
           PROMOTE / DEMOTE
           ================================================= */

        if (
          action === "promote" ||
          action === "demote"
        ) {
          const owner =
            botJidFull || null;

          const ownerMention = owner
            ? `@${owner.split("@")[0]}`
            : conn.user?.id
            ? `@${String(
                conn.user.id
              ).split(":")[0]}`
            : "Owner";

          const actor =
            event.actor ||
            event.author ||
            event.by ||
            null;

          const actorText = actor
            ? `@${actor.split("@")[0]}`
            : "Admin";

          const targetText =
            `@${participantJid.split("@")[0]}`;

          const actionText =
            action === "promote"
              ? "promoted"
              : "demoted";

          const sendText =
            `╭─〔 *🎉 Admin Event* 〕\n` +
            `├─ ${actorText} has ${actionText} ${targetText}\n` +
            `├─ Group: ${groupName}\n` +
            `╰─➤`;

          try {
            const mentions = [
              actor,
              participantJid,
              botJidFull,
            ].filter(Boolean);

            if (owner) {
              mentions.push(owner);
            }

            await conn.sendMessage(
              groupJid,
              {
                text: sendText,
                mentions,
              }
            );
          } catch (e) {
            console.error(
              "[welcome-goodbye] promote/demote send error:",
              e?.message || e
            );

            try {
              await conn.sendMessage(
                groupJid,
                {
                  text: sendText,
                }
              );
            } catch (_) {}
          }
        }
      } catch (participantError) {
        console.error(
          "[welcome-goodbye] participant processing error:",
          participantError?.message ||
            participantError
        );
      }
    }
  } catch (err) {
    console.error(
      "[welcome-goodbye] event handler error:",
      err?.message || err
    );
  }
});
