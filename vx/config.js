// Miku config.js (CJS) se VX plugins ke liye config — sirf yahin se values aati hain.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const m = require("../config.js");
const ownerNum = String((m.ownerNumber || [])[0] || "").replace(/\D/g, "");
export default {
  prefix: m.prefix || ".",
  owner: ownerNum,
  sudo: ownerNum,
  packname: m.botName || "bot",
  author: m.botName || "bot",
  bot: { name: m.botName || "bot" },
  saluran: { id: m.channelJid || "", name: m.channelName || m.botName || "" },
  timezone: m.timezone || "Asia/Kolkata",
  WORK_TYPE: "public",
  maxFileSize: 100 * 1024 * 1024,
};
