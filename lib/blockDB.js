// Bot-level block list (blocked user bot ko use nahi kar sakta)
const db = require('./db');
const list = (s) => db.getG(s, 'blocked', []);

module.exports = {
  isBlocked: (s, num) => list(s).includes(num),
  block: (s, num) => db.setG(s, 'blocked', [...new Set([...list(s), num])]),
  unblock: (s, num) => db.setG(s, 'blocked', list(s).filter((n) => n !== num)),
};
