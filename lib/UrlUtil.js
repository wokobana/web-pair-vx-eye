const URL_RE = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|in|io|me|xyz|link|site|info|co|ly|gg|tv)\b(?:\/\S*)?/i;
const WA_GROUP_RE = /chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/i;

module.exports = {
  URL_RE,
  hasUrl: (t) => URL_RE.test(t || ''),
  waGroupCode: (t) => ((t || '').match(WA_GROUP_RE) || [])[1],
  isUrl: (t) => /^https?:\/\/\S+$/i.test((t || '').trim()),
};
