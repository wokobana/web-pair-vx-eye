// Sent/received messages ka chhota cache.
// Baileys ko "getMessage" chahiye: jab phone kisi message ko decrypt na kar paaye (retry request),
// bot wahi message dobara bhej sake. Isse pehle ye nahi tha, isliye menu/reply par
// "Waiting for this message. This may take a while." dikhta tha aur 2-3 minute baad aata tha.
const MAX = 5000;
const store = new Map();

function put(m) {
  const id = m?.key?.id;
  if (!id || !m.message) return;
  store.set(id, m.message);
  if (store.size > MAX) store.delete(store.keys().next().value);
}

const get = (key) => store.get(key?.id);

// Baileys ka retry-counter cache (node-cache jaisa interface, extra package nahi chahiye)
function counterCache() {
  const c = new Map();
  return {
    get: (k) => c.get(k),
    set: (k, v) => { c.set(k, v); if (c.size > 3000) c.delete(c.keys().next().value); },
    del: (k) => c.delete(k),
    flushAll: () => c.clear(),
  };
}

module.exports = { put, get, counterCache };
