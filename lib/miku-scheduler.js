// Group auto open/close (.grouptime)
const db = require('./db');
const config = require('../config');
const { pick, OPEN_MSG, CLOSE_MSG } = require('./msgs');
const ui = require('./ui');

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: config.timezone });

function start(sock, session) {
  let last = '';
  return setInterval(async () => {
    const now = clock.format(new Date());
    if (now === last) return;
    last = now;
    for (const [gid, g] of db.allGroups(session)) {
      try {
        if (g.openAt === now) {
          await sock.groupSettingUpdate(gid, 'not_announcement');
          await ui.sendBtn(sock, gid, { text: pick(OPEN_MSG).replace('{time}', now) }, { quoted: ui.ownerQuote(sock) });
        }
        if (g.closeAt === now) {
          await sock.groupSettingUpdate(gid, 'announcement');
          await ui.sendBtn(sock, gid, { text: pick(CLOSE_MSG).replace('{time}', now) }, { quoted: ui.ownerQuote(sock) });
        }
      } catch {}
    }
  }, 20000);
}

module.exports = { start };
