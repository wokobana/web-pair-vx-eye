// Sessions ka start / reconnect / logout
const { DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { createSocket, SESS_DIR } = require('./createSocket');

fs.mkdirSync(SESS_DIR, { recursive: true });
const active = new Map();
const connected = new Set();      // sirf wahi numbers jo sach me 'open' hain
const retired = new WeakSet();    // jaan-bujhkar band kiye gaye sockets (inke close event se kuch delete nahi hoga)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dirOf = (n) => path.join(SESS_DIR, n);

const starting = new Set();      // jis number ka pairing abhi ban raha hai (do socket ek hi folder par na chalen)
const pairTimers = new Map();    // number -> pairing expiry timer

async function startSession(number, opts = {}) {
  // Same number par do /pair ek saath aaye (group me aksar hota hai) to dusra socket pehle wale ka folder bigaad deta tha
  // => code "Couldn't link device" deta tha. Ab ek hi baar me ek pairing.
  if (opts.onCode && starting.has(number)) throw new Error('PAIR_BUSY');
  if (opts.onCode) starting.add(number);

  let sockRef;
  let opened = false;
  let stateRef = null;
  let markReady; const ready = new Promise((r) => { markReady = r; });
  // Pairing complete = creds.registered YA creds.me (pair-success ke baad 'me' turant set ho jata hai)
  const isPaired = () => !!(stateRef?.creds?.registered || stateRef?.creds?.me);

  try {
    const { sock, state } = await createSocket(number, async (u) => {
      const { connection, lastDisconnect } = u;
      if (connection === 'connecting' || u.qr) markReady();
      if (connection === 'open') {
        markReady();
        if (retired.has(sockRef)) return;
        connected.add(number);
        clearTimeout(pairTimers.get(number)); pairTimers.delete(number);
        starting.delete(number);
        console.log(`[+] ${number} connected`);
        if (opts.onOpen && !opened) { opened = true; try { await opts.onOpen(); } catch (e) { console.error('onOpen:', e?.message || e); } }
      }
      if (connection !== 'close') return;
      markReady();
      if (retired.has(sockRef)) return;
      if (active.get(number) === sockRef) connected.delete(number);

      const status = lastDisconnect?.error?.output?.statusCode;
      if (active.get(number) === sockRef) active.delete(number);
      if (status === DisconnectReason.loggedOut) { starting.delete(number); return fs.rmSync(dirOf(number), { recursive: true, force: true }); }
      if (status === DisconnectReason.connectionReplaced) { starting.delete(number); return; }

      if (isPaired()) {
        // pairing ke baad WhatsApp restart maangta hai (515) — folder bilkul mat hatao, wahi creds se wapas judo
        setTimeout(() => startSession(number, opts.onOpen && !opened ? { onOpen: opts.onOpen } : {}).catch((e) => console.error(number, e.message)), 2000);
      } else {
        // pairing complete nahi hui (code expire / connection toot gaya)
        starting.delete(number);
        clearTimeout(pairTimers.get(number)); pairTimers.delete(number);
        fs.rmSync(dirOf(number), { recursive: true, force: true });
        if (opts.onFail && !opened) { try { opts.onFail(status); } catch {} }
      }
    });
    sockRef = sock;
    stateRef = state;
    active.set(number, sock);

    if (!isPaired() && opts.onCode) {
      // Socket WhatsApp se sach me jud jaye tab hi code maango (fixed sleep se code kabhi kabhi invalid ban jata tha)
      await Promise.race([ready, sleep(12000)]);
      await sleep(1500);
      let raw, lastErr;
      for (let i = 0; i < 3 && !raw; i++) {
        try { raw = await sock.requestPairingCode(number); }
        catch (e) { lastErr = e; console.error(`[pair] ${number}: code try ${i + 1} fail: ${e?.message || e}`); await sleep(2500); }
      }
      if (!raw) throw lastErr || new Error('pairing code nahi bana');
      console.log(`[pair] ${number}: code ban gaya`);
      // Code ~3 min tak chalta hai; usse zyada atka rahe to socket band karke folder saaf
      clearTimeout(pairTimers.get(number));
      pairTimers.set(number, setTimeout(() => {
        pairTimers.delete(number);
        if (active.get(number) === sock && !isPaired()) { console.log(`[pair] ${number}: code expire, session hata diya`); dropSession(number); }
      }, 4 * 60 * 1000));
      opts.onCode(raw?.match(/.{1,4}/g)?.join('-') || raw);
    }
    return sock;
  } catch (e) {
    starting.delete(number);
    throw e;
  }
}

function dropSession(number) {
  starting.delete(number);
  clearTimeout(pairTimers.get(number)); pairTimers.delete(number);
  const s = active.get(number);
  if (s) retired.add(s);
  active.delete(number);
  connected.delete(number);
  try { s?.end(undefined); } catch {}
  fs.rmSync(dirOf(number), { recursive: true, force: true });
}

async function logoutSession(number) {
  starting.delete(number);
  clearTimeout(pairTimers.get(number)); pairTimers.delete(number);
  const s = active.get(number);
  if (s) retired.add(s);
  try { await s?.logout(); } catch {}
  active.delete(number);
  connected.delete(number);
  fs.rmSync(dirOf(number), { recursive: true, force: true });
}

async function restoreAll() {
  for (const num of fs.readdirSync(SESS_DIR)) {
    try { await startSession(num); } catch (e) { console.error('restore', num, e.message); }
  }
}

// Sach me connected? (pending/atke hue pairing socket ko 'connected' nahi maanenge)
function isConnected(n) {
  const s = active.get(n);
  return !!s && connected.has(n) && s.ws?.isOpen !== false;
}

module.exports = { startSession, dropSession, logoutSession, restoreAll, isConnected, isActive: (n) => active.has(n), activeCount: () => active.size };
