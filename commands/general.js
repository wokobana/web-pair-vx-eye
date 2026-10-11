const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../lib/db');
const plugins = require('../lib/plugins');
const { mediaSrc, uptime, channelCtx } = require('../lib/common');
const ui = require('../lib/ui');

module.exports = [
  {
    name: 'ping', category: 'general', desc: 'Bot speed',
    run: (x) => x.reply(`🏓 Pong! *${Math.abs(Date.now() - Number(x.m.messageTimestamp) * 1000)} ms*`),
  },
  {
    name: 'owner', category: 'general', desc: 'Owner ka contact',
    run: (x) => {
      const n = config.ownerNumber[0];
      if (db.getG(x.session, 'ownerType', 'vcard') === 'text') return x.reply(`👑 *Owner:* ${config.ownerName}\n📞 wa.me/${n}`);
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${config.ownerName}\nTEL;type=CELL;type=VOICE;waid=${n}:+${n}\nEND:VCARD`;
      return x.send({ contacts: { displayName: config.ownerName, contacts: [{ vcard }] } }, { quoted: x.m });
    },
  },
  {
    name: 'setownertype', category: 'owner', desc: 'Owner card style: vcard / text', owner: 1,
    run: (x) => {
      const t = (x.args[0] || '').toLowerCase();
      if (!['vcard', 'text'].includes(t)) return x.reply(`Use: ${x.prefix}setownertype vcard|text`);
      db.setG(x.session, 'ownerType', t);
      x.reply(`✅ Owner type: *${t}*`);
    },
  },
  {
    name: 'settings', aliases: ['status'], category: 'general', desc: 'Is group ki saari settings',
    run: (x) => {
      const g = db.group(x.session, x.jid);
      const keys = ['notifopen', 'antiremove', 'antidelete', 'antijudol', 'antiphising', 'antitoxic', 'antispam', 'antigroupstatus', 'antitagsw', 'antihidetag', 'antibot', 'antibug'];
      const on = (v) => (v ? '✅' : '❌');
      const { ANTI, modeOf } = require('../lib/guards');
      const icon = { delete: '🗑️', warn: '⚠️', kick: '🚪' };
      x.reply(
        `⚙️ *Settings*\n` + keys.map((k) => `${on(g[k])} ${k}${ANTI[k] && g[k] ? ` ${icon[modeOf(g, k)]}` : ''}`).join('\n') +
        `\n\n🗑️ delete  ⚠️ warn  🚪 kick` +
        `\n\n⏰ Auto open: ${g.openAt || '-'} | close: ${g.closeAt || '-'}` +
        `\n🤖 autoreact: ${on(db.getG(x.session, 'autoreact', false))} | anticall: ${db.getG(x.session, 'anticall', 'off')}`
      );
    },
  },
];
