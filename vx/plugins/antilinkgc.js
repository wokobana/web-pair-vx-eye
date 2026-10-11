// plugins/antilinkgc.js
// Anti Group-Invite-Link
// Only WhatsApp group invite links are handled.
// Admins are always protected.

import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

const INVITE_LINK_REGEX =
  /(?:https?:\/\/)?chat\.whatsapp\.com\/[A-Za-z0-9_-]+/i;

const NTGC_DELETE_TEXT =
  `⚠️ @USER, *লিংক এর জন্য* *গ্রুপ নোটিশ গ্রুপে যেকোনো ধরনের লিংক শেয়ার করা নিষেধ।  লিংক শেয়ার করলে তাকে গ্রুপ  থেকে রিমুভ করা হতে পারে। ধন্যবাদ।*⛔`;

const NTGC_KICK_TEXT =
  `╭─〔 ⚠️ 𝐒𝐀𝐈𝐃𝐘 𝐖𝐀𝐑𝐍𝐈𝐍𝐆 〕─╮
│
│ 👤 @USER
│
│ 🔗 গ্রুপে WhatsApp গ্রুপ লিংক
│ শেয়ার করা নিষেধ।
│
│ 🚫 দয়া করে আর লিংক শেয়ার করবেন না।
│
│ ⚡ নিয়ম ভঙ্গ করার কারণে
│ আপনাকে গ্রুপ থেকে কিক করা হচ্ছে।
│
╰────────────────────╯`;

function getBotNumber(conn) {
  const id =
    conn?.user?.id ||
    conn?.user?.jid ||
    conn?.user ||
    "";

  return (
    String(id)
      .split("@")[0]
      .split(":")[0]
      .replace(/\D/g, "") || "unknown"
  );
}

function key(groupJid, name) {
  return `antilinkgc:${groupJid}:${name}`;
}

function getSetting(botNumber, groupJid, name, fallback) {
  try {
    const value = db.get(
      botNumber,
      key(groupJid, name),
      fallback
    );

    return value === undefined || value === null
      ? fallback
      : value;
  } catch {
    return fallback;
  }
}

function setSetting(botNumber, groupJid, name, value) {
  try {
    if (typeof db.setHot === "function") {
      db.setHot(
        botNumber,
        key(groupJid, name),
        value
      );
      return true;
    }

    if (typeof db.set === "function") {
      db.set(
        botNumber,
        key(groupJid, name),
        value
      );
      return true;
    }
  } catch {}

  return false;
}

function senderJid(message) {
  return (
    message?.sender ||
    message?.key?.participant ||
    message?.key?.participantAlt ||
    null
  );
}

/*
 * Normalize JID so that:
 * 1234567890@s.whatsapp.net
 * 1234567890:12@s.whatsapp.net
 *
 * can be compared safely.
 */
function normalizeJid(jid) {
  if (!jid) return "";

  return String(jid)
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

/*
 * IMPORTANT:
 * Check the ACTUAL sender inside group participants.
 *
 * This prevents admins from being deleted/kicked even if
 * message.isAdmin is missing or behaves differently in
 * the current bot framework.
 */
function isSenderAdmin(message, jid) {
  if (!jid) return false;

  const senderNumber = normalizeJid(jid);

  if (!senderNumber) return false;

  /*
   * Try all common places where group participant
   * information may exist.
   */
  const participants =
    message?.groupMetadata?.participants ||
    message?.groupInfo?.participants ||
    message?.metadata?.participants ||
    message?.group?.participants ||
    [];

  if (!Array.isArray(participants)) {
    /*
     * Fallback only if framework explicitly says the
     * sender is an admin.
     */
    return (
      message?.isAdmin === true ||
      message?.isGroupAdmin === true
    );
  }

  const participant = participants.find((p) => {
    const participantJid =
      p?.id ||
      p?.jid ||
      p?.participant ||
      p?.phoneNumber ||
      "";

    return normalizeJid(participantJid) === senderNumber;
  });

  if (!participant) {
    return false;
  }

  /*
   * WhatsApp participant admin values:
   *
   * admin
   * superadmin
   */
  return (
    participant?.admin === "admin" ||
    participant?.admin === "superadmin" ||
    participant?.isAdmin === true ||
    participant?.isGroupAdmin === true ||
    participant?.isSuperAdmin === true
  );
}

async function deleteMessage(message) {
  try {
    if (
      typeof message?.send === "function" &&
      message.key
    ) {
      await message.send({
        delete: message.key
      });

      return true;
    }
  } catch {}

  try {
    if (
      message?.conn?.sendMessage &&
      message.from &&
      message.key
    ) {
      await message.conn.sendMessage(
        message.from,
        {
          delete: message.key
        }
      );

      return true;
    }
  } catch {}

  return false;
}

async function kick(message, jid) {
  if (!jid) return false;

  try {
    if (
      typeof message?.removeParticipant ===
      "function"
    ) {
      await message.removeParticipant([jid]);
      return true;
    }
  } catch {}

  try {
    if (
      message?.conn?.groupParticipantsUpdate &&
      message.from
    ) {
      await message.conn.groupParticipantsUpdate(
        message.from,
        [jid],
        "remove"
      );

      return true;
    }
  } catch {}

  return false;
}

// ─────────────────────────────────────────────────────────────
// Command: .antilinkgc on/off/kick/delete
// ─────────────────────────────────────────────────────────────

Module({
  command: "antilinkgc",
  aliases: ["anti-link-gc"],
  package: "group",
  description:
    "Block WhatsApp group invite links with separate Bengali notice"
})(async (message, match) => {
  try {
    if (!message?.isGroup) {
      return message.send?.(
        "❌ This command works only in groups."
      );
    }

    await message.loadGroupInfo?.();

    if (
      !(
        message.isAdmin ||
        message.isGroupAdmin ||
        message.isFromMe ||
        message.isfromMe
      )
    ) {
      return message.send?.(
        "❌ Only group admins can use AntiLinkGC."
      );
    }

    const botNumber = getBotNumber(message.conn);
    const groupJid = message.from;
    const input = String(match || "")
      .trim()
      .toLowerCase();

    if (!input) {
      const enabled =
        getSetting(
          botNumber,
          groupJid,
          "enabled",
          false
        ) === true;

      const mode = String(
        getSetting(
          botNumber,
          groupJid,
          "mode",
          "delete"
        )
      ).toLowerCase();

      return message.send?.(
        `╭─〔 *ANTILINKGC* 〕
├─ Status: ${enabled ? "✅ ON" : "❌ OFF"}
├─ Mode: *${mode.toUpperCase()}*
╰─➤

Only *WhatsApp group invite links* are blocked.

Admins are always protected.

.antilinkgc on
.antilinkgc off
.antilinkgc kick
.antilinkgc delete`
      );
    }

    if (input === "on") {
      setSetting(
        botNumber,
        groupJid,
        "enabled",
        true
      );

      if (
        !getSetting(
          botNumber,
          groupJid,
          "mode",
          null
        )
      ) {
        setSetting(
          botNumber,
          groupJid,
          "mode",
          "delete"
        );
      }

      return message.send?.(
        "✅ AntiLinkGC ON"
      );
    }

    if (input === "off") {
      setSetting(
        botNumber,
        groupJid,
        "enabled",
        false
      );

      return message.send?.(
        "❌ AntiLinkGC OFF"
      );
    }

    if (
      input === "kick" ||
      input === "remove"
    ) {
      setSetting(
        botNumber,
        groupJid,
        "enabled",
        true
      );

      setSetting(
        botNumber,
        groupJid,
        "mode",
        "kick"
      );

      return message.send?.(
        "✅ AntiLinkGC mode set to KICK"
      );
    }

    if (
      input === "delete" ||
      input === "null"
    ) {
      setSetting(
        botNumber,
        groupJid,
        "enabled",
        true
      );

      setSetting(
        botNumber,
        groupJid,
        "mode",
        "delete"
      );

      return message.send?.(
        "✅ AntiLinkGC mode set to DELETE"
      );
    }

    return message.send?.(
      "❌ Use: .antilinkgc on | off | kick | delete"
    );
  } catch (err) {
    console.error(
      "[antilinkgc][command]",
      err?.message || err
    );
  }
});

// ─────────────────────────────────────────────────────────────
// Enforcement
// Admins are NEVER affected.
// ─────────────────────────────────────────────────────────────

Module({
  on: "text",
  package: "group",
  description:
    "Detect and remove WhatsApp group invite links"
})(async (message) => {
  try {
    if (!message?.isGroup) return;

    /*
     * Never act on bot messages.
     */
    if (
      message.isFromMe ||
      message.isfromMe
    ) {
      return;
    }

    const body = String(
      message.body || ""
    ).trim();

    if (
      !body ||
      !INVITE_LINK_REGEX.test(body)
    ) {
      return;
    }

    /*
     * Load latest group information BEFORE
     * checking whether the sender is admin.
     */
    await message.loadGroupInfo?.();

    const jid = senderJid(message);

    if (!jid) return;

    /*
     * ─────────────────────────────────────────────
     * CRITICAL ADMIN PROTECTION
     *
     * Check the person who SENT the link,
     * not message.isAdmin alone.
     *
     * If sender is admin/superadmin:
     * return immediately.
     * No delete.
     * No warning.
     * No kick.
     * ─────────────────────────────────────────────
     */
    if (isSenderAdmin(message, jid)) {
      return;
    }

    const botNumber =
      getBotNumber(message.conn);

    const groupJid = message.from;

    if (
      getSetting(
        botNumber,
        groupJid,
        "enabled",
        false
      ) !== true
    ) {
      return;
    }

    /*
     * Bot must be admin to enforce.
     */
    if (!message.isBotAdmin) {
      return;
    }

    const mode = String(
      getSetting(
        botNumber,
        groupJid,
        "mode",
        "delete"
      )
    ).toLowerCase();

    /*
     * Delete offending message first.
     */
    await deleteMessage(message);

    const senderNumber =
      normalizeJid(jid) || "user";

    /*
     * DELETE MODE
     */
    if (mode === "delete") {
      try {
        await message.send?.(
          NTGC_DELETE_TEXT.replace(
            "@USER",
            `@${senderNumber}`
          ),
          {
            mentions: [jid]
          }
        );
      } catch {}

      return;
    }

    /*
     * KICK MODE
     */
    if (mode === "kick") {
      try {
        await message.send?.(
          NTGC_KICK_TEXT.replace(
            "@USER",
            `@${senderNumber}`
          ),
          {
            mentions: [jid]
          }
        );
      } catch {}

      await new Promise(
        (resolve) =>
          setTimeout(resolve, 800)
      );

      /*
       * Extra safety check immediately before kick.
       * If the user's admin status changed meanwhile,
       * don't kick them.
       */
      await message.loadGroupInfo?.();

      if (isSenderAdmin(message, jid)) {
        return;
      }

      const removed =
        await kick(message, jid);

      if (!removed) {
        try {
          await message.send?.(
            `❌ @${senderNumber}-কে গ্রুপ থেকে রিমুভ করা যায়নি। বটকে অ্যাডমিন করুন।`,
            {
              mentions: [jid]
            }
          );
        } catch {}
      }
    }
  } catch (err) {
    console.error(
      "[antilinkgc][enforcement]",
      err?.message || err
    );
  }
});
