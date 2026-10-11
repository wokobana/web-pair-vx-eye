import { Module } from "../lib/plugins.js";
import { antistickerCommand, handleAntiSticker, isAntiStickerOn } from "../lib/xaf-antisticker.js";
Module({command:'antisticker',package:'group',description:'Delete stickers automatically'})(async(m)=>antistickerCommand(m.conn,m.from,m.raw));
Module({on:'message',name:'anti-sticker-protection',package:'protection',description:'Anti sticker handler'})(async(m)=>{if(m.type!=='stickerMessage')return;await handleAntiSticker(m.conn,m.raw);});
export { isAntiStickerOn };
