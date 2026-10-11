// Owner-only command registry check.
// Does not execute external APIs; it verifies that all command modules loaded.
const plugins = require('../lib/plugins');

module.exports = [{
  name: 'cmdcheck',
  category: 'owner',
  desc: 'Loaded commands ka quick check',
  owner: 1,
  run: (x) => {
    const names = plugins.list.map((c) => c.name);
    x.reply(
      `🧪 *COMMAND CHECK*\n` +
      `Loaded: ${names.length}\n` +
      `Files: ${[...new Set(plugins.list.map((c) => c.category || 'general'))].join(', ')}\n\n` +
      `Use: ${x.prefix}menu\n\n` +
      names.map((n, i) => `${i + 1}. ${x.prefix}${n}`).join('\n')
    );
  },
}];

// YouTube downloader (song/play/video) ka status + update
const md = require('../lib/mediaDownload');
const { spawnSync } = require('child_process');
const has = (bin) => { try { return spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0; } catch { return false; } };

module.exports.push(
  {
    name: 'ytcheck', category: 'owner', desc: 'YouTube downloader (song/video) ka status', owner: 1,
    run: (x) => {
      const info = md.ytDlpInfo();
      return x.reply([
        '🎵 *YT DOWNLOADER CHECK*',
        '',
        `yt-dlp: ${info ? `✅ ${info.version}` : '❌ nahi mila (bot khud install karne ki koshish karta hai)'}`,
        `cookies.txt: ${md.cookiesFile() ? '✅ mil gayi' : '❌ nahi hai'}`,
        `proxy: ${md.proxyUrl() ? '✅ set' : '— set nahi'}`,
        `ffmpeg: ${has('ffmpeg') ? '✅' : '❌ (mp3 convert / sticker ke liye chahiye)'}`,
        `node: ${process.version}`,
        '',
        '"Sign in to confirm you\'re not a bot" aaye to: cookies.txt daalo ya proxy set karo, phir ' + x.prefix + 'ytupdate.',
      ].join('\n'));
    },
  },
  {
    name: 'ytupdate', category: 'owner', desc: 'yt-dlp install/update karo', owner: 1,
    run: async (x) => {
      await x.react('⏳');
      try { await x.reply('✅ ' + await md.updateYtDlp()); await x.react('✅'); }
      catch (e) { await x.reply('❌ ' + e.message); }
    },
  },
);

// Baileys version + group status support
const bl = require('../lib/baileysLoader');
module.exports.push({
  name: 'botcheck', aliases: ['baileyscheck', 'versioncheck'], category: 'owner', desc: 'Baileys/Node version + group status support', owner: 1,
  run: async (x) => {
    const b = await bl.loadBaileys();
    return x.reply([
      '🧪 *BOT CHECK*',
      '',
      `Baileys: ${b.version || 'pata nahi'}`,
      `Node: ${process.version}`,
      `Group status (.swgc): ${b.groupStatus ? '✅ support hai' : '❌ support nahi'}`,
      b.groupStatus ? '' : `\nFix: ${b.fix}\nphir bot restart karo.`,
    ].join('\n').trim());
  },
});
