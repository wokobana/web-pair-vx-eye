// ============================================================================
//  VX -> Miku bridge
//  VX-MD ke plugins (plugins/ folder) Miku ke andar bina badle chalte hain.
//  Miku ka handler (lib/handier.js) message ko yahin se VX plugin tak pahunchata hai.
// ============================================================================
import path from "path";
import { fileURLToPath } from "url";
import Serializer from "./lib/serialize.js";
import { forceLoadPlugins, ensurePlugins } from "./lib/plugins.js";
import { withLegacySocket } from "./lib/miku-legacy.js";
import { db } from "./lib/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let snap = null;

export async function init() {
  await db.ready();
  await forceLoadPlugins(path.join(__dirname, "plugins"));
  snap = ensurePlugins();
  return snap;
}

const botNum = (sock) => String(sock?.user?.id || "bot").split("@")[0].split(":")[0].replace(/\D/g, "") || "bot";

// VX jaisa message object (MsgWrapper) — Miku ke raw Baileys message se
export async function makeMsg(sock, raw, x, { loadGroup = true } = {}) {
  withLegacySocket(sock);
  const msg = new Serializer(sock, botNum(sock)).serializeSync(raw);
  msg.isOwner = Boolean(x?.isOwner);
  if (msg.isGroup && loadGroup) {
    try { await msg.loadGroupInfo(); } catch (e) { console.error("[vx] loadGroupInfo:", e?.message || e); }
    if (x?.isAdmin) msg.isAdmin = true;
    if (x?.isBotAdmin) msg.isBotAdmin = true;
  }
  return msg;
}

export const commandPlugins = () => (snap ? [...new Set(snap.commands.values())] : []);
export const textPlugins = () => snap?.text || [];
export const messagePlugins = () => snap?.message || [];

// Miku ke baaki (VX me na milne wale) commands ko VX menu me dikhane ke liye registry me daalo
export async function registerMenuStubs(list) {
  const { Module } = await import("./lib/plugins.js");
  for (const c of list) {
    Module({ command: c.name, aliases: c.aliases || [], package: c.vxPackage || "general", description: c.desc || "", __mikuStub: true })(async () => {});
  }
  snap = ensurePlugins();
}

// group join/leave/promote/demote -> VX welcome/goodbye handler
export async function onParticipants(sock, event) {
  try {
    let md = {};
    try { md = await sock.groupMetadata(event.id); } catch {}
    // LID group me participant object {id:'..@lid', phoneNumber:'91..@s.whatsapp.net'} aata hai — asli number wala JID pehle lo
    const pnOf = (p) => {
      if (typeof p === "string") return p;
      const pn = p?.phoneNumber || (p?.jid && !String(p.jid).endsWith("@lid") ? p.jid : "");
      return pn || p?.id || p?.jid || p?.lid || "";
    };
    const participants = (event.participants || []).map(pnOf).filter(Boolean);
    const enriched = {
      ...event, id: event.id, participants, groupMetadata: md, groupName: md.subject || "",
      groupSize: Array.isArray(md.participants) ? md.participants.length : 0,
      action: event.action || "", sessionId: botNum(sock),
    };
    withLegacySocket(sock);
    const all = snap?.all || [];
    await Promise.allSettled(all.filter((p) => p?.on === "group-participants.update" && typeof p.exec === "function").map((p) => p.exec(null, enriched, sock)));
  } catch (e) { console.error("[vx] participants:", e?.message || e); }
}

// Per-connected-bot mode shared with the VX menu and .mode command.
export function isPublicMode(sessionId) {
  return db.get(String(sessionId || "bot"), "mode", true) === true;
}
