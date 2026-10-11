// Chhote sending helpers
const { channelCtx } = require('./common');

// Channel se forward hua message bhejo
const sendViaChannel = (sock, jid, content, opts) =>
  sock.sendMessage(jid, { ...content, contextInfo: channelCtx(content.contextInfo || {}) }, opts);

module.exports = { sendViaChannel };
