/*
 * button-router.js
 *
 * Problem: jab button dabate hain to kai baar WhatsApp command-id (".allmenu")
 * ki jagah sirf button ka NAAM ("📜 All Menu") text ke roop me bhejta hai
 * (khaas kar jab bot aur aap ek hi number ho). Tab bot usse command nahi
 * samajhta aur kuch nahi hota.
 *
 * Ye file us text ko wapas asli command-id me badal deti hai:
 *   1) jis message par reply hua uske buttons dekh kar (quotedMessage),
 *   2) ya bot ne jo buttons bheje the unki yaad (registry) se.
 */

const REG = new Map(); // messageId -> [{ norm, id }]
const REG_MAX = 500;

export const normLabel = (s) =>
  String(s || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}:]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function pairsFromButtons(buttons = []) {
  const out = [];
  for (const b of buttons) {
    try {
      const p = typeof b.buttonParamsJson === "string" ? JSON.parse(b.buttonParamsJson) : b.buttonParamsJson;
      if (p?.id && p?.display_text) out.push({ norm: normLabel(p.display_text), id: String(p.id) });
    } catch {}
  }
  return out;
}

/** sendNativeButtons se call hota hai: bheje gaye buttons yaad rakho */
export function registerButtons(messageId, buttons) {
  if (!messageId) return;
  const pairs = pairsFromButtons(buttons);
  if (!pairs.length) return;
  REG.set(messageId, pairs);
  if (REG.size > REG_MAX) REG.delete(REG.keys().next().value);
}

function unwrap(m) {
  let cur = m;
  for (let i = 0; i < 6 && cur; i++) {
    const inner =
      cur.viewOnceMessage?.message ||
      cur.viewOnceMessageV2?.message ||
      cur.viewOnceMessageV2Extension?.message ||
      cur.ephemeralMessage?.message ||
      cur.documentWithCaptionMessage?.message ||
      cur.botInvokeMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

function pairsFromQuoted(quotedMessage) {
  const q = unwrap(quotedMessage);
  const buttons = q?.interactiveMessage?.nativeFlowMessage?.buttons;
  return Array.isArray(buttons) ? pairsFromButtons(buttons) : [];
}

/**
 * Agar ye message kisi bot-button ka dabaya hua reply hai to command-id
 * (jaise ".allmenu") lauta do, warna null.
 */
export function resolveButtonTap({ type, content, body }) {
  const text = normLabel(body);
  if (!text) return null;

  const ci = content?.contextInfo;
  const stanzaId = ci?.stanzaId;
  if (!stanzaId && !ci?.quotedMessage) return null;

  const pairs = [
    ...(REG.get(stanzaId) || []),
    ...(ci?.quotedMessage ? pairsFromQuoted(ci.quotedMessage) : []),
  ];
  if (!pairs.length) return null;

  const hit = pairs.find((p) => p.norm === text);
  return hit ? hit.id : null;
}
