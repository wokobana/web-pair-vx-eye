const { fetchJson } = require('./common');

const GIF_CATS = [
  'kiss', 'hug', 'pat', 'slap', 'cuddle', 'cry', 'smile', 'wave',
  'dance', 'bonk', 'wink', 'highfive', 'handhold', 'poke', 'bite',
  'blush', 'happy'
];

async function fetchGif(cat) {
  const c = String(cat || '').toLowerCase();
  let last;

  // Primary API
  try {
    const j = await fetchJson(`https://api.waifu.pics/sfw/${encodeURIComponent(c)}`, {}, { retries: 1 });
    if (j?.url) return j.url;
  } catch (e) { last = e; }

  // Fallback API 1.
  try {
    const j = await fetchJson(`https://nekos.best/api/v2/${encodeURIComponent(c)}`, {}, { retries: 1 });
    const url = j?.results?.[0]?.url;
    if (url) return url;
  } catch (e) { last = e; }

  // Fallback API 2. Different provider, useful when the first two are down.
  try {
    const j = await fetchJson(`https://api.otakugifs.xyz/gif?reaction=${encodeURIComponent(c)}`, {}, { retries: 1 });
    if (j?.url) return j.url;
  } catch (e) { last = e; }

  throw new Error(`GIF API unavailable${last?.message ? `: ${last.message}` : ''}`);
}

module.exports = { fetchGif, GIF_CATS };
