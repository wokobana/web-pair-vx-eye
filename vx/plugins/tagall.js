import { Module } from "../lib/plugins.js";
import fs from "fs";
import path from "path";

const TAGALL_VIDEO = path.join(process.cwd(), "media", "tagall.mp4");
const emojis = ["⚡","✨","🎖️","💎","🔱","💗","❤‍🩹","👻","🌟","🪄","🎋","🪼","🍿","👀","👑","🦋","🐋","🌻","🌸","🔥","🍉","🍧","🍨","🍦","🧃","🪀","🎾","🪇","🎲","🎡","🧸","🎀","🎈","🩵","♥️","🚩","🏳️‍🌈","🏖️","🎏","🫐","🍓","💋","🍄","🎐","🍇","🐍","🪻","🪸","💀"];
const getEmoji = () => emojis[Math.floor(Math.random()*emojis.length)];

Module({command:"tagall", aliases:["tag", "everyone"], package:"group", description:"Tag all group members with video feedback"})(async (m, text="") => {
  if (!m.isGroup) return m.send("❌ This command can only be used in groups.");
  await m.loadGroupInfo();
  // Group ke saare admins aur jisne ye bot connect kiya hai wo (group admin na ho tab bhi) use kar sakte hain.
  // Tag karne ke liye bot ka admin hona zaruri nahi.
  if (!m.isAdmin && !m.isFromMe && !m.isfromMe) return m.send("*Only group admins or the bot owner can use the .tagall command.*");
  const md = await m.conn.groupMetadata(m.from);
  const participants = md?.participants || [];
  if (!participants.length) return m.sendreply("❌ No members found in this group.");
  const admins = participants.filter(p=>p.admin === "admin" || p.admin === "superadmin");
  const others = participants.filter(p=>!admins.includes(p));
  const msgText = String(text || "ATTENTION EVERYONE").trim();
  let tagText = `*▢ GROUP : ${md.subject || "Unknown Group"}*\n*▢ MEMBERS : ${participants.length}*\n*▢ MESSAGE : ${msgText}*\n\n╭┈─「 ɦเ αℓℓ ƒɾเεɳ∂ร 🥰 」┈❍\n`;
  for (const p of others) { const jid=p?.id||p?.jid; if(jid) tagText += `│${getEmoji()} ᩧ𝆺ྀི𝅥 @${jid.split("@")[0]}\n`; }
  for (const p of admins) { const jid=p?.id||p?.jid; if(jid) tagText += `│👑 @${jid.split("@")[0]}\n`; }
  tagText += `╰────────────❍`;
  const mentions = participants.map(p=>p?.id||p?.jid).filter(Boolean);
  const video = fs.existsSync(TAGALL_VIDEO) ? fs.readFileSync(TAGALL_VIDEO) : null;
  if (video) await m.conn.sendMessage(m.from,{video, mimetype:"video/mp4", caption:tagText, mentions},{quoted:m.raw});
  else await m.conn.sendMessage(m.from,{text:tagText,mentions},{quoted:m.raw});
});
