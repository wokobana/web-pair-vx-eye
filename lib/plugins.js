// commands/ folder ki saari files auto-load hoti hain.
// Ek optional command file fail ho to baaki commands phir bhi load hon.
const fs = require('fs');
const path = require('path');

const registry = new Map();
const list = [];

function load() {
  if (list.length) return;
  const dir = path.join(__dirname, '..', 'commands');

  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
    try {
      const loaded = require(path.join(dir, f));
      for (const c of [].concat(loaded || [])) {
        if (!c?.name || typeof c.run !== 'function') continue;
        if (registry.has(c.name)) console.warn(`[plugin] duplicate command: ${c.name} (${f})`);
        list.push(c);
        registry.set(c.name, c);
        (c.aliases || []).forEach((a) => registry.set(a, c));
      }
    } catch (e) {
      console.error(`[plugin] ${f} load failed:`, e.message);
    }
  }
}

// Bahar se (VX bridge) command jodna. override=true: same naam/alias par naya command purane ko hata deta hai.
function register(c, { override = true } = {}) {
  const keys = [c.name, ...(c.aliases || [])];
  for (const k of keys) {
    const old = registry.get(k);
    if (!old || old === c) continue;
    if (!override) return false;
    if (old.name === k) {                       // purana command poora hata do
      const i = list.indexOf(old);
      if (i >= 0) list.splice(i, 1);
      for (const key of [old.name, ...(old.aliases || [])]) if (registry.get(key) === old) registry.delete(key);
    } else {
      registry.delete(k);                       // sirf alias chhino
    }
  }
  list.push(c);
  for (const k of keys) registry.set(k, c);
  return true;
}

module.exports = { load, list, register, get: (n) => registry.get(n) };
