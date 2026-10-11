import { Module } from "../lib/plugins.js";
import fs from "fs";
import path from "path";
import { isOwnerMessage } from "./groupstatus.js";

const DB = path.join(process.cwd(), "data", "delgcstatus.json");

function loadLastStatus(groupId) {
  try {
    if (!groupId || !fs.existsSync(DB)) return null;
    const data = JSON.parse(fs.readFileSync(DB, "utf8")) || {};
    return data?.[groupId]?.key || null;
  } catch (error) {
    console.error("[delgcstatus] DB read failed:", error?.message || error);
    return null;
  }
}

function clearLastStatus(groupId) {
  try {
    if (!groupId || !fs.existsSync(DB)) return;
    const data = JSON.parse(fs.readFileSync(DB, "utf8")) || {};
    delete data[groupId];
    fs.writeFileSync(DB, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("[delgcstatus] DB clear failed:", error?.message || error);
  }
}

function getQuotedKey(message) {
  return (
    message?.quoted?.key ||
    message?.quoted?.message?.key ||
    message?.quoted?.raw?.key ||
    null
  );
}

/*
 * The sender of the quoted message. Needed because deleting SOMEONE ELSE'S
 * message in a group requires the delete key to carry `participant`
 * (the original sender's JID) — without it WhatsApp/Baileys will refuse
 * the delete (or silently no-op) for anything that isn't fromMe.
 */
function getQuotedParticipant(message) {
  const list = [
    message?.quoted?.key?.participant,
    message?.quoted?.participant,
    message?.quoted?.sender,
    message?.quoted?.message?.key?.participant,
    message?.quoted?.raw?.key?.participant,
  ];
  // Ignore the group JID (serialize falls back to it when participant is missing)
  return list.find((j) => j && !String(j).endsWith("@g.us")) || null;
}

function isSameGroup(key, groupId) {
  return Boolean(key?.remoteJid && key.remoteJid === groupId);
}

/* Normalizes a JID by stripping the ":device" suffix Baileys sometimes adds
 * (e.g. "1234567890:12@s.whatsapp.net" -> "1234567890@s.whatsapp.net"). */
function normalizeJid(jid) {
  if (!jid) return jid;
  return jid.split(":")[0] + (jid.includes("@") ? "@" + jid.split("@")[1] : "");
}

/*
 * Checks whether the bot itself is an admin/superadmin in the group.
 * Deleting another participant's message for everyone only works when the
 * bot account has admin rights in that group.
 */
async function isBotGroupAdmin(message, groupId) {
  try {
    // FIX: message.isBotAdmin is ALWAYS false until loadGroupInfo() runs.
    // Earlier code returned that default `false` immediately, so the bot
    // said "not admin" even when it really was admin. Load fresh info first.
    if (typeof message?._refreshCache === "function") {
      await message._refreshCache();
    } else if (typeof message?.loadGroupInfo === "function") {
      await message.loadGroupInfo();
    }
    if (message?.isBotAdmin === true) return true;

    // Fallback: compare every bot identity (PN jid + LID + number) against
    // every admin participant identity.
    const metadata =
      (await message?.conn?.groupMetadata?.(groupId)) ||
      message?.groupMetadata ||
      null;
    if (!metadata?.participants) return false;

    const user = message?.conn?.user || {};
    const botIds = [user.id, user.jid, user.lid, user.phoneNumber]
      .filter(Boolean)
      .map(normalizeJid);
    const botNums = botIds.map((j) => String(j).split("@")[0].replace(/\D/g, "")).filter(Boolean);

    const me = metadata.participants.find((p) => {
      if (!p?.admin && p?.isAdmin !== true && p?.isSuperAdmin !== true) return false;
      const ids = [p?.id, p?.jid, p?.lid, p?.phoneNumber, p?.participantPn]
        .filter(Boolean)
        .map(normalizeJid);
      return ids.some(
        (id) =>
          botIds.includes(id) ||
          botNums.includes(String(id).split("@")[0].replace(/\D/g, ""))
      );
    });

    return Boolean(me);
  } catch (error) {
    console.error("[delgcstatus] admin check failed:", error?.message || error);
    return false;
  }
}

/*
|--------------------------------------------------------------------------
| DELGCSTATUS  (.delgcstatus / .delgstatus / .delstatus)
|--------------------------------------------------------------------------
| Deletes a Group Status message from the CURRENT group.
|
| 1. Reply to ANY Group Status posted in the group (bot's own OR a
|    member's) and send:
|      .delgcstatus
|
|    - If it's the bot's own status: deleted directly.
|    - If it's a member's status: the bot must be a group ADMIN; the
|      delete is then sent as an admin-revoke for that participant.
|
| 2. Or simply send (no reply):
|      .delgcstatus
|    This removes the most recently posted Group Status by the bot in
|    the current group (the key is saved automatically by .gstatus).
|
| IMPORTANT:
| This deletes the Group Status message posted inside the group chat.
| It does not delete a person's private WhatsApp Status/About, and it
| cannot delete a member's status if the bot is not a group admin
| (WhatsApp itself does not allow that).
|--------------------------------------------------------------------------
*/

Module({
  command: "delgcstatus",
  aliases: ["delgstatus", "delstatus", "dgs"],
  package: "group",
  description: "Delete a Group Status (bot's own or a member's) in the current group",
  usage: ".delgcstatus or reply to a Group Status + .delgcstatus",
})(async (message) => {
  try {
    if (!message.isGroup) {
      return message.send("❌ This command can only be used inside a group.");
    }

    // Group ke saare admins aur bot owner (jisne bot connect kiya) use kar sakte hain.
    // Owner ka group admin hona zaruri nahi.
    try { await message.loadGroupInfo?.(); } catch {}
    if (!message.isAdmin && !isOwnerMessage(message)) {
      return message.send("❌ Only group admins or the bot owner can use .delgcstatus.");
    }

    const groupId = message?.from || message?.key?.remoteJid;
    if (!groupId) {
      return message.send("❌ Group JID not found.");
    }

    // If the command is a reply, prefer the exact replied status.
    const quotedKey = getQuotedKey(message);
    let targetKey = null;
    let isOwnStatus = true;

    if (quotedKey && isSameGroup(quotedKey, groupId)) {
      targetKey = { ...quotedKey };
      isOwnStatus = quotedKey.fromMe !== false;

      if (!isOwnStatus) {
        // Deleting someone else's message needs their JID attached.
        const participant = getQuotedParticipant(message);
        if (!participant) {
          return message.send(
            "❌ *उस status का sender पता नहीं चल पाया।*\n\n" +
            "Reply करते वक्त direct status message पर reply करें, " +
            "forwarded/edited message पर नहीं।"
          );
        }
        targetKey.participant = participant;
        targetKey.fromMe = false;
      }
    } else {
      // No reply -> only fall back to the bot's own last posted status.
      targetKey = loadLastStatus(groupId);
      isOwnStatus = true;
    }

    if (!targetKey?.id) {
      return message.send(
        "❌ No Group Status found to delete.\n\n" +
        "Reply to a Group Status and send *.delgcstatus*, " +
        "or use *.delgcstatus* after posting with *.gstatus*."
      );
    }

    // If it's a member's status, the bot must be a group admin to delete it.
    if (!isOwnStatus) {
      const botIsAdmin = await isBotGroupAdmin(message, groupId);
      if (!botIsAdmin) {
        return message.send(
          "❌ *Member का status delete नहीं हो सकता.*\n\n" +
          "इसके लिए bot को इस group में *admin* होना जरूरी है " +
          "(WhatsApp खुद यही restriction लगाता है)।"
        );
      }
    }

    targetKey.remoteJid = targetKey.remoteJid || groupId;

    await message.react?.("⏳");

    await message.conn.sendMessage(groupId, {
      delete: targetKey,
    });

    // If we deleted the remembered last (bot) status, clear it.
    if (isOwnStatus) {
      const saved = loadLastStatus(groupId);
      if (saved?.id === targetKey.id) {
        clearLastStatus(groupId);
      }
    }

    await message.react?.("✅");
    return message.send(
      isOwnStatus
        ? "🗑️ *Group Status deleted successfully.*"
        : "🗑️ *Member का Group Status delete कर दिया गया.*"
    );
  } catch (error) {
    console.error("[delgcstatus]", error);
    await message.react?.("❌");
    return message.send(
      "❌ *Failed to delete Group Status*\n\n" +
      (error?.message || error)
    );
  }
});
