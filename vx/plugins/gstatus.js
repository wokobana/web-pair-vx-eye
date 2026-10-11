import { Module } from "../lib/plugins.js";
import fs from "fs";
import path from "path";
import {
  makeGroupStatusContent,
  sendGroupStatus,
  styleTextContent,
  randomIndex,
  isOwnerMessage,
  describeContent,
} from "./groupstatus.js";


const DEL_GC_STATUS_DB = path.join(process.cwd(), "data", "delgcstatus.json");

function rememberLastGroupStatus(groupId, key) {
  try {
    if (!groupId || !key?.id) return;
    fs.mkdirSync(path.dirname(DEL_GC_STATUS_DB), { recursive: true });
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(DEL_GC_STATUS_DB, "utf8")) || {};
    } catch {}
    data[groupId] = {
      key: {
        remoteJid: key.remoteJid || groupId,
        id: key.id,
        fromMe: key.fromMe !== false,
        participant: key.participant || undefined,
      },
      savedAt: Date.now(),
    };
    fs.writeFileSync(DEL_GC_STATUS_DB, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("[gstatus] failed to remember last status:", e?.message || e);
  }
}

/*
|--------------------------------------------------------------------------
| GSTATUS  (.gstatus / .gs / .groupstatus / .gcstatus)
|--------------------------------------------------------------------------
| Posts a Group Status in the CURRENT group.
|   .gcstatus Hello                 -> text status (new random colour every time)
|   .gcstatus #ff0000 Hello         -> text status with your own colour
|   .gcstatus bg:laal font:2 Hello  -> colour + font
|   reply photo/video/audio + .gcstatus [caption]
|   send photo/video with caption .gcstatus
|--------------------------------------------------------------------------
*/

Module({
  command: "gstatus",
  aliases: ["gs", "groupstatus", "gcstatus"],
  package: "group",
  description: "Send photo, video, audio or text as Group Status",
  usage: ".gstatus <text> or reply to media + .gstatus <caption>",
})(async (message, match = "") => {
  try {
    if (!message.isGroup) {
      return message.send("❌ This command can only be used inside a group.");
    }

    if (!isOwnerMessage(message)) {
      return message.send("❌ Only the bot owner can set a Group Status.");
    }

    const caption = String(match || "").trim();
    const content = await makeGroupStatusContent(message, caption);

    if (!content) {
      return message.send(
        "❌ Reply to a photo/video/audio and type .gstatus, or use .gstatus <text>.\n\n" +
          "🎨 Colour: .gstatus #ff0000 Hello  |  .gstatus bg:red Hello"
      );
    }

    await message.react?.("⏳");

    const targetGroup = message?.from || message?.key?.remoteJid;
    if (!targetGroup) throw new Error("Group JID not found.");

    // Text statuses get a fresh background colour on every post.
    const payload = styleTextContent(content, randomIndex());

    const result = await sendGroupStatus(message.conn, targetGroup, payload);
    if (!result?.messageId && !result?.key?.id) {
      throw new Error("Group status message was not generated.");
    }

    // Save the generated message key so .delgcstatus can remove the
    // bot owner's most recently posted Group Status in this group.
    rememberLastGroupStatus(targetGroup, result?.key || {
      remoteJid: targetGroup,
      id: result?.messageId,
      fromMe: true,
    });

    await message.react?.("✅");
    const info = describeContent(payload);
    return message.send(`✅ *Group status.*\n> ${info.icon} ${info.label} posted`);
  } catch (error) {
    console.error("[gstatus]", error);
    await message.react?.("❌");
    return message.send(`❌ *Failed to set group status*\n\n${error?.message || error}`);
  }
});
