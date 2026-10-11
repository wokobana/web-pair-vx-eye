// Ek WhatsApp socket banata hai aur saare features attach karta hai
const {
  default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const config = require('../config');
const db = require('./db');
const handier = require('./handier');
const groupEvents = require('./groupEvents');
const scheduler = require('./miku-scheduler');
const autoreact = require('./autoreact');
const { primeMeta, getCachedMeta } = require('./serialize');
const msgStore = require('./msgStore');
const { channelCtx } = require('./common');

const SESS_DIR = path.join(__dirname, '..', 'sessions');

async function createSocket(number, onUpdate) {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(SESS_DIR, number));
  const { version } = await fetchLatestBaileysVersion();
  if (!state.creds.registered) db.setG(number, 'welcomed', false);   // naya link: connect message dobara jaye

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    // Link hote hi chat-history sync band: iske wajah se events 1-2 minute buffer me atke rehte the (menu late aata tha).
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    // "Waiting for this message" fix: retry aane par bot wahi message dobara bhej sake
    getMessage: async (key) => msgStore.get(key),
    msgRetryCounterCache: msgStore.counterCache(),
    // Group me bhejte waqt har baar metadata fetch nahi hoga => menu/replies tez
    cachedGroupMetadata: async (jid) => getCachedMeta(number, jid),
    defaultQueryTimeoutMs: 60000,
    generateHighQualityLinkPreview: false,
  });

  // Har message (bheja hua + aaya hua) cache me rakho
  sock.ev.on('messages.upsert', ({ messages }) => { for (const m of messages) msgStore.put(m); });

  sock.ev.on('creds.update', saveCreds);
  handier(sock, number);
  groupEvents(sock, number);
  const timer = scheduler.start(sock, number);

  // Anti-call
  sock.ev.on('call', async (calls) => {
    const mode = db.getG(number, 'anticall', 'off');
    if (mode === 'off') return;
    for (const c of calls) {
      if (c.status !== 'offer') continue;
      try {
        await sock.rejectCall(c.id, c.from);
        await sock.sendMessage(c.from, { text: '📵 Calls allowed nahi hain, message karo.' });
        if (mode === 'block') await sock.updateBlockStatus(c.from, 'block');
      } catch {}
    }
  });

  sock.ev.on('connection.update', async (u) => {
    if (u.connection) console.log(`[conn] ${number}: ${u.connection}${u.lastDisconnect?.error ? ' | ' + (u.lastDisconnect.error.output?.statusCode || '') + ' ' + u.lastDisconnect.error.message : ''}`);
    if (u.connection === 'close') clearInterval(timer);
    if (u.connection === 'open') {
      autoreact.followChannel(sock, number);
      sock.groupFetchAllParticipating().then((g) => primeMeta(number, g)).catch(() => {});
      if (!db.getG(number, 'welcomed', false)) {
        const ui = require('./ui');
        const owners = (config.connectOwners?.length ? config.connectOwners : config.ownerNumber).filter(Boolean);
        const caption =
          `✅ *${config.botName}* *সফলভাবে কানেক্ট হয়েছে!*\n\n` +
          `🙏 *আপনার বট কানেক্ট করার জন্য অনেক অনেক ধন্যবাদ!*\n` +
          `📌 *কমান্ড দেখতে লিখুন:* *${config.prefix}menu*\n\n` +
          `❓ *বট ব্যবহার করতে কোনো সমস্যা হলে নিচের Owner-দের মেসেজ করুন:*\n` +
          owners.map((n, i) => `👑 Owner ${i + 1}: wa.me/${String(n).replace(/\D/g, '')}`).join('\n') +
          `\n\n${ui.footerText()}`;
        const to = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const img = config.connectImage || ui.dpUrl();
        const done = () => { db.setG(number, 'welcomed', true); console.log(`[welcome] ${number}: connect message bhej diya`); };
        const fail = (e) => console.error(`[welcome] ${number}: send fail:`, e?.message || e);
        sock.sendMessage(to, { image: { url: img }, caption, contextInfo: channelCtx() })
          .then(done)
          .catch(() => sock.sendMessage(to, { text: caption, contextInfo: channelCtx() }).then(done).catch(fail));
      }
    }
    onUpdate && onUpdate(u, state);
  });

  return { sock, state };
}

module.exports = { createSocket, SESS_DIR };
