// .welcome / .goodbye panel (on, off, bn, en, status) + .channel
const db = require('../lib/db');
const ui = require('../lib/ui');
const config = require('../config');

function panel(kind, g, p) {
  const K = kind === 'welcome' ? 'Welcome' : 'Goodbye';
  const on = !!g[kind];
  const lang = (g[`${kind}Lang`] || 'bn').toUpperCase();
  let t =
    `┌〔 *${K} Settings* 〕\n` +
    `├ 📊 *Status:* ${on ? '✅ ON' : '❌ OFF'}\n` +
    `├ 🌐 *Language:* ${lang}\n`;
  if (kind === 'welcome') t += `├ 🎬 *Video:* ${g.welcomeVideoOn ? '✅ ON' : '❌ OFF'}\n`;
  t += `└➤\n\n` +
    `📝 *HOW TO USE:*\n` +
    `┃ \`${p}${kind}\`  - Show this panel (also turns ON)\n` +
    `┃ \`${p}${kind} on\`  - Turn ON\n` +
    `┃ \`${p}${kind} off\`  - Turn OFF\n` +
    `┃ \`${p}${kind} bn\`  - Set language to Bengali\n` +
    `┃ \`${p}${kind} en\`  - Set language to English\n` +
    `┃ \`${p}${kind} status\`  - Show current status only (no change)\n`;
  if (kind === 'welcome') t += `┃ \`${p}welcomevideo on/off\`  - Welcome video ON/OFF\n`;
  t += `\n💡 *INFO*\n` +
    `┃ ℹ️ Language & ON/OFF are independent — changing one keeps the other as-is.\n` +
    `┃ ℹ️ Default language if never set: BN`;
  return t;
}

const mk = (kind) => ({
  name: kind, category: 'group', group: 1, admin: 1,
  desc: `${kind === 'welcome' ? 'Welcome' : 'Goodbye'} panel: on/off/bn/en/status`,
  run: async (x) => {
    const a = (x.args[0] || '').toLowerCase();
    const set = (k, v) => db.setGroup(x.session, x.jid, k, v);
    if (!a) set(kind, true);                                  // sirf .welcome / .goodbye => ON + panel
    else if (a === 'on') set(kind, true);
    else if (a === 'off') set(kind, false);
    else if (a === 'bn' || a === 'en') set(`${kind}Lang`, a);
    else if (a !== 'status') return x.reply(`❌ Galat option.\nUse: ${x.prefix}${kind} on/off/bn/en/status`);

    const g = db.group(x.session, x.jid);
    return ui.sendBtn(x.sock, x.jid, {
      text: panel(kind, g, x.prefix),
      mentions: [x.sender],
      buttons: [{ id: `${x.prefix}owner`, text: '😊 Dev' }, { id: `${x.prefix}menu`, text: '📜 List' }],
      image: (await ui.ownerDpWait(x.sock)) || { url: ui.dpUrl() },
    }, { quoted: x.ownerQuote || ui.ownerQuote(x.sock) });
  },
});

module.exports = [
  mk('welcome'),
  mk('goodbye'),
  {
    name: 'channel', aliases: ['channels', 'support'], category: 'general', desc: 'Channel + Telegram link',
    run: (x) => x.reply(`📢 *Our Channels*\n\n${ui.footerText() || 'Abhi koi channel set nahi hai (config.js -> channels).'}`),
  },
];
