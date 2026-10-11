import { AsyncLocalStorage } from "node:async_hooks";
import { db as mikuDb } from "./client.js";
import config from "../config.js";
import fs from "fs";
import path from "path";

const storage = new AsyncLocalStorage();

function currentMessage() { return storage.getStore()?.message || null; }
function botNumberOf(m) {
  return String(m?.botnum || m?.conn?.user?.id || "bot").split("@")[0].split(":")[0].replace(/\D/g, "") || "bot";
}
function groupKey(chat) { return `group:${chat}`; }
function settingKey(key) { return `setting:${key}`; }
function clone(v) { try { return v === undefined ? v : JSON.parse(JSON.stringify(v)); } catch { return v; } }

function makeDbFor(message) {
  const m = message || currentMessage();
  const sid = botNumberOf(m);
  return {
    getGroup(chat) { return clone(mikuDb.get(sid, groupKey(chat), {})) || {}; },
    setGroup(chat, changes={}) { const old=clone(mikuDb.get(sid,groupKey(chat),{}))||{}; const next={...old,...(changes||{})}; mikuDb.set(sid,groupKey(chat),next); return next; },
    setting(key,value) { const k=settingKey(key); if(arguments.length>1){mikuDb.set(sid,k,value); return value;} return mikuDb.get(sid,k,undefined); },
    get(key,fallback) { return mikuDb.get(sid,String(key),fallback); },
    set(key,value) { return mikuDb.set(sid,String(key),value); },
    async getAsync(session,key,fallback=undefined) { const useSid=String(session||sid).split("@")[0].split(":")[0].replace(/\D/g,"")||sid; return clone(mikuDb.get(useSid,String(key),fallback)); },
    async setAsync(session,key,value) { const useSid=String(session||sid).split("@")[0].split(":")[0].replace(/\D/g,"")||sid; return mikuDb.set(useSid,String(key),value); },
    async save() { if(typeof mikuDb.flush === "function") return mikuDb.flush(); }
  };
}
export function getDatabase(message){ return makeDbFor(message); }
export function runLegacyContext(message,fn){ return storage.run({message},fn); }

export function makeLegacyMessage(m,args="",commandName="") {
  const text=String(args||"").trim(); const lm=m;
  lm.chat=m.from||m.chat||m.key?.remoteJid||""; lm.m=lm; lm.mek=m.raw||m.mek;
  lm.args=text?text.split(/\s+/):[]; lm.text=text; lm.fullArgs=text; lm.prefix=config.prefix||".";
  lm.command=commandName||String(m.body||"").replace(/^\./,"").trim().split(/\s+/)[0].toLowerCase();
  lm.isOwner=Boolean(m.isOwner||m.isFromMe||m.fromMe||String(m.sender||"").split("@")[0]===String(config.owner||"").replace(/\D/g,"")||String(m.sender||"").split("@")[0]===String(config.sudo||"").replace(/\D/g,""));
  lm.isPremium=Boolean(m.isPremium); lm.isPartner=Boolean(m.isPartner); lm.isBotAdmin=Boolean(m.isBotAdmin); lm.isAdmin=Boolean(m.isAdmin);
  lm.mentionedJid=m.mentions||[]; lm.participants=m.groupParticipants||[]; lm.groupMetadata=m.groupMetadata||null; lm.msg=m.content||m.msg||{}; lm.message=m.raw||m.message||null;
  lm.isMedia=Boolean(m.isImage||m.isVideo||m.isAudio); lm.ptt=Boolean(m.content?.ptt||m.ptt); lm.mimetype=m.content?.mimetype||m.mimetype||"";
  lm.isImage=m.type==="imageMessage"||Boolean(m.isImage); lm.isVideo=m.type==="videoMessage"||Boolean(m.isVideo); lm.isAudio=m.type==="audioMessage"||Boolean(m.isAudio);
  lm.download=m.download?.bind(m)||(async()=>null); lm.reply=m.reply.bind(m); lm.send=m.send?.bind(m)||m.reply.bind(m); lm.sendreply=m.sendreply?.bind(m)||m.reply.bind(m); lm.react=m.react?.bind(m)||(()=>{});
  if(m.quoted){ const q=m.quoted; q.isImage=q.type==="imageMessage"||/^image\//i.test(q.msg?.mimetype||""); q.isVideo=q.type==="videoMessage"||/^video\//i.test(q.msg?.mimetype||""); q.isAudio=q.type==="audioMessage"||/^audio\//i.test(q.msg?.mimetype||""); q.isMedia=Boolean(q.isImage||q.isVideo||q.isAudio); q.mimetype=q.msg?.mimetype||""; q.sender=q.participant||q.sender; }
  return lm;
}

export function withLegacySocket(sock){
  if(!sock||sock.__mikuLegacyCompat) return sock;
  Object.defineProperty(sock,"__mikuLegacyCompat",{value:true});
  if(typeof sock.sendMedia!=="function") sock.sendMedia=async(jid,media,caption="",quoted=null,options={})=>{ const type=options.type||"image"; const payload=type==="video"?{video:media}:type==="audio"?{audio:media}:{image:media}; payload.caption=caption||""; if(options.mimetype) payload.mimetype=options.mimetype; if(options.mentions) payload.mentions=options.mentions; return sock.sendMessage(jid,payload,{quoted:quoted||undefined}); };
  if(typeof sock.sendText!=="function") sock.sendText=async(jid,text,quoted=null,options={})=>sock.sendMessage(jid,{text:String(text||""),...(options.mentions?{mentions:options.mentions}:{}),...(options.contextInfo?{contextInfo:options.contextInfo}:{})},{quoted:quoted||undefined});
  if(typeof sock.sendPreview!=="function") sock.sendPreview=async(jid,data={},options={})=>{ const payload=data.image?{image:data.image,caption:data.caption||""}:{text:data.caption||data.description||data.title||data.url||""}; if(data.url&&!payload.caption) payload.caption=data.url; if(options.contextInfo) payload.contextInfo=options.contextInfo; if(options.mentions) payload.mentions=options.mentions; return sock.sendMessage(jid,payload,{quoted:options.quoted||undefined}); };
  return sock;
}

export function getLegacyAssetBuffer(key){
  const candidates={
    "anita-baileys":[path.join(process.cwd(),"media","menu.jpg"),path.join(process.cwd(),"plugins","bin","menu.jpg")],
    "anita2":[path.join(process.cwd(),"media","menu.jpg"),path.join(process.cwd(),"plugins","bin","menu.jpg")],
    "ourin4-mp4":[path.join(process.cwd(),"assets","video","ourin4-mp4.mp4"),path.join(process.cwd(),"media","welcome.mp4")],
    "ourin1-mp4":[path.join(process.cwd(),"assets","video","ourin1-mp4.mp4"),path.join(process.cwd(),"media","welcome.mp4")],
    "ourin2-mp4":[path.join(process.cwd(),"assets","video","ourin2-mp4.mp4")],
    "ourin3-mp4":[path.join(process.cwd(),"assets","video","ourin3-mp4.mp4")],
    "anita-mp4":[path.join(process.cwd(),"assets","video","anita-mp4.mp4")]
  }[key]||[];
  for(const file of candidates){try{if(fs.existsSync(file)) return fs.readFileSync(file);}catch{}} return null;
}
export const getAssetBuffer=getLegacyAssetBuffer;
export function te(_prefix,command,_pushName){return `❌ *Terjadi kesalahan saat menjalankan* \`.${command||"command"}\`.`;}
export function saluranCtx(){return {isForwarded:true,forwardingScore:9};}
export function findParticipantByNumber(participants=[],jid=""){const num=String(jid).split("@")[0].replace(/\D/g,""); return (participants||[]).find(p=>[p?.id,p?.jid,p?.lid,p?.phoneNumber,p?.participantPn].filter(Boolean).map(x=>String(x).split("@")[0].replace(/\D/g,"")).includes(num))||null;}
export function getParticipantJid(p){return p?.id||p?.jid||p?.lid||p?.phoneNumber||"";}
export default te;
