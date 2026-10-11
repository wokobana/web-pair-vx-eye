// JSON database: group settings + global (per-session) settings
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'db.json');
fs.mkdirSync(path.dirname(FILE), { recursive: true });

let data = { groups: {}, globals: {} };
try { data = { groups: {}, globals: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => fs.writeFileSync(FILE, JSON.stringify(data, null, 2)), 500);
}

const DEFAULT = {
  welcome: false, goodbye: false, welcomeMsg: null, goodbyeMsg: null, welcomeVideo: null, allTagVideo: null, intro: null,
  groupupdate: false, notifopen: false, antiremove: false, antidelete: false,
  antilink: false, antilinkgc: false, antijudol: false, antiphising: false, antitoxic: false,
  antispam: false, antimedia: false, antisticker: false, antistatus: false,
  antigroupstatus: false, antitagsw: false, antihidetag: false, antibot: false,
  linklock: false, antibug: false, antipic: false, antivideo: false, antivoice: false,
  welcomeLang: 'bn', goodbyeLang: 'bn', welcomeVideoOn: false,
  openAt: null, closeAt: null, warns: {},
  antiMode: {},          // har anti feature ka action: 'delete' | 'warn' | 'kick'  (default warn; antibot = kick)
  statusColor: null, activity: {},
  isBanned: false, antispamDelay: null, antispamAction: 'warning',
};

const key = (s, g) => `${s}:${g}`;
const group = (s, g) => ({ ...DEFAULT, ...(data.groups[key(s, g)] || {}) });
function setGroup(s, g, k, v) {
  data.groups[key(s, g)] = { ...group(s, g), [k]: v };
  save();
}
function allGroups(s) {
  return Object.entries(data.groups)
    .filter(([k]) => k.startsWith(s + ':'))
    .map(([k, v]) => [k.slice(s.length + 1), { ...DEFAULT, ...v }]);
}

const getG = (s, k, def) => (data.globals[s] && k in data.globals[s] ? data.globals[s][k] : def);
function setG(s, k, v) {
  data.globals[s] = { ...(data.globals[s] || {}), [k]: v };
  save();
}

function addWarn(s, g, user) {
  const w = { ...group(s, g).warns };
  w[user] = (w[user] || 0) + 1;
  setGroup(s, g, 'warns', w);
  return w[user];
}
function resetWarn(s, g, user) {
  const w = { ...group(s, g).warns };
  delete w[user];
  setGroup(s, g, 'warns', w);
}

module.exports = { group, setGroup, allGroups, getG, setG, addWarn, resetWarn };
