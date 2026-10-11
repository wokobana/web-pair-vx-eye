// Baileys ko safely load karta hai (purana CommonJS 6.x ho ya naya ESM 7.x) aur batata hai
// ki group-status (groupStatusMessageV2) support hai ya nahi.
//
// Group status ke liye Baileys 7.x chahiye. package.json me pehle "^6.7.9" tha, jo hamesha 6.x hi
// install karta hai (6.x me groupStatusMessageV2 hai hi nahi) -> ".swgc" par
// "Group status build nahi hua" error aata tha.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const PKG = '@whiskeysockets/baileys';
const FIX = 'npm install @whiskeysockets/baileys@7.0.0-rc14';

function installedVersion() {
  const candidates = [
    path.join(__dirname, '..', 'node_modules', PKG, 'package.json'),
    path.join(process.cwd(), 'node_modules', PKG, 'package.json'),
  ];
  for (const f of candidates) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')).version; } catch {}
  }
  return null;
}

function supportsGroupStatus(mod) {
  try {
    const proto = mod.proto || mod.default?.proto;
    const m = proto.Message.fromObject({ groupStatusMessageV2: { message: { conversation: 'x' } } });
    return !!m.groupStatusMessageV2;
  } catch { return false; }
}

let cached = null;

async function loadBaileys() {
  if (cached) return cached;
  let mod;
  try {
    mod = require(PKG);                       // CommonJS 6.x ya (naya Node par) ESM 7.x
  } catch (e) {
    // ESM-only package: require() ERR_REQUIRE_ESM / ERR_REQUIRE_ASYNC_MODULE / ERR_PACKAGE_PATH_NOT_EXPORTED deta hai
    if (!/ERR_REQUIRE|ERR_PACKAGE_PATH_NOT_EXPORTED/.test(e?.code || '')) {
      if (e?.code === 'MODULE_NOT_FOUND') throw new Error(`Baileys install nahi hai. Chalao: npm install`);
      throw e;
    }
    // Purana Node + ESM-only Baileys: import() se load karke baaki files ke require() ko wahi de do
    mod = await import(PKG);
    const orig = Module._load;
    Module._load = function (request, parent, isMain) {
      return request === PKG ? mod : orig.call(this, request, parent, isMain);
    };
  }
  cached = { version: installedVersion(), groupStatus: supportsGroupStatus(mod), fix: FIX };
  return cached;
}

const info = () => cached || { version: installedVersion(), groupStatus: null, fix: FIX };

module.exports = { loadBaileys, info, FIX };
