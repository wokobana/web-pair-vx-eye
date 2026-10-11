import fs from "fs";
import path from "path";
import { Module } from "../lib/plugins.js";
import { isOwnerMessage } from "./groupstatus.js";

/*
|--------------------------------------------------------------------------
| LINK LOCK  -  member link bheje to link delete + group band
|--------------------------------------------------------------------------
| ✅ Har group me PEHLE SE ON rehta hai (kuch set karne ki zarurat nahi).
|
| Kaam:
|   - Koi MEMBER group me link bheje  -> link message DELETE ho jata hai
|     aur group BAND ho jata hai (sirf admins message bhej sakte hain).
|   - ADMIN / group owner / bot owner link bheje -> kuch nahi hota.
|
| Commands (sirf group admin ya bot owner):
|   .linklock off      -> is group me band karo (link allow)
|   .linklock on       -> dobara chalu karo
|   .linklock          -> abhi ka status dekho
|
| Zaroori: bot us group me ADMIN hona chahiye, warna WhatsApp delete/band
| karne nahi deta.
|--------------------------------------------------------------------------
*/

const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "linklock.json");

/* Only groups that were turned OFF are stored; everything else = ON. */
function readDisabled() {
  try {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function isEnabled(groupJid) {
  return readDisabled()[groupJid] !== true;
}

function setEnabled(groupJid, enabled) {
  try {
    const data = readDisabled();
    if (enabled) delete data[groupJid];
    else data[groupJid] = true;
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error("[linklock] save failed:", e?.message || e);
    return false;
  }
}

const LINK_REGEX =
  /(?:https?:\/\/[^\s]+)|(?:www\.[^\s]+)|(?:chat\.whatsapp\.com\/[A-Za-z0-9_-]+)|(?:wa\.me\/[0-9]+)|(?:t\.me\/[A-Za-z0-9_\-]+)|(?:telegram\.me\/[A-Za-z0-9_\-]+)|(?:discord\.gg\/[A-Za-z0-9_\-]+)|(?:discord\.com\/invite\/[A-Za-z0-9_\-]+)|(?:bit\.ly\/[A-Za-z0-9_\-]+)|(?:tinyurl\.com\/[A-Za-z0-9_\-]+)|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|gg|xyz|me|app|online|site|link|dev|in|co|info|biz)\b/i;

function hasLink(text) {
  return LINK_REGEX.test(String(text || ""));
}

/* Load fresh group info and tell if the bot is admin. */
async function botIsAdmin(message) {
  try {
    await message.loadGroupInfo();
    return message.isBotAdmin === true;
  } catch {
    return false;
  }
}

/* Avoid closing / announcing again and again for a burst of links. */
const lastAction = new Map();

Module({
  on: "text",
  name: "linklock-enforce",
  package: "group",
  description: "Member link bheje to link delete karke group band karo (default ON)",
})(async (message) => {
  try {
    if (!message?.isGroup) return;

    const groupJid = message.from;
    if (!groupJid || !isEnabled(groupJid)) return;

    // bot's own / owner's messages are never touched
    if (message.isFromMe || message.isfromMe || message.key?.fromMe) return;
    if (isOwnerMessage(message)) return;

    if (!hasLink(message.body)) return;

    // need fresh info to know if the sender is an admin
    if (!(await botIsAdmin(message))) return; // bot admin nahi -> kuch nahi kar sakta
    if (message.isAdmin) return; // admins ko allow

    // 1) delete the member's link message
    try {
      await message.conn.sendMessage(groupJid, { delete: message.key });
    } catch (e) {
      console.warn("[linklock] delete failed:", e?.message || e);
    }

    // 2) close the group (only admins can send)
    const now = Date.now();
    if (message.announce === true || now - (lastAction.get(groupJid) || 0) < 10000) return;
    lastAction.set(groupJid, now);

    try {
      await message.conn.groupSettingUpdate(groupJid, "announcement");
    } catch (e) {
      console.warn("[linklock] group close failed:", e?.message || e);
      return;
    }

    const sender = message.sender || message.key?.participant || "";
    const tag = String(sender).split("@")[0].split(":")[0];
    await message.conn.sendMessage(groupJid, {
      text:
        `🔒 *গ্রুপ বন্ধ করে দেওয়া হয়েছে।*\n\n` +
        (tag ? `*@${tag} গ্রুপে লিংক পাঠিয়েছে। তাই লিংকটি ডিলিট করা হয়েছে এবং গ্রুপ বন্ধ করে দেওয়া হয়েছে।*\n\n` : "") +
        `*এই ছেলেটার বিরুদ্ধে তোমরা কিছু ব্যবস্থা নাও, নাহলে সে পরে আবার লিংক পাঠাতে পারে। চাইলে আগে তাকে জিজ্ঞেস করে নিতে পারো এবং তারপর গ্রুপ খুলতে পারো। না হলে গ্রুপ খুললেই সে আবার লিংক পাঠাবে। যতবার সে লিংক পাঠাবে, ততবার আমাকে গ্রুপ বন্ধ করতে হবে। তাই এই কারণেই আমি বলছি, আগে তার সাথে কথা বলে তারপর গ্রুপটি খুলো।*\n\n` +
        `*অ্যাডমিন গ্রুপটি আবার খুলতে পারবে।*`,
      mentions: sender ? [sender] : [],
    });
  } catch (error) {
    console.error("[linklock]", error);
  }
});

Module({
  command: "linklock",
  aliases: ["linkclose", "linkband", "antilinkclose"],
  package: "group",
  description: "Link bhejne wale member ka message delete + group band (default ON). .linklock on/off",
})(async (message, match = "") => {
  try {
    if (!message.isGroup) return message.send("❌ Ye command sirf group me chalega.");

    await message.loadGroupInfo();
    if (!message.isAdmin && !isOwnerMessage(message)) {
      return message.send("❌ Sirf group admin ya bot owner ye command chala sakta hai.");
    }

    const arg = String(match || "").trim().toLowerCase();
    const groupJid = message.from;

    if (arg === "off" || arg === "disable" || arg === "band") {
      setEnabled(groupJid, false);
      return message.send("🔓 *Link Lock OFF.* Ab is group me link bhejne par kuch nahi hoga.");
    }

    if (arg === "on" || arg === "enable" || arg === "chalu") {
      setEnabled(groupJid, true);
      return message.send(
        "🔒 *Link Lock ON.* Member link bhejega to link delete hoga aur group band ho jayega.\n" +
        "_(Admin ke link par kuch nahi hota.)_"
      );
    }

    return message.send(
      `🔗 *Link Lock:* ${isEnabled(groupJid) ? "ON ✅" : "OFF ❌"}\n\n` +
      `.linklock off  -> band karo\n.linklock on   -> chalu karo`
    );
  } catch (error) {
    console.error("[linklock cmd]", error);
    return message.send("❌ Error: " + (error?.message || error));
  }
});