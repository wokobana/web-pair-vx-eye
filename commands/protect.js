// Saare on/off toggles (anti*, welcome, goodbye, ...)
const db = require('../lib/db');
const config = require('../config');
const { ANTI, modesOf, modeOf } = require('../lib/guards');

const mk = (name, key, desc, category, extra = {}) => ({
  name, category, desc, ...extra,
  run: (x) => {
    const v = (x.args[0] || '').toLowerCase();
    const cur = db.group(x.session, x.jid)[key];
    if (!['on', 'off'].includes(v)) return x.reply(`*${name}* abhi: ${cur ? 'ON ✅' : 'OFF ❌'}\n${desc}\n\nUse: ${x.prefix}${name} on/off`);
    // DM me sirf owner, group me admin
    if (!x.isGroup && !x.isOwner) return x.reply('❌ Sirf owner.');
    db.setGroup(x.session, x.jid, key, v === 'on');
    const warn = extra.needBotAdmin && v === 'on' && x.isGroup && !x.isBotAdmin ? '\n⚠️ Bot ko admin banao warna ye kaam nahi karega.' : '';
    x.reply(`✅ *${name}*: ${v.toUpperCase()}${warn}`);
  },
});

const list = [];

// Anti features (group + admin) — on/off + action mode (delete / warn / kick)
//   .antilink on      -> on (jo mode set hai; default warn)
//   .antilink delete  -> sirf message delete
//   .antilink warn    -> delete + warning (limit par kick)
//   .antilink kick    -> delete + turant kick
//   .antilink off     -> band
const MODE_LABEL = {
  delete: '🗑️ DELETE (message delete + Bengali message)',
  warn: `⚠️ WARN (delete + message + warning, ${config.warnLimit} par kick)`,
  kick: '🚪 KICK (delete + turant kick)',
};

const mkAnti = (name, def) => ({
  name, aliases: def.aliases, category: 'protect', desc: `${def.desc} [on/off/${modesOf(name).join('/')}]`, group: 1, admin: 1,
  run: (x) => {
    const args = x.args.map((a) => a.toLowerCase());
    const g = db.group(x.session, x.jid);
    const cur = modeOf(g, name);
    const allowed = modesOf(name);
    const usage = `Use:\n${x.prefix}${name} on / off\n` + allowed.map((m) => `${x.prefix}${name} ${m}  (${MODE_LABEL[m].split(' (')[1]?.replace(')', '') || m})`).join('\n');

    if (!args.length) {
      return x.reply(`*${name}* abhi: ${g[name] ? 'ON ✅' : 'OFF ❌'}\nAction: ${MODE_LABEL[cur]}\n${def.desc}\n\n${usage}`);
    }
    const on = args.includes('on');
    const off = args.includes('off');
    const mode = args.find((a) => allowed.includes(a));
    if (args.some((a) => ['delete', 'warn', 'kick'].includes(a)) && !mode)
      return x.reply(`❌ *${name}* me ye action nahi hai.\n\n${usage}`);
    if (!on && !off && !mode) return x.reply(usage);

    if (off) {
      db.setGroup(x.session, x.jid, name, false);
      return x.reply(`✅ *${name}*: OFF`);
    }
    if (mode) db.setGroup(x.session, x.jid, 'antiMode', { ...(g.antiMode || {}), [name]: mode });
    db.setGroup(x.session, x.jid, name, true);

    const shown = mode || cur;
    const warnBot = !x.isBotAdmin ? '\n⚠️ Bot ko admin banao warna ye kaam nahi karega.' : '';
    return x.reply(`✅ *${name}*: ON\nAction: ${MODE_LABEL[shown]}${warnBot}`);
  },
});

const RIMURU_OWN = new Set(['antibot', 'antispam']);   // inke commands commands/rimuru.js me hain
for (const [name, def] of Object.entries(ANTI)) if (!RIMURU_OWN.has(name)) list.push(mkAnti(name, def));

// Group notices
list.push(
  mk('groupupdate', 'groupupdate', 'Group naam/desc/admin change notice', 'group', { group: 1, admin: 1 }),
  mk('notifopengroup', 'notifopen', 'Group open/close hone par notice', 'group', { group: 1, admin: 1 }),
  mk('antiremove', 'antiremove', 'Koi member hataye to wapas add', 'protect', { group: 1, admin: 1, needBotAdmin: true }),
  mk('antidelete', 'antidelete', 'Delete hua message wapas dikhao', 'protect', {}),
);

// Global (owner) toggles
list.push(
  {
    name: 'autoreact', category: 'protect', desc: 'Har message par auto react (owner)', owner: 1,
    run: (x) => {
      const v = (x.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return x.reply(`Use: ${x.prefix}autoreact on/off`);
      db.setG(x.session, 'autoreact', v === 'on');
      x.reply(`✅ autoreact: ${v.toUpperCase()}`);
    },
  },
  {
    name: 'anticall', category: 'protect', desc: 'Call reject (on/off/block) (owner)', owner: 1,
    run: (x) => {
      const v = (x.args[0] || '').toLowerCase();
      if (!['on', 'off', 'block'].includes(v)) return x.reply(`Abhi: ${db.getG(x.session, 'anticall', 'off')}\nUse: ${x.prefix}anticall on|off|block`);
      db.setG(x.session, 'anticall', v);
      x.reply(`✅ anticall: ${v.toUpperCase()}`);
    },
  },
  {
    name: 'groupprotect', aliases: ['gp'], category: 'protect', desc: 'Ek saath protection preset on/off', group: 1, admin: 1,
    run: (x) => {
      const v = (x.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return x.reply(`Use: ${x.prefix}groupprotect on/off\n(on = antispam, antibot, antihidetag, antiphising, antijudol, antibug)`);
      for (const k of ['antispam', 'antibot', 'antihidetag', 'antiphising', 'antijudol', 'antibug']) db.setGroup(x.session, x.jid, k, v === 'on');
      x.reply(`🛡️ Group protection: *${v.toUpperCase()}*${v === 'on' && !x.isBotAdmin ? '\n⚠️ Bot ko admin banao.' : ''}`);
    },
  },
);

module.exports = list;
