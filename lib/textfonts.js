// Fancy text styles
const range = (u, l, d) => ({ u, l, d });
const OFFSETS = {
  bold: range(0x1d5d4, 0x1d5ee, 0x1d7ec),
  italic: range(0x1d608, 0x1d622),
  bolditalic: range(0x1d63c, 0x1d656),
  mono: range(0x1d670, 0x1d68a, 0x1d7f6),
  serifbold: range(0x1d400, 0x1d41a, 0x1d7ce),
  script: range(0x1d4d0, 0x1d4ea),
  fraktur: range(0x1d56c, 0x1d586),
  double: range(0x1d538, 0x1d552, 0x1d7d8),
  bubble: range(0x24b6, 0x24d0),
};
const SMALLCAPS = 'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ';

function convert(text, style) {
  if (style === 'smallcaps') {
    return [...text].map((ch) => (/[a-z]/i.test(ch) ? [...SMALLCAPS][ch.toLowerCase().charCodeAt(0) - 97] : ch)).join('');
  }
  const o = OFFSETS[style];
  if (!o) return text;
  return [...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(o.u + c - 65);
    if (c >= 97 && c <= 122) return String.fromCodePoint(o.l + c - 97);
    if (o.d && c >= 48 && c <= 57) return String.fromCodePoint(o.d + c - 48);
    return ch;
  }).join('');
}

const STYLES = Object.fromEntries([...Object.keys(OFFSETS), 'smallcaps'].map((s) => [s, true]));

module.exports = { convert, STYLES };
