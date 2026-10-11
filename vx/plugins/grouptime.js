import { Module } from "../lib/plugins.js";

/*
 * Group relative timer: one file for both automatic close and open.
 *
 * Examples:
 *   .grouptime close 1h
 *   .grouptime open 1h
 *   .groupclose 30m
 *   .groupopen 2h
 *   .grouptime status
 *   .grouptime cancel close
 */

function parseDuration(input) {
  if (!input) return null;

  const raw = String(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  const match = raw.match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(value) || value <= 0) return null;

  const multiplier = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }[unit];

  const ms = Math.round(value * multiplier);

  if (
    !Number.isSafeInteger(ms) ||
    ms > 365 * 24 * 60 * 60 * 1000
  ) {
    return null;
  }

  return ms;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";

  const totalSeconds = Math.ceil(ms / 1000);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);

  if (seconds && parts.length < 2) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ") || "0s";
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour12: true,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return new Date(ts).toISOString();
  }
}

function cleanAction(value) {
  const action = String(value || "")
    .trim()
    .toLowerCase();

  if (
    [
      "close",
      "off",
      "band",
      "बंद",
      "বন্ধ",
    ].includes(action)
  ) {
    return "close";
  }

  if (
    [
      "open",
      "on",
      "khol",
      "खोल",
      "खुल",
      "খোলা",
    ].includes(action)
  ) {
    return "open";
  }

  return null;
}

function isAdmin(message) {
  return (
    message?.isAdmin === true ||
    message?.isGroupAdmin === true ||
    message?.isOwner === true ||
    message?.isFromMe === true ||
    message?.isfromMe === true
  );
}

function isBotAdmin(message) {
  return (
    message?.isBotAdmin === true ||
    message?.botIsAdmin === true
  );
}

async function handler(message, args = "") {
  if (!message?.isGroup) {
    return message.reply(
      "❌ এই কমান্ডটি শুধুমাত্র গ্রুপে ব্যবহার করুন।"
    );
  }

  try {
    if (typeof message.loadGroupInfo === "function") {
      await message.loadGroupInfo();
    }
  } catch (error) {
    console.error(
      "[grouptime] loadGroupInfo failed:",
      error?.message || error
    );
  }

  if (!isAdmin(message)) {
    return message.reply(
      "❌ শুধুমাত্র গ্রুপ অ্যাডমিন এই কমান্ডটি ব্যবহার করতে পারবেন।"
    );
  }

  if (!isBotAdmin(message)) {
    return message.reply(
      "❌ প্রথমে Bot-কে গ্রুপের Admin করুন।"
    );
  }

  const parts = Array.isArray(args)
    ? args.map(String)
    : String(args || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

  let commandAlias = String(
    message.command || "grouptime"
  ).toLowerCase();

  let action = cleanAction(parts[0]);
  let durationText = parts[1];

  if (commandAlias === "groupclose") {
    action = "close";
    durationText = parts[0];
  }

  else if (commandAlias === "groupopen") {
    action = "open";
    durationText = parts[0];
  }

  const db = message.__grouptimeDb || null;

  if (!db) {
    return message.reply(
      "❌ Group timer database পাওয়া যাচ্ছে না।"
    );
  }

  const group = db.getGroup(message.from) || {};

  if (
    !parts.length ||
    ["status", "স্টেটাস", "অবস্থা"].includes(
      String(parts[0]).toLowerCase()
    )
  ) {
    const closeAt = Number(
      group.groupTimeCloseAt || 0
    );

    const openAt = Number(
      group.groupTimeOpenAt || 0
    );

    const now = Date.now();

    const lines = [
      "⏰ *GROUP TIME STATUS*",
      "",
      `🔒 Close: ${
        closeAt > now
          ? `*${formatDuration(
              closeAt - now
            )}* পরে (${formatDate(closeAt)})`
          : "*সেট করা নেই*"
      }`,
      `🔓 Open: ${
        openAt > now
          ? `*${formatDuration(
              openAt - now
            )}* পরে (${formatDate(openAt)})`
          : "*সেট করা নেই*"
      }`,
      "",
      "উদাহরণ:",
      "`.grouptime close 1h`",
      "`.grouptime open 1h`",
      "`.groupclose 30m`",
      "`.groupopen 2h`",
    ];

    return message.reply(
      lines.join("\n")
    );
  }

  if (
    [
      "cancel",
      "hapus",
      "remove",
      "delete",
      "বাতিল",
      "বাতিল করুন",
    ].includes(
      String(parts[0]).toLowerCase()
    )
  ) {
    const cancelAction = cleanAction(parts[1]);

    if (!cancelAction) {
      return message.reply(
        "❌ ব্যবহার করুন:\n\n" +
        "`.grouptime cancel close`\n" +
        "`.grouptime cancel open`"
      );
    }

    const key =
      cancelAction === "close"
        ? "groupTimeCloseAt"
        : "groupTimeOpenAt";

    db.setGroup(message.from, {
      [key]: null,
    });

    return message.reply(
      `✅ ${
        cancelAction === "close"
          ? "Close"
          : "Open"
      } timer বাতিল করা হয়েছে।`
    );
  }

  if (!action) {
    return message.reply(
      "❌ Action লিখুন।\n\n" +
      "`.grouptime close 1h`\n" +
      "`.grouptime open 1h`\n\n" +
      "অথবা:\n" +
      "`.groupclose 1h`\n" +
      "`.groupopen 1h`\n\n" +
      "Time: `30s`, `10m`, `1h`, `2d`"
    );
  }

  const ms = parseDuration(durationText);

  if (!ms) {
    return message.reply(
      "❌ সঠিক সময় লিখুন।\n\n" +
      "উদাহরণ:\n" +
      "`.grouptime close 1h`\n\n" +
      "Allowed:\n" +
      "`30s`\n" +
      "`10m`\n" +
      "`1h`\n" +
      "`2d`\n\n" +
      "সর্বোচ্চ 365 দিন।"
    );
  }

  const target = Date.now() + ms;

  const key =
    action === "close"
      ? "groupTimeCloseAt"
      : "groupTimeOpenAt";

  db.setGroup(message.from, {
    [key]: target,
  });

  const actionText =
    action === "close"
      ? "গ্রুপ বন্ধ"
      : "গ্রুপ খোলা";

  const emoji =
    action === "close"
      ? "🔒"
      : "🔓";

  return message.reply(
    `✅ *GROUP TIMER SET*\n\n` +
    `${emoji} Action: *${actionText}*\n` +
    `⏱️ Time: *${formatDuration(ms)}*\n` +
    `🕐 At: *${formatDate(target)} IST*\n\n` +
    `Bot সেই সময়ে স্বয়ংক্রিয়ভাবে ${
      action === "close"
        ? "গ্রুপ বন্ধ"
        : "গ্রুপ খুলে"
    } দেবে।`
  );
}

Module({
  command: "grouptime",

  aliases: [
    "groupclose",
    "groupopen",
    "gt",
  ],

  package: "group",

  description:
    "সময় নির্ধারণ করে গ্রুপ স্বয়ংক্রিয়ভাবে বন্ধ/খুলুন",

  isGroup: true,

  isAdmin: true,

  isBotAdmin: true,

})(async (message, args = "") => {
  try {
    const {
      getDatabase,
    } = await import(
      "../lib/miku-legacy.js"
    );

    const db = getDatabase(message);

    message.__grouptimeDb = db;

    return handler(
      message,
      args
    );

  } catch (error) {

    console.error(
      "[grouptime] Error:",
      error?.stack ||
        error?.message ||
        error
    );

    return message.reply(
      `❌ Group timer error: ${
        error?.message || error
      }`
    );
  }
});