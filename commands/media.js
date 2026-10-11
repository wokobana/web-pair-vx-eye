// Music / downloaders / tools / fun
const config = require('../config');
const { fetchJson, fetchBuffer, fetchText, channelCtx } = require('../lib/common');
const { fetchGif, GIF_CATS } = require('../lib/fetchGif');
const { convert, STYLES } = require('../lib/textfonts');
const { isUrl } = require('../lib/UrlUtil');
const ui = require('../lib/ui');
const fs = require('fs');
const { ytDlpDownload, friendlyError, cookiesFile } = require('../lib/mediaDownload');

const lazy = (n) => { let m; return () => (m ||= require(n)); };
const yts = lazy('yt-search'), ytdl = lazy('@distube/ytdl-core'), stickerLib = lazy('wa-sticker-formatter'), sharp = lazy('sharp');

// ---------- YouTube helpers ----------
async function findVideos(q, limit = 8) {
  const text = String(q || '').trim();
  const m = text.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
  if (m) {
    const v = await yts()({ videoId: m[1] });
    return v ? [v] : [];
  }
  const r = await yts()(text);
  const videos = (r?.videos || []).filter((v) => v?.url);
  const normal = videos.filter((v) => Number(v.seconds) > 0 && Number(v.seconds) <= 1800);
  return [...normal, ...videos.filter((v) => !normal.includes(v))].slice(0, limit);
}


const YT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// cookies.txt (Netscape format) -> ytdl-core agent
function ytdlAgent() {
  try {
    const file = cookiesFile();
    if (!file) return null;
    const cookies = fs.readFileSync(file, 'utf8').split('\n')
      .filter((l) => l.trim() && (!l.startsWith('#') || l.startsWith('#HttpOnly_')))
      .map((l) => {
        const p = l.replace(/^#HttpOnly_/, '').split('\t');
        if (p.length < 7) return null;
        return { domain: p[0], path: p[2], secure: p[3] === 'TRUE', expirationDate: Number(p[4]) || undefined, name: p[5], value: p[6].trim() };
      })
      .filter(Boolean);
    return cookies.length ? ytdl().createAgent(cookies) : null;
  } catch { return null; }
}

const sniffMime = (buf, kind) => {
  if (buf.length > 12 && buf.slice(4, 8).toString() === 'ftyp') return kind === 'audio' ? 'audio/mp4' : 'video/mp4';
  if (buf.length > 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return kind === 'audio' ? 'audio/webm' : 'video/webm';
  return kind === 'audio' ? 'audio/mp4' : 'video/mp4';
};

// Fallback: @distube/ytdl-core
async function ytdlCore(url, kind) {
  if (!ytdl().validateURL(url)) throw new Error('Invalid YouTube URL');
  const agent = ytdlAgent();
  const attempts = kind === 'audio'
    ? [{ filter: 'audioonly', quality: 'highestaudio' }, { filter: 'audioonly', quality: 'highestaudio', playerClients: ['WEB'] }, { quality: '140', playerClients: ['ANDROID'] }]
    : [{ quality: '18' }, { quality: '18', playerClients: ['WEB'] }, { quality: '18', playerClients: ['ANDROID'] }, { quality: '18', playerClients: ['TVHTML5'] }];
  let last;
  for (const a of attempts) {
    try {
      const chunks = [];
      const stream = ytdl()(url, { highWaterMark: 1 << 25, requestOptions: { headers: YT_HEADERS }, ...(agent ? { agent } : {}), ...a });
      for await (const c of stream) chunks.push(c);
      if (chunks.length) { const buffer = Buffer.concat(chunks); return { buffer, mime: sniffMime(buffer, kind) }; }
    } catch (e) { last = e; }
  }
  throw last || new Error('YouTube ne media nahi diya');
}

// yt-dlp pehle (sabse reliable), phir ytdl-core. -> { buffer, mime }
async function getMedia(url, kind) {
  let first;
  try {
    const r = await ytDlpDownload(url, kind);
    if (r?.buffer?.length) return r;
  } catch (e) { first = e; }
  try {
    return await ytdlCore(url, kind);
  } catch (e) {
    const botCheck = [first, e].find((z) => /not a bot|sign in to confirm/i.test(z?.message || ''));
    throw botCheck || first || e;
  }
}

function toMp3(buf) {
  return new Promise((res) => {
    try {
      const p = require('child_process').spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-b:a', '128k', '-f', 'mp3', 'pipe:1']);
      const out = [];
      p.stdout.on('data', (d) => out.push(d));
      p.on('error', () => res(null));
      p.on('close', (c) => res(c === 0 && out.length ? Buffer.concat(out) : null));
      p.stdin.on('error', () => {});
      p.stdin.end(buf);
    } catch { res(null); }
  });
}
// Video ko WhatsApp-compatible MP4 (H.264 + AAC) me badlo (webm/mkv/av1 WhatsApp par play nahi hote)
function toMp4(buf) {
  return new Promise((res) => {
    const os = require('os'), path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-mp4-'));
    const inp = path.join(dir, 'in.bin'), out = path.join(dir, 'out.mp4');
    const clean = () => fs.rmSync(dir, { recursive: true, force: true });
    try {
      fs.writeFileSync(inp, buf);
      const p = require('child_process').spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', inp,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-vf', 'scale=-2:min(720\\,ih)',
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
      p.on('error', () => { clean(); res(null); });
      p.on('close', (c) => {
        try { const r = c === 0 && fs.existsSync(out) ? fs.readFileSync(out) : null; clean(); res(r); } catch { clean(); res(null); }
      });
    } catch { clean(); res(null); }
  });
}
const isMp4 = (buf) => buf.length > 12 && buf.slice(4, 8).toString() === 'ftyp';
const fmtViews = (n) => (Number(n) ? Number(n).toLocaleString('en-US') : '-');
// Play card: link / video ID / "uploaded" nahi — sirf title, channel, duration, views
const playCard = (v) =>
  `– ( YOUTUBE PLAY )\n──────────────────✧\n\n` +
  `🍉 *Title:* ${v.title}\n📺 *Channel:* ${v.author?.name || '-'}\n⏱️ *Duration:* ${v.timestamp || '-'}\n👁️ *Views:* ${fmtViews(v.views)}\n\n` +
  `❄️ *Select Download Format*`;
const card = (v) => `🎵 *${v.title}*\n👤 ${v.author?.name || '-'}\n⏱️ ${v.timestamp}\n👁️ ${v.views}\n🔗 ${v.url}`;

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;

const audioCmd = (name, desc, o = {}) => ({
  name, aliases: o.aliases, category: 'media', desc,
  run: async (x) => {
    if (!x.rest) return x.reply(`Use: ${x.prefix}${name} <song naam / youtube link>`);
    x.react('🔎');
    try {
      const candidates = await findVideos(x.rest, 8);
      if (!candidates.length) return x.reply('❌ Song nahi mila. Naam ya YouTube link dobara bhejo.');
      let chosen = null, raw = null, dl = null, last;
      for (const v of candidates) {
        try {
          if (Number(v.seconds) > 3600) continue;
          dl = await getMedia(v.url, 'audio');
          raw = dl.buffer;
          if (!raw?.length) throw new Error('Empty audio');
          chosen = v;
          break;
        } catch (e) { last = e; if (/not a bot|sign in to confirm/i.test(e?.message || '')) break; }
      }
      if (!chosen || !raw) throw last || new Error('Audio download failed');
      if (raw.length > MAX_AUDIO_BYTES) throw new Error('Audio file 16 MB se bada hai. Chhota/short version try karo.');

      const mp3 = await toMp3(raw);
      const audio = mp3 || raw;
      const mime = mp3 ? 'audio/mpeg' : (dl?.mime || 'audio/mp4');
      const ctx = o.channel ? { contextInfo: channelCtx() } : {};
      if (o.card) {
        try { await x.send({ image: { url: chosen.thumbnail }, caption: card(chosen), ...ctx }, { quoted: x.m }); } catch {}
      }
      if (o.doc) return x.send({
        document: audio,
        mimetype: mime,
        fileName: `${String(chosen.title || 'song').replace(/[\\/:*?"<>|]/g, '_')}.${mp3 ? 'mp3' : (/webm/.test(mime) ? 'webm' : 'm4a')}`,
        ...ctx,
      }, { quoted: x.m });
      return x.send({ audio, mimetype: mime, ptt: false, ...ctx }, { quoted: x.m });
    } catch (e) {
      console.error(`[${name}]`, e.message);
      return x.reply(`❌ ${name} failed: ${friendlyError(e)}`);
    }
  },
});

// ---------- Gif / sticker helpers ----------
function ffmpegWebp(buf, animated = true) {
  return new Promise((resolve) => {
    try {
      const args = animated
        ? ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vf', 'fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0', '-loop', '0', '-an', '-c:v', 'libwebp', '-q:v', '55', '-f', 'webp', 'pipe:1']
        : ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0', '-frames:v', '1', '-c:v', 'libwebp', '-q:v', '60', '-f', 'webp', 'pipe:1'];
      const p = require('child_process').spawn('ffmpeg', args);
      const out = [];
      p.stdout.on('data', (d) => out.push(d));
      p.on('error', () => resolve(null));
      p.on('close', (code) => resolve(code === 0 && out.length ? Buffer.concat(out) : null));
      p.stdin.on('error', () => {});
      p.stdin.end(buf);
    } catch { resolve(null); }
  });
}

async function makeSticker(buf, animated = true) {
  try {
    const { Sticker, StickerTypes } = stickerLib();
    return await new Sticker(buf, { pack: config.botName, author: config.ownerName, type: StickerTypes.FULL, quality: 60 }).toBuffer();
  } catch {}
  return ffmpegWebp(buf, animated);
}

async function sendGif(x, url, caption, mentions) {
  await x.send({ text: caption, mentions }, { quoted: x.m });
  const buf = await fetchBuffer(url);
  const out = await makeSticker(buf, true);
  if (out) return x.send({ sticker: out });
  // Last-resort: still deliver the source media instead of silently failing.
  return x.send({ image: buf });
}
const gifCmd = (name) => ({
  name, category: 'fun', desc: `${name} gif (tag/reply karo)`,
  run: async (x) => {
    try {
      const url = await fetchGif(name);
      const a = x.senderNum, b = x.target?.split('@')[0];
      await sendGif(x, url, `💞 @${a} → *${name}* → ${b ? '@' + b : 'sabko'}`, [x.sender, ...(x.target ? [x.target] : [])]);
    } catch (e) {
      console.error(`[${name}]`, e.message);
      x.reply(`❌ ${name} GIF abhi available nahi hai. Thodi der baad try karo.`);
    }
  },
});

const escXml = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const firstMedia = (o) => (JSON.stringify(o).match(/https?:[^"\\]+?\.(?:mp4|jpg|jpeg|png|webp)[^"\\]*/i) || [])[0];

async function catbox(buf, ext = 'bin') {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', new Blob([buf]), `file.${ext}`);
  const r = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd });
  const t = await r.text();
  if (!t.startsWith('http')) throw new Error(t.slice(0, 80));
  return t.trim();
}

module.exports = [
  // ===== Music =====
  { name: 'play', category: 'media', desc: 'Song naam se card + Audio/Video button',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}play <song naam / youtube link>`);
      x.react('🔎');
      try {
        const [v] = await findVideos(x.rest, 1);
        if (!v) return x.reply('❌ Song nahi mila. Naam ya YouTube link dobara bhejo.');
        const link = `https://youtu.be/${v.videoId || (v.url.match(/[\w-]{11}$/) || [])[0]}`;
        return ui.sendBtn(x.sock, x.jid, {
          image: v.thumbnail ? { url: v.thumbnail } : { url: ui.dpUrl() },
          text: playCard(v),
          footer: 'YOUTUBE',
          buttons: [{ id: `${x.prefix}song ${link}`, text: 'Audio' }, { id: `${x.prefix}video ${link}`, text: 'Video' }],
        }, { quoted: x.m });
      } catch (e) {
        console.error('[play]', e.message);
        return x.reply(`❌ play failed: ${friendlyError(e)}`);
      }
    } },
  audioCmd('song', 'Song audio bhejo', { aliases: ['music'] }),
  audioCmd('play3', 'Song card + file (mp3 document)', { card: true, doc: true }),
  audioCmd('playch', 'Song channel-forward style me', { card: true, channel: true }),
  audioCmd('ytmp3', 'YouTube link -> mp3 file', { doc: true, aliases: ['yta'] }),

  { name: 'video', aliases: ['ytmp4', 'ytv'], category: 'media', desc: 'YouTube video (naam/link)',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}video <naam / youtube link>`);
      x.react('🔎');
      try {
        const candidates = await findVideos(x.rest, 6);
        if (!candidates.length) return x.reply('❌ Video nahi mila.');
        let chosen = null, buf = null, last;
        for (const v of candidates) {
          try {
            if (Number(v.seconds) > 1800) continue;
            buf = (await getMedia(v.url, 'video')).buffer;
            if (!buf?.length) throw new Error('Empty video');
            chosen = v;
            break;
          } catch (e) { last = e; if (/not a bot|sign in to confirm/i.test(e?.message || '')) break; }
        }
        if (!chosen || !buf) throw last || new Error('Video download failed');
        if (buf.length > MAX_VIDEO_BYTES) throw new Error('Video 64 MB se bada hai. Chhota/short version try karo.');
        // WhatsApp sirf H.264/AAC MP4 chalata hai — baaki format ffmpeg se badlo
        let out = buf;
        if (!isMp4(buf)) { const conv = await toMp4(buf); if (conv?.length) out = conv; }
        const caption = `🎬 *${chosen.title}*`;
        try {
          await x.send({ video: out, caption, mimetype: 'video/mp4' }, { quoted: x.m });
        } catch (e) {
          console.error('[video send]', e.message);
          await x.send({ document: out, mimetype: 'video/mp4', fileName: `${String(chosen.title).replace(/[\\/:*?"<>|]/g, '_')}.mp4`, caption }, { quoted: x.m });
        }
      } catch (e) {
        console.error('[video]', e.message);
        x.reply(`❌ Video download failed: ${friendlyError(e)}`);
      }
    } },

  { name: 'yts', aliases: ['ytsearch'], category: 'media', desc: 'YouTube search',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}yts <naam>`);
      const r = (await yts()(x.rest)).videos.slice(0, 8);
      if (!r.length) return x.reply('❌ Kuch nahi mila.');
      x.reply('🔎 *YouTube Results*\n\n' + r.map((v, i) => `${i + 1}. *${v.title}*\n   ⏱️ ${v.timestamp} | 👁️ ${v.views}\n   ${v.url}`).join('\n\n'));
    } },

  { name: 'lyrics', category: 'media', desc: 'Song ke lyrics',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}lyrics <song naam>`);
      const r = (await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(x.rest)}`)).find((s) => s.plainLyrics);
      if (!r) return x.reply('❌ Lyrics nahi mile.');
      const text = `🎤 *${r.trackName}* — ${r.artistName}\n\n${r.plainLyrics}`;
      for (let i = 0; i < text.length && i < 8000; i += 3800) await x.reply(text.slice(i, i + 3800));
    } },

  { name: 'searchthatsong', aliases: ['findsong'], category: 'media', desc: 'Lyrics ki line se song dhundo',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}searchthatsong <lyrics ki koi line>`);
      const r = (await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(x.rest)}`)).slice(0, 6);
      if (!r.length) return x.reply('❌ Koi song nahi mila.');
      x.reply('🎶 *Shayad ye song hai:*\n\n' + r.map((s, i) => `${i + 1}. *${s.trackName}* — ${s.artistName}`).join('\n') + `\n\n▶️ Sunne ke liye: ${x.prefix}play <naam>`);
    } },

  // ===== Downloaders / tools =====
  { name: 'ig', aliases: ['instagram', 'igdl'], category: 'media', desc: 'Instagram reel/photo download',
    run: async (x) => {
      const url = x.rest || x.quoted?.text;
      if (!isUrl(url)) return x.reply(`Use: ${x.prefix}ig <instagram link>`);
      if (!config.apis.ig) return x.reply('⚠️ config.js me apis.ig me apna Instagram downloader API daalo.');
      const j = await fetchJson(config.apis.ig + encodeURIComponent(url));
      const media = firstMedia(j);
      if (!media) return x.reply('❌ Media nahi mila.');
      await x.send(/\.mp4/i.test(media) ? { video: { url: media } } : { image: { url: media } }, { quoted: x.m });
    } },

  { name: 'pinterest', aliases: ['pin'], category: 'media', desc: 'Pinterest images',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}pinterest <search>`);
      const data = encodeURIComponent(JSON.stringify({ options: { isPrefetch: false, query: x.rest, scope: 'pins', no_fetch_context_on_resource: false }, context: {} }));
      const j = await fetchJson(`https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=${encodeURIComponent('/search/pins/?q=' + x.rest)}&data=${data}&_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0', 'x-pinterest-pws-handler': 'www/search/[scope].js' } });
      const urls = (j.resource_response?.data?.results || []).map((r) => r.images?.orig?.url).filter(Boolean).slice(0, 4);
      if (!urls.length) return x.reply('❌ Kuch nahi mila.');
      for (const url of urls) await x.send({ image: { url } }, { quoted: x.m });
    } },

  { name: 'remini', aliases: ['hd', 'enhance'], category: 'media', desc: 'Photo HD/enhance (reply)',
    run: async (x) => {
      const d = await x.download();
      if (!d || d.type !== 'imageMessage') return x.reply('📸 Photo reply karo.');
      if (!config.apis.remini) return x.reply('⚠️ config.js me apis.remini me apna enhance API daalo.');
      const link = await catbox(d.buffer, 'jpg');
      const r = await fetch(config.apis.remini + encodeURIComponent(link));
      if ((r.headers.get('content-type') || '').startsWith('image')) return x.send({ image: Buffer.from(await r.arrayBuffer()), caption: '✨ Enhanced' }, { quoted: x.m });
      const media = firstMedia(await r.json());
      if (!media) return x.reply('❌ Enhance fail.');
      await x.send({ image: { url: media }, caption: '✨ Enhanced' }, { quoted: x.m });
    } },

  { name: 'ssweb', aliases: ['ss', 'screenshot'], category: 'media', desc: 'Website ka screenshot',
    run: async (x) => {
      let u = x.rest;
      if (!u) return x.reply(`Use: ${x.prefix}ssweb https://google.com`);
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      const shots = [
        `https://image.thum.io/get/width/1280/crop/900/noanimate/${u}`,
        `https://s.wordpress.com/mshots/v1/${encodeURIComponent(u)}?w=1280`,
      ];
      let last;
      for (const url of shots) {
        try {
          const image = await fetchBuffer(url, {}, { timeout: 20000, retries: 1 });
          if (image?.length) return x.send({ image, caption: `🖥️ ${u}` }, { quoted: x.m });
        } catch (e) { last = e; }
      }
      return x.reply(`❌ Screenshot nahi ban paya: ${last?.message || 'service unavailable'}`);
    } },

  { name: 'catbox', aliases: ['upload', 'tourl'], category: 'media', desc: 'File ko link banao (reply)',
    run: async (x) => {
      const d = await x.download();
      if (!d) return x.reply('Photo/video/file reply karo.');
      const ext = (d.mime || '').split('/')[1]?.split(';')[0] || 'bin';
      x.reply(`🔗 ${await catbox(d.buffer, ext)}`);
    } },

  { name: 'github', aliases: ['gh'], category: 'media', desc: 'GitHub user info',
    run: async (x) => {
      if (!x.args[0]) return x.reply(`Use: ${x.prefix}github <username>`);
      const j = await fetchJson(`https://api.github.com/users/${encodeURIComponent(x.args[0])}`).catch(() => null);
      if (!j || j.message) return x.reply('❌ User nahi mila.');
      await x.send({ image: { url: j.avatar_url }, caption: `🐙 *${j.name || j.login}*\n📝 ${j.bio || '-'}\n📦 Repos: ${j.public_repos}\n👥 Followers: ${j.followers} | Following: ${j.following}\n📍 ${j.location || '-'}\n🔗 ${j.html_url}` }, { quoted: x.m });
    } },

  { name: 'vv', aliases: ['viewonce', 'readvo'], category: 'fun', desc: 'View-once ko normal karo (reply)',
    run: async (x) => {
      const d = await x.download();
      if (!d) return x.reply('View-once photo/video/audio ko reply karo.');
      const c = d.type === 'imageMessage' ? { image: d.buffer } : d.type === 'videoMessage' ? { video: d.buffer } : { audio: d.buffer, mimetype: d.mime };
      await x.send({ ...c, caption: d.caption }, { quoted: x.m });
    } },

  { name: 'whatsapp', aliases: ['onwa', 'checkwa'], category: 'fun', desc: 'Number WhatsApp par hai ya nahi',
    run: async (x) => {
      const n = (x.rest || '').replace(/\D/g, '');
      if (n.length < 8) return x.reply(`Use: ${x.prefix}whatsapp 919XXXXXXXXX`);
      const [r] = await x.sock.onWhatsApp(n + '@s.whatsapp.net');
      x.reply(r?.exists ? `✅ ${n} WhatsApp par hai.` : `❌ ${n} WhatsApp par nahi hai.`);
    } },

  // ===== Sticker / text =====
  { name: 'sticker', aliases: ['s', 'stiker'], category: 'fun', desc: 'Photo/video se sticker (reply)',
    run: async (x) => {
      const d = await x.download();
      if (!d || !['imageMessage', 'videoMessage'].includes(d.type)) return x.reply('📸 Photo/video reply karo.');
      const out = await makeSticker(d.buffer, d.type === 'videoMessage');
      if (!out) return x.reply('❌ Sticker conversion fail. FFmpeg install karke dobara try karo.');
      await x.send({ sticker: out }, { quoted: x.m });
    } },

  { name: 'textsticker', aliases: ['ttp', 'attp'], category: 'fun', desc: 'Text se sticker',
    run: async (x) => {
      const t = (x.rest || x.quoted?.text || '').slice(0, 120);
      if (!t) return x.reply(`Use: ${x.prefix}textsticker Hello`);
      const lines = []; let cur = '';
      for (const w of t.split(/\s+/)) { if ((cur + ' ' + w).trim().length > 12) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
      if (cur) lines.push(cur);
      const fs = Math.max(50, Math.min(130, Math.floor(480 / Math.max(lines.length, 3))));
      const y0 = 256 - ((lines.length - 1) * fs * 1.1) / 2;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><style>text{font-family:sans-serif;font-weight:900;font-size:${fs}px;fill:#fff;stroke:#000;stroke-width:${fs / 12}px;paint-order:stroke;text-anchor:middle;dominant-baseline:middle}</style>${lines.map((l, i) => `<text x="256" y="${y0 + i * fs * 1.1}">${escXml(l)}</text>`).join('')}</svg>`;
      const webp = await sharp()(Buffer.from(svg)).webp().toBuffer();
      await x.send({ sticker: webp }, { quoted: x.m });
    } },

  { name: 'text', aliases: ['font', 'fancy'], category: 'fun', desc: 'Fancy fonts me text',
    run: (x) => {
      const [style, ...t] = x.args;
      if (!STYLES[style] || !t.length)
        return x.reply(`🔤 *Fancy Text*\nUse: ${x.prefix}text <style> <text>\n\n` + Object.keys(STYLES).map((s) => `• ${s} → ${convert('Miku', s)}`).join('\n'));
      x.reply(convert(t.join(' '), style));
    } },

  // ===== Anime / gif / AI =====
  { name: 'gif', category: 'fun', desc: 'Random anime gif (category do)',
    run: async (x) => {
      const c = (x.args[0] || '').toLowerCase();
      if (!GIF_CATS.includes(c)) return x.reply(`🎞️ Categories:\n${GIF_CATS.join(', ')}\n\nUse: ${x.prefix}gif dance`);
      try {
        await sendGif(x, await fetchGif(c), `🎞️ ${c}`, []);
      } catch (e) {
        console.error('[gif]', e.message);
        x.reply('❌ GIF service abhi unavailable hai. Thodi der baad try karo.');
      }
    } },
  gifCmd('kiss'), gifCmd('hug'), gifCmd('pat'), gifCmd('slap'), gifCmd('cuddle'), gifCmd('bonk'),

  { name: 'anime', category: 'fun', desc: 'Anime ki info',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}anime naruto`);
      const a = (await fetchJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(x.rest)}&limit=1`)).data?.[0];
      if (!a) return x.reply('❌ Anime nahi mila.');
      await x.send({ image: { url: a.images.jpg.large_image_url }, caption: `🎌 *${a.title}*\n⭐ ${a.score || '-'} | 📺 Eps: ${a.episodes || '?'} | ${a.status}\n🎭 ${a.genres.map((g) => g.name).join(', ')}\n\n${(a.synopsis || '').slice(0, 500)}...\n\n🔗 ${a.url}` }, { quoted: x.m });
    } },

  { name: 'animeimg', aliases: ['waifu', 'neko'], category: 'fun', desc: 'Random anime image',
    run: async (x) => {
      const c = ['waifu', 'neko', 'shinobu', 'megumin'].includes(x.args[0]) ? x.args[0] : x.cmd === 'neko' ? 'neko' : 'waifu';
      await x.send({ image: { url: (await fetchJson(`https://api.waifu.pics/sfw/${c}`)).url } }, { quoted: x.m });
    } },

  { name: 'ai', aliases: ['gpt', 'ask'], category: 'fun', desc: 'AI se sawal poocho',
    run: async (x) => {
      const q = x.rest || x.quoted?.text;
      if (!q) return x.reply(`Use: ${x.prefix}ai <sawal>`);
      x.reply(await fetchText(`https://text.pollinations.ai/${encodeURIComponent(q)}`));
    } },
];
