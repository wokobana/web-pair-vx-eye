const config = require('./config');
const { loadBaileys } = require('./lib/baileysLoader');

process.on('uncaughtException', (e) => console.error('uncaughtException:', e.message));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e));

(async () => {
  // Sabse pehle Baileys load + version check (baaki saari files iske baad load hoti hain)
  const b = await loadBaileys();
  console.log(`📦 Baileys ${b.version || '?'} | Node ${process.version}`);
  if (!b.groupStatus) {
    console.error(`⚠️  Ye Baileys version group status (.swgc/.gcstatus) support nahi karta.\n    Fix: ${b.fix}   (Node 20+ chahiye)`);
  }

  require('./telegram');                                   // Telegram public pairing
  const { restoreAll } = require('./lib/sessionManager');

  console.log(`🚀 ${config.botName} start ho gaya (owner: ${config.ownerName})`);
  restoreAll();                                            // purane connected numbers wapas chalao
  require('./lib/mediaDownload').ensureYtDlp().catch((e) => console.error('[yt-dlp]', e.message));   // song/video ke liye yt-dlp (background)
})().catch((e) => {
  console.error('❌ Start nahi ho paya:', e.message);
  process.exit(1);
});
