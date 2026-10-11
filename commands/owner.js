const blockDB = require('../lib/blockDB');

const num = (x) => (x.target ? x.target.split('@')[0] : (x.args[0] || '').replace(/\D/g, ''));

module.exports = [
  { name: 'block', category: 'owner', desc: 'User ko bot use karne se roko (owner)', owner: 1,
    run: (x) => { const n = num(x); if (!n) return x.reply('Tag/reply karo ya number likho.'); blockDB.block(x.session, n); x.reply(`🚫 ${n} block ho gaya.`); } },
  { name: 'unblock', category: 'owner', desc: 'User ko unblock (owner)', owner: 1,
    run: (x) => { const n = num(x); if (!n) return x.reply('Tag/reply karo ya number likho.'); blockDB.unblock(x.session, n); x.reply(`✅ ${n} unblock ho gaya.`); } },
];
