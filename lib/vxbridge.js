// VX-MD ke plugins ko Miku ke andar chalane wala bridge (CJS side).
// Asli kaam vx/bridge.js (ESM) karta hai; yahan sirf Miku ke commands me jodte hain.
const plugins = require('./plugins');
const config = require('../config');

let B = null;
let startPromise = null;

// Miku ke category -> VX menu package
const PKG = { general: 'general', group: 'group', protect: 'group', media: 'downloader', fun: 'fun', status: 'group', owner: 'owner' };
// Jo naam VX me nahi the par Miku me chalte the (menu/list wale)
// song.js sirf play.js ke helper ke liye chahiye — .song command Miku ka hi rahega (aapne song nahi manga)
const SKIP = new Set(['song']);
const EXTRA_ALIASES = { menu: ['help'], alive: ['uptime', 'runtime'] };

async function runVx(p, x) {
  if (!B) throw new Error('VX bridge abhi load ho raha hai, thodi der baad try karo');
  const msg = await B.makeMsg(x.sock, x.m, x, { loadGroup: false });
  await p.exec(msg, x.rest || '');
}

async function start() {
  if (startPromise) return startPromise;
  startPromise = (async () => {
  try {
    B = await import('../vx/bridge.js');
    await B.init();

    for (const p of B.commandPlugins()) {
      if (!p?.command || p.__mikuStub || SKIP.has(p.command)) continue;
      const aliases = [...new Set([...(p.aliases || []), ...(EXTRA_ALIASES[p.command] || [])])].filter((a) => a && a !== p.command);
      plugins.register({
        name: p.command, aliases, category: p.package || 'general', desc: p.description || '',
        vx: true, run: (x) => runVx(p, x),
      }, { override: true });
    }

    // Miku ke bache hue commands VX menu me bhi dikhen
    const stubs = plugins.list.filter((c) => !c.vx).map((c) => ({
      name: c.name,
      aliases: (c.aliases || []).filter((a) => plugins.get(a) === c),
      desc: c.desc, vxPackage: PKG[c.category] || 'general',
    }));
    await B.registerMenuStubs(stubs);
    console.log(`[vx] ✅ ${B.commandPlugins().length} VX commands Miku me load | Miku commands: ${plugins.list.length}`);
  } catch (e) {
    console.error('[vx] bridge start failed:', e?.stack || e?.message || e);
  }
  })();
  return startPromise;
}

// antilink / antisticker jaise "on: text|message" plugins — har message par
async function runPassive(x) {
  if (!B) return;
  const txt = B.textPlugins(), msgs = B.messagePlugins();
  if (!txt.length && !msgs.length) return;
  let msg;
  try { msg = await B.makeMsg(x.sock, x.m, x, { loadGroup: false }); } catch (e) { return; }
  const jobs = [];
  if (msg.body) for (const p of txt) jobs.push(p);
  for (const p of msgs) jobs.push(p);
  await Promise.allSettled(jobs.map((p) => Promise.resolve().then(() => p.exec(msg)).catch((e) => console.error('[vx] passive:', e?.message || e))));
}

async function onParticipants(sock, event) {
  if (!B) return;
  return B.onParticipants(sock, event);
}

// Shared global mode from the exact same VX database used by `.mode`.
// Fail closed if VX has not initialized or the mode reader is unavailable.
function isPublicMode(sessionId) {
  try {
    if (!B || typeof B.isPublicMode !== 'function') return false;
    return B.isPublicMode(String(sessionId || 'bot')) === true;
  } catch (e) {
    console.error('[mode] could not read mode; treating bot as private:', e?.message || e);
    return false;
  }
}

module.exports = { start, runPassive, onParticipants, ready: () => !!B, isPublicMode };
