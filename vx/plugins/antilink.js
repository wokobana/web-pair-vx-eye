// plugins/antilink.js

import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

/* =========================================================
   CONFIG
   ========================================================= */

const DEBUG = false;

const debug = (...args) => {
  if (DEBUG) {
    console.debug("[antilink]", ...args);
  }
};

/* =========================================================
   LINK REGEX
   ========================================================= */

const LINK_REGEX =
  /(?:https?:\/\/[^\s]+)|(?:www\.[^\s]+)|(?:chat\.whatsapp\.com\/[A-Za-z0-9_-]+)|(?:wa\.me\/[0-9]+)|(?:t\.me\/[A-Za-z0-9_\-]+)|(?:telegram\.me\/[A-Za-z0-9_\-]+)|(?:discord\.gg\/[A-Za-z0-9_\-]+)|(?:discord\.com\/invite\/[A-Za-z0-9_\-]+)|(?:bit\.ly\/[A-Za-z0-9_\-]+)|(?:tinyurl\.com\/[A-Za-z0-9_\-]+)|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|gg|xyz|me|app|online|site|link|dev|in|co|info|biz)\b/gi;

/* =========================================================
   BOT NUMBER
   ========================================================= */

function getBotNumberFromConn(conn) {
  try {
    const id =
      conn?.user?.id ||
      conn?.user?.jid ||
      conn?.user ||
      null;

    if (!id) {
      return "unknown";
    }

    return String(id)
      .split("@")[0]
      .split(":")[0];
  } catch {
    return "unknown";
  }
}

/* =========================================================
   GROUP KEYS
   ========================================================= */

function enabledKeyFor(groupJid) {
  return `antilink:${groupJid}:enabled`;
}

function modeKeyFor(groupJid) {
  return `antilink:${groupJid}:mode`;
}

/* =========================================================
   DB HELPERS
   ========================================================= */

function dbGetSafe(sessionId, key, fallback = null) {
  try {
    const value = db.get(
      sessionId,
      key,
      fallback
    );

    return value === undefined ||
      value === null
      ? fallback
      : value;
  } catch (err) {
    debug(
      "db.get error:",
      err?.message || err
    );

    return fallback;
  }
}

function dbSetSafe(sessionId, key, value) {
  try {
    /*
     * setHot is used by this bot's DB for
     * fast runtime configuration changes.
     */
    if (
      typeof db.setHot === "function"
    ) {
      db.setHot(
        sessionId,
        key,
        value
      );
      return true;
    }

    if (
      typeof db.set === "function"
    ) {
      db.set(
        sessionId,
        key,
        value
      );
      return true;
    }

    return false;
  } catch (err) {
    console.error(
      "[antilink] db.set error:",
      err?.message || err
    );

    return false;
  }
}

/* =========================================================
   GET SENDER JID
   ========================================================= */

function getSenderJid(message) {
  const jid =
    message?.sender ||
    message?.key?.participant ||
    message?.key?.participantAlt ||
    message?.key?.from ||
    null;

  if (!jid) {
    return null;
  }

  return String(jid);
}

/* =========================================================
   GET SENDER NUMBER
   ========================================================= */

function getSenderNumber(jid) {
  if (!jid) {
    return "unknown";
  }

  return String(jid)
    .split("@")[0]
    .split(":")[0];
}

/* =========================================================
   CHECK BOT ADMIN
   ========================================================= */

async function refreshGroupInfo(message) {
  try {
    if (
      typeof message?.loadGroupInfo ===
      "function"
    ) {
      await message.loadGroupInfo();
    }
  } catch (err) {
    debug(
      "loadGroupInfo failed:",
      err?.message || err
    );
  }
}

/* =========================================================
   BOT ADMIN CHECK
   ========================================================= */

function normalizeJid(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase();
}

function sameJidUser(a, b) {
  const x = normalizeJid(a);
  const y = normalizeJid(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xu = x.split("@")[0].split(":")[0];
  const yu = y.split("@")[0].split(":")[0];
  return !!xu && xu === yu;
}

async function isCurrentBotAdmin(message) {
  try {
    await refreshGroupInfo(message);

    // serialize.js has the preferred PN/LID-safe result.
    if (message?.isBotAdmin === true) return true;

    // Android/WhatsApp can expose the sender/admin identity as PN or LID.
    // Fall back to the already-loaded group admin list without touching any
    // other file.
    const admins = Array.isArray(message?.groupAdmins)
      ? message.groupAdmins
      : [];
    const botIds = [
      message?.conn?.user?.id,
      message?.conn?.user?.jid,
      message?.conn?.user?.lid,
      message?.conn?.user?.phoneNumber,
      message?.bot,
      message?.botJid,
    ].filter(Boolean);

    if (admins.some((admin) =>
      botIds.some((bot) => sameJidUser(admin, bot))
    )) {
      return true;
    }

    // One fresh metadata load in case the cached admin list was stale.
    if (typeof message?.loadGroupInfo === "function") {
      await message.loadGroupInfo();
    }

    return message?.isBotAdmin === true;
  } catch (err) {
    debug("bot admin check failed:", err?.message || err);
    return false;
  }
}

/* =========================================================
   DELETE MESSAGE
   ========================================================= */

async function deleteMessage(message) {
  try {
    if (!message) {
      return false;
    }

    /* -----------------------------------------
       Method 1: wrapper send()
       ----------------------------------------- */

    if (
      typeof message.send === "function" &&
      message.key
    ) {
      try {
        await message.send({
          delete: message.key,
        });

        debug(
          "Message deleted using message.send()"
        );

        return true;
      } catch (err) {
        debug(
          "message.send delete failed:",
          err?.message || err
        );
      }
    }

    /* -----------------------------------------
       Method 2: direct Baileys connection
       ----------------------------------------- */

    if (
      message.conn &&
      typeof message.conn.sendMessage ===
        "function" &&
      message.from &&
      message.key
    ) {
      try {
        await message.conn.sendMessage(
          message.from,
          {
            delete: message.key,
          }
        );

        debug(
          "Message deleted using conn.sendMessage()"
        );

        return true;
      } catch (err) {
        debug(
          "conn.sendMessage delete failed:",
          err?.message || err
        );
      }
    }

    return false;
  } catch (err) {
    debug(
      "deleteMessage error:",
      err?.message || err
    );

    return false;
  }
}

/* =========================================================
   REMOVE PARTICIPANT
   ========================================================= */

async function removeParticipant(
  message,
  senderJid
) {
  try {
    if (
      !message ||
      !senderJid ||
      !message.from
    ) {
      return false;
    }

    /* -----------------------------------------
       Method 1: wrapper
       ----------------------------------------- */

    if (
      typeof message.removeParticipant ===
      "function"
    ) {
      try {
        await message.removeParticipant([
          senderJid,
        ]);

        debug(
          "Participant removed using wrapper:",
          senderJid
        );

        return true;
      } catch (err) {
        debug(
          "message.removeParticipant failed:",
          err?.message || err
        );
      }
    }

    /* -----------------------------------------
       Method 2: Baileys
       ----------------------------------------- */

    if (
      message.conn &&
      typeof message.conn
        .groupParticipantsUpdate ===
        "function"
    ) {
      try {
        await message.conn.groupParticipantsUpdate(
          message.from,
          [senderJid],
          "remove"
        );

        debug(
          "Participant removed using Baileys:",
          senderJid
        );

        return true;
      } catch (err) {
        debug(
          "groupParticipantsUpdate failed:",
          err?.message || err
        );
      }
    }

    return false;
  } catch (err) {
    console.error(
      "[antilink] removeParticipant error:",
      err?.message || err
    );

    return false;
  }
}

/* =========================================================
   COMMAND
   ========================================================= */

Module({
  command: "antilink",
  aliases: ["anti-link"],
  package: "group",
  description:
    "Enable/disable AntiLink or set mode: kick, null, warn",
})(async (message, match) => {
  try {
    /* -----------------------------------------
       GROUP CHECK
       ----------------------------------------- */

    if (!message?.isGroup) {
      return await message.send?.(
        "❌ This command works only in groups."
      );
    }

    await refreshGroupInfo(message);

    /* -----------------------------------------
       GROUP ADMIN CHECK
       ----------------------------------------- */

    if (
      !(
        message?.isAdmin ||
        message?.isGroupAdmin ||
        message?.isFromMe ||
        message?.isfromMe
      )
    ) {
      return await message.send?.(
        "❌ Only group admins can use AntiLink."
      );
    }

    const botNumber =
      getBotNumberFromConn(
        message.conn
      );

    const groupJid =
      message.from;

    if (!groupJid) {
      return await message.send?.(
        "❌ Group ID not found."
      );
    }

    const raw = String(
      match || ""
    )
      .trim()
      .toLowerCase();

    const enabledKey =
      enabledKeyFor(groupJid);

    const modeKey =
      modeKeyFor(groupJid);

    const requireBotAdminForEnable = async () => {
      const botAdmin = await isCurrentBotAdmin(message);

      if (botAdmin) return true;

      await message.send?.(
        "❌ Bot is not a group admin. Make the bot Admin first, then turn AntiLink ON."
      );
      return false;
    };

    /* =====================================================
       STATUS
       ===================================================== */

    if (!raw) {
      const isEnabled =
        dbGetSafe(
          botNumber,
          enabledKey,
          false
        ) === true;

      let mode =
        String(
          dbGetSafe(
            botNumber,
            modeKey,
            "kick"
          ) || "kick"
        ).toLowerCase();

      if (
        ![
          "kick",
          "null",
          "warn",
        ].includes(mode)
      ) {
        mode = "kick";
      }

      return await message.send?.(
        `╭─〔 *ANTILINK* 〕
├─ Status: ${
          isEnabled
            ? "✅ ON"
            : "❌ OFF"
        }
├─ Mode: ${mode.toUpperCase()}
╰─➤

*Commands:*
.antilink on
.antilink off
.antilink kick
.antilink null
.antilink warn`
      );
    }

    /* =====================================================
       ON
       ===================================================== */

    if (!(await requireBotAdminForEnable())) return;

    if (
      raw === "on" ||
      raw === "enable" ||
      raw === "enabled"
    ) {
      const saved =
        dbSetSafe(
          botNumber,
          enabledKey,
          true
        );

      if (!saved) {
        return await message.send?.(
          "❌ Failed to save AntiLink setting."
        );
      }

      let mode =
        String(
          dbGetSafe(
            botNumber,
            modeKey,
            null
          ) || ""
        ).toLowerCase();

      if (
        ![
          "kick",
          "null",
          "warn",
        ].includes(mode)
      ) {
        mode = "kick";

        dbSetSafe(
          botNumber,
          modeKey,
          mode
        );
      }

      return await message.send?.(
        `╭─〔 *ANTILINK ENABLED* 〕
├─ Status: ✅ ON
├─ Mode: *${mode.toUpperCase()}*
╰─➤ Links will now be detected in this group.`
      );
    }

    /* =====================================================
       OFF
       ===================================================== */

    if (
      raw === "off" ||
      raw === "disable" ||
      raw === "disabled"
    ) {
      const saved =
        dbSetSafe(
          botNumber,
          enabledKey,
          false
        );

      if (!saved) {
        return await message.send?.(
          "❌ Failed to save AntiLink setting."
        );
      }

      return await message.send?.(
        "❌ AntiLink has been DISABLED for this group."
      );
    }

    /* =====================================================
       KICK
       ===================================================== */

    if (!(await requireBotAdminForEnable())) return;

    if (
      raw === "kick" ||
      raw === "remove"
    ) {
      dbSetSafe(
        botNumber,
        modeKey,
        "kick"
      );

      dbSetSafe(
        botNumber,
        enabledKey,
        true
      );

      return await message.send?.(
        "✅ AntiLink mode set to *KICK*.\nAntiLink is now *ON*."
      );
    }

    /* =====================================================
       NULL
       ===================================================== */

    if (!(await requireBotAdminForEnable())) return;

    if (
      raw === "null" ||
      raw === "delete"
    ) {
      dbSetSafe(
        botNumber,
        modeKey,
        "null"
      );

      dbSetSafe(
        botNumber,
        enabledKey,
        true
      );

      return await message.send?.(
        "✅ AntiLink mode set to *NULL*.\nLinks will be deleted without kicking."
      );
    }

    /* =====================================================
       WARN
       ===================================================== */

    if (!(await requireBotAdminForEnable())) return;

    if (
      raw === "warn" ||
      raw === "warning"
    ) {
      dbSetSafe(
        botNumber,
        modeKey,
        "warn"
      );

      dbSetSafe(
        botNumber,
        enabledKey,
        true
      );

      return await message.send?.(
        "✅ AntiLink mode set to *WARN*.\nAntiLink is now *ON*."
      );
    }

    /* =====================================================
       INVALID
       ===================================================== */

    return await message.send?.(
      `❌ Invalid option.

Use:

.antilink on
.antilink off
.antilink kick
.antilink null
.antilink warn`
    );
  } catch (err) {
    console.error(
      "[antilink][command] error:",
      err
    );

    try {
      await message.send?.(
        "❌ An error occurred while processing AntiLink."
      );
    } catch {}
  }
});

/* =========================================================
   ENFORCEMENT
   ========================================================= */

Module({
  on: "text",
  package: "group",
  description:
    "Automatically detect and handle links in groups",
})(async (message) => {
  try {
    /* -----------------------------------------
       BASIC CHECKS
       ----------------------------------------- */

    if (!message) {
      return;
    }

    if (!message.isGroup) {
      return;
    }

    const body =
      typeof message.body === "string"
        ? message.body.trim()
        : String(
            message.body || ""
          ).trim();

    if (!body) {
      return;
    }

    const groupJid =
      message.from;

    if (!groupJid) {
      return;
    }

    const botNumber =
      getBotNumberFromConn(
        message.conn
      );

    const enabledKey =
      enabledKeyFor(groupJid);

    const modeKey =
      modeKeyFor(groupJid);

    /* -----------------------------------------
       CHECK ENABLED
       ----------------------------------------- */

    const enabled =
      dbGetSafe(
        botNumber,
        enabledKey,
        false
      ) === true;

    if (!enabled) {
      return;
    }

    /* -----------------------------------------
       LOAD GROUP INFO
       ----------------------------------------- */

    await refreshGroupInfo(message);

    /* -----------------------------------------
       BOT ADMIN CHECK
       ----------------------------------------- */

    if (!(await isCurrentBotAdmin(message))) {
      debug(
        "Bot is not admin:",
        groupJid
      );

      return;
    }

    /* -----------------------------------------
       SENDER ADMIN CHECK
       ----------------------------------------- */

    if (
      message.isAdmin ||
      message.isGroupAdmin ||
      message.isFromMe ||
      message.isfromMe
    ) {
      debug(
        "Sender is admin/owner/bot. Ignoring."
      );

      return;
    }

    /* -----------------------------------------
       DETECT LINK
       ----------------------------------------- */

    const matches =
      body.match(LINK_REGEX);

    if (
      !matches ||
      matches.length === 0
    ) {
      return;
    }

    debug(
      "Link detected:",
      matches
    );

    /* -----------------------------------------
       SENDER
       ----------------------------------------- */

    const senderJid =
      getSenderJid(message);

    if (!senderJid) {
      debug(
        "Could not determine sender JID."
      );

      return;
    }

    const senderNum =
      getSenderNumber(
        senderJid
      );

    /* -----------------------------------------
       MODE
       ----------------------------------------- */

    let mode =
      String(
        dbGetSafe(
          botNumber,
          modeKey,
          "kick"
        ) || "kick"
      ).toLowerCase();

    if (mode === "remove") {
      mode = "kick";
    }

    if (
      ![
        "kick",
        "null",
        "warn",
      ].includes(mode)
    ) {
      mode = "kick";
    }

    debug(
      "AntiLink mode:",
      mode
    );

    /* -----------------------------------------
       DELETE LINK MESSAGE FIRST
       ----------------------------------------- */

    await deleteMessage(
      message
    );

    /* =====================================================
       NULL MODE
       ===================================================== */

    if (mode === "null") {
      try {
        await message.send?.(
          `⚠️ @${senderNum}, link removed.`,
          {
            mentions: [
              senderJid,
            ],
          }
        );
      } catch (err) {
        debug(
          "NULL notice failed:",
          err?.message || err
        );
      }

      return;
    }

    /* =====================================================
       WARN MODE
       ===================================================== */

    if (mode === "warn") {
      try {
        await message.send?.(
          `⚠️ @${senderNum}, 🤬\n\n*লিংক এর জন্য* *গ্রুপ নোটিশ গ্রুপে যেকোনো ধরনের লিংক শেয়ার করা নিষেধ।  লিংক শেয়ার করলে তাকে গ্রুপ  থেকে রিমুভ করা হতে পারে। ধন্যবাদ।*⛔.`,
          {
            mentions: [
              senderJid,
            ],
          }
        );
      } catch (err) {
        debug(
          "WARN message failed:",
          err?.message || err
        );
      }

      return;
    }

    /* =====================================================
       KICK MODE
       ===================================================== */

    if (mode === "kick") {
      try {
        await message.send?.(
          `🚫 @${senderNum}, *আরে খানকির ছেলে তুমি নাকি আবার আমার গ্রূপে লিংক চোদাও তোমার মায়ের গুদের মধ্যে ওই লিংক ভোরে দেবো গুদ ভাটকা মাগীর ছেলে লিংক চুদাতে আসলে চুদে মেরে*🖕🏻😂.`,
          {
            mentions: [
              senderJid,
            ],
          }
        );
      } catch (err) {
        debug(
          "KICK notice failed:",
          err?.message || err
        );
      }

      /* Small delay */
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            800
          )
      );

      const removed =
        await removeParticipant(
          message,
          senderJid
        );

      if (!removed) {
        try {
          await message.send?.(
            `❌ I could not remove @${senderNum}. Please make sure the bot is an admin.`,
            {
              mentions: [
                senderJid,
              ],
            }
          );
        } catch {}
      }

      return;
    }
  } catch (error) {
    console.error(
      "[antilink] enforcement error:",
      error
    );
  }
});
