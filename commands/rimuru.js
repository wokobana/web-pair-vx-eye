// ============================================================================
//  RimuruMD v4.8 se laye gaye commands (Miku format me, kaam same):
//  acc, accall, antibot, antispam, bangroup, online, publicgc, publicgroup,
//  selfgc, selfgroup, setbye, bye, tagadmin, upsw, upstory, setowner
//  (antibot / antispam ka detection lib/guards.js me hai)
// ============================================================================
const path = require('path');
const { pathToFileURL } = require('url');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const config = require('../config');
const db = require('../lib/db');

const G = { category: 'group', group: 1 };
const errText = (x, e) => `❌ *ɢᴀɢᴀʟ*\n\n> Terjadi error pada \`${x.prefix}${x.cmd}\`\n> ${e?.message || e}`;

// ---- cooldown (Rimuru ke cooldown jaisa) ----
const cd = new Map();
function cooldown(x, sec) {
  const k = `${x.cmd}:${x.sender}`;
  const left = (cd.get(k) || 0) + sec * 1000 - Date.now();
  if (left > 0 && !x.isOwner) { x.reply(`⏳ Tunggu ${Math.ceil(left / 1000)} detik lagi.`); return true; }
  cd.set(k, Date.now());
  return false;
}

// ============================ ACC / ACCALL ============================
function formatDate(timestamp) {
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(timestamp * 1000));
}

async function accRun(x) {
  const sub = x.args[0]?.toLowerCase();
  const option = x.args.slice(1).join(' ')?.trim() || '';
  const sock = x.sock;

  if (!sub || !['list', 'approve', 'reject'].includes(sub)) {
    return x.reply(
      `📋 *ᴊᴏɪɴ ʀᴇQᴜᴇsᴛ ᴍᴀɴᴀɢᴇʀ*\n\n` +
      `╭┈┈⬡「 📌 *ᴄᴏᴍᴍᴀɴᴅ* 」\n` +
      `┃ ${x.prefix}${x.cmd} list\n` +
      `┃ ${x.prefix}${x.cmd} approve all\n` +
      `┃ ${x.prefix}${x.cmd} reject all\n` +
      `┃ ${x.prefix}${x.cmd} approve 1|2|3\n` +
      `┃ ${x.prefix}${x.cmd} reject 1|2|3\n` +
      `╰┈┈┈┈┈┈┈┈⬡`
    );
  }

  await x.react('🕕');
  try {
    const pendingList = await sock.groupRequestParticipantsList(x.jid);
    if (!pendingList?.length) {
      await x.react('📭');
      return x.reply(`📭 Tidak ada permintaan masuk yang tertunda.`);
    }

    if (sub === 'list') {
      let text = `📋 *ᴅᴀꜰᴛᴀʀ ᴘᴇʀᴍɪɴᴛᴀᴀɴ ᴍᴀsᴜᴋ*\n\n> Total: ${pendingList.length} permintaan\n\n`;
      for (let i = 0; i < pendingList.length; i++) {
        const req = pendingList[i];
        const number = (req.phone_number || req.jid)?.split('@')[0] || 'Unknown';
        const method = req.request_method || '-';
        const time = req.request_time ? formatDate(req.request_time) : '-';
        text += `*${i + 1}.* @${number}\n   📱 ${number}\n   📨 ${method}\n   🕐 ${time}\n\n`;
      }
      text += `> Gunakan \`${x.prefix}${x.cmd} approve all\` atau \`${x.prefix}${x.cmd} reject all\``;
      await x.react('📋');
      return x.reply(text, { mentions: pendingList.map((r) => r.jid) });
    }

    const action = sub;
    const label = action === 'approve' ? 'Diterima' : 'Ditolak';
    const okStatus = (r) => r.status === '200' || !r.status || r.status === 200;

    if (option === 'all') {
      const jids = pendingList.map((r) => r.jid);
      const results = await sock.groupRequestParticipantsUpdate(x.jid, jids, action);
      const success = results.filter(okStatus).length;
      await x.react('✅');
      return x.reply(
        `✅ *${label.toUpperCase()} SEMUA*\n\n> ✅ Berhasil: ${success}\n> ❌ Gagal: ${results.length - success}\n> 📊 Total: ${results.length}`
      );
    }

    const indices = option.split('|').map((n) => parseInt(n.trim()) - 1).filter((n) => !isNaN(n) && n >= 0 && n < pendingList.length);
    if (!indices.length) {
      await x.react('❌');
      return x.reply(
        `❌ Nomor tidak valid.\n\n> Gunakan \`${x.prefix}${x.cmd} list\` untuk melihat daftar.\n> Contoh: \`${x.prefix}${x.cmd} ${action} 1|2|3\``
      );
    }

    let text = '';
    let successCount = 0;
    const targets = indices.map((i) => pendingList[i]);
    for (const target of targets) {
      const number = (target.phone_number || target.jid).split('@')[0];
      try {
        const result = await sock.groupRequestParticipantsUpdate(x.jid, [target.jid], action);
        const ok = okStatus(result[0] || {});
        text += `${ok ? '✅' : '❌'} ${number} — ${ok ? label : 'Gagal'}\n`;
        if (ok) successCount++;
      } catch {
        text += `❌ ${number} — Error\n`;
      }
    }
    await x.react('✅');
    return x.reply(`📋 *ʜᴀsɪʟ ${label.toUpperCase()}*\n\n${text}\n> ✅ ${successCount}/${targets.length} berhasil`);
  } catch (e) {
    await x.react('☢');
    return x.reply(errText(x, e));
  }
}

// ============================ ANTIBOT ============================
function antibotRun(x) {
  const arg = x.args[0]?.toLowerCase();
  const g = db.group(x.session, x.jid);
  const cur = !!g.antibot;

  if (!arg || arg === 'status') {
    return x.reply(
      `🤖 *AntiBot*\n\n> Status: ${cur ? '✅ Aktif' : '❌ Nonaktif'}\n\n> Deteksi: *Smart Heuristic*\n\n> \`.antibot on/off\``
    );
  }
  if (arg === 'on') { db.setGroup(x.session, x.jid, 'antibot', true); x.react('✅'); return x.reply(`✅ *AntiBot diaktifkan*`); }
  if (arg === 'off') { db.setGroup(x.session, x.jid, 'antibot', false); x.react('❌'); return x.reply(`❌ *AntiBot dinonaktifkan*`); }
  return x.reply(`❌ Gunakan \`.antibot on\` atau \`.antibot off\``);
}

// ============================ ANTISPAM ============================
function antispamRun(x) {
  const action = x.args[0]?.toLowerCase();
  const delayMatch = action?.match(/^(\d+)(s|ms)?$/);

  if (!action || (!['on', 'off', 'warning', 'kick', 'delete'].includes(action) && !delayMatch)) {
    return x.reply(
      `🛡️ *ANTI SPAM GROUP*\n\n` +
      `Fitur ini melindungi grup dari member yang mengirim pesan berulang-ulang dengan sangat cepat dan brutal sehingga mengganggu kenyamanan member lain\n\n` +
      `*Cara pakai:*\n` +
      `> \`${x.prefix}antispam on\` (Aktifkan fitur antispam)\n` +
      `> \`${x.prefix}antispam off\` (Matikan fitur antispam)\n\n` +
      `*Pilih Metode Hukuman:*\n` +
      `> \`${x.prefix}antispam warning\` (Beri teguran keras hingga 3 kali peringatan)\n` +
      `> \`${x.prefix}antispam kick\` (Otomatis tendang spammer langsung tanpa ampun)\n` +
      `> \`${x.prefix}antispam delete\` (Hapus seluruh pesan spam yang dikirimkan)\n\n` +
      `*Atur Sensitivitas Jeda (Delay):*\n` +
      `> \`${x.prefix}antispam 2\` (Set jarak antar pesan maksimal 2 detik)\n` +
      `> \`${x.prefix}antispam 1500\` (Set jarak ke 1500 milidetik)`
    );
  }

  const g = db.group(x.session, x.jid);

  if (delayMatch) {
    let delayMs = parseInt(delayMatch[1]);
    if (delayMatch[2] === 's' || (delayMs >= 1 && delayMs <= 10)) delayMs *= 1000;
    if (delayMs < 500) delayMs = 500;
    if (delayMs > 10000) delayMs = 10000;
    db.setGroup(x.session, x.jid, 'antispamDelay', delayMs);
    return x.reply(
      `🛡️ *SENSITIVITAS ANTI SPAM DIPERBARUI*\n\n> Jeda Maksimal: *${delayMs} ms* (${(delayMs / 1000).toFixed(1)} detik)\n\n` +
      `Sistem kini akan menganggap pesan sebagai spam jika anggota mengirim beberapa pesan dengan jeda di bawah *${(delayMs / 1000).toFixed(1)} detik* antar pesannya`
    );
  }

  if (action === 'on' || action === 'off') {
    const isEnable = action === 'on';
    if (!!g.antispam === isEnable) {
      return x.reply(`✅ Fitur antispam sudah ${isEnable ? 'aktif' : 'nonaktif'} di grup ini, tidak ada perubahan yang dibuat`);
    }
    db.setGroup(x.session, x.jid, 'antispam', isEnable);
    return x.reply(
      `🛡️ *ANTI SPAM DIPERBARUI*\n\n> Status: *${isEnable ? 'AKTIF ✅' : 'NONAKTIF ❌'}*\n\n` +
      `Sistem bot kini akan ${isEnable ? 'mengawasi secara ketat' : 'berhenti mengawasi'} setiap aktivitas spam atau flood pesan yang dilakukan oleh member di dalam grup ini`
    );
  }

  db.setGroup(x.session, x.jid, 'antispamAction', action);
  const textAction = { warning: 'Memberikan peringatan keras secara bertahap', kick: 'Menendang member yang membandel secara otomatis', delete: 'Menghapus pesan spam yang mengganggu' }[action];
  return x.reply(
    `🛡️ *AKSI ANTI SPAM DIPERBARUI*\n\n> Metode Hukuman: *${action.toUpperCase()}*\n\n` +
    `Sistem bot akan langsung mengambil tindakan berupa *${textAction}* apabila ada member yang terdeteksi melakukan pelanggaran berupa tindakan spam brutal`
  );
}

// ============================ BANGROUP ============================
async function banRun(x) {
  const isUnban = ['unbanchat', 'unbangroup'].includes(x.cmd);
  try {
    const groupName = x.meta?.subject || 'Unknown';
    const g = db.group(x.session, x.jid);

    if (isUnban) {
      if (!g.isBanned) {
        return x.reply(`⚠️ *ɢʀᴜᴘ ᴛɪᴅᴀᴋ ᴅɪʙᴀɴ*\n\n> Grup ini tidak dalam status banned.\n> Semua user bisa menggunakan bot.`);
      }
      db.setGroup(x.session, x.jid, 'isBanned', false);
      return x.reply(
        `✅ *ɢʀᴜᴘ ᴅɪ-ᴜɴʙᴀɴ*\n\n╭┈┈⬡「 📋 *ᴅᴇᴛᴀɪʟ* 」\n┃ 📛 ɢʀᴜᴘ: *${groupName}*\n┃ 📊 sᴛᴀᴛᴜs: *✅ AKTIF*\n┃ 👤 ᴜɴʙᴀɴ ᴏʟᴇʜ: @${x.sender.split('@')[0]}\n╰┈┈⬡\n\n> Semua member sekarang bisa menggunakan bot kembali.`,
        { mentions: [x.sender] }
      );
    }

    if (g.isBanned) {
      return x.reply(`⚠️ *ɢʀᴜᴘ sᴜᴅᴀʜ ᴅɪʙᴀɴ*\n\n> Grup ini sudah dalam status banned.\n> Gunakan \`.unbanchat\` untuk membuka akses.`);
    }
    db.setGroup(x.session, x.jid, 'isBanned', true);
    return x.reply(
      `🚫 *ɢʀᴜᴘ ᴅɪʙᴀɴ*\n\n╭┈┈⬡「 📋 *ᴅᴇᴛᴀɪʟ* 」\n┃ 📛 ɢʀᴜᴘ: *${groupName}*\n┃ 📊 sᴛᴀᴛᴜs: *🔴 BANNED*\n┃ 👤 ʙᴀɴ ᴏʟᴇʜ: @${x.sender.split('@')[0]}\n╰┈┈⬡\n\n> Member biasa tidak bisa menggunakan bot di grup ini.\n> Hanya owner yang bisa menggunakan bot.`,
      { mentions: [x.sender] }
    );
  } catch (e) {
    return x.reply(errText(x, e));
  }
}

// ============================ ONLINE ============================
async function onlineRun(x) {
  if (cooldown(x, 60)) return;
  x.react('🔍');
  const sock = x.sock;
  try {
    const participants = x.meta?.participants || [];
    if (participants.length === 0) {
      x.react('❌');
      return x.reply(`❌ *ɢᴀɢᴀʟ*\n\n> Tidak bisa mendapatkan data member grup`);
    }
    await x.reply(`🔍 *ᴍᴇɴᴄᴀʀɪ ᴍᴇᴍʙᴇʀ ᴏɴʟɪɴᴇ...*\n\n> Menunggu response dari ${participants.length} member\n> Estimasi: 5-10 detik`);

    const presences = {};
    const presenceHandler = (update) => {
      if (update.id === x.jid && update.presences) {
        for (const [jid, presence] of Object.entries(update.presences)) {
          if (['available', 'composing', 'recording'].includes(presence.lastKnownPresence)) presences[jid] = presence.lastKnownPresence;
        }
      }
    };
    sock.ev.on('presence.update', presenceHandler);

    const batchSize = 10;
    for (let i = 0; i < participants.length; i += batchSize) {
      await Promise.all(participants.slice(i, i + batchSize).map((p) => sock.presenceSubscribe(p.id).catch(() => {})));
      await new Promise((r) => setTimeout(r, 500));
    }
    await new Promise((r) => setTimeout(r, 5000));
    sock.ev.off('presence.update', presenceHandler);

    const onlineMembers = Object.keys(presences);
    let text = `📊 *ᴄᴇᴋ ᴏɴʟɪɴᴇ*\n\n╭┈┈⬡「 📋 *ɪɴꜰᴏ ɢʀᴜᴘ* 」\n`;
    text += `┃ 👥 ɴᴀᴍᴀ: *${x.meta.subject}*\n┃ 👤 ᴛᴏᴛᴀʟ: \`${participants.length}\` member\n┃ 🟢 ᴏɴʟɪɴᴇ: \`${onlineMembers.length}\` member\n╰┈┈⬡\n\n`;

    if (onlineMembers.length === 0) {
      text += `> _Tidak ada member yang terdeteksi online_\n> _Pastikan member telah membuka WA_`;
    } else {
      text += `╭┈┈⬡「 🟢 *ᴍᴇᴍʙᴇʀ ᴏɴʟɪɴᴇ* 」\n`;
      let count = 0;
      for (const jid of onlineMembers) {
        if (count >= 50) { text += `┃ ... dan ${onlineMembers.length - 50} member lainnya\n`; break; }
        const participant = participants.find((p) => [p.id, p.jid, p.lid, p.phoneNumber].includes(jid));
        const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
        let icon = '🟢';
        if (presences[jid] === 'composing') icon = '⌨️';
        if (presences[jid] === 'recording') icon = '🎤';
        text += `┃ ${icon} @${jid.split('@')[0]}${isAdmin ? ' 👑' : ''}\n`;
        count++;
      }
      text += `╰┈┈⬡\n\n> 🟢 Online | ⌨️ Mengetik | 🎤 Rekam Audio`;
    }
    x.react('✅');
    return x.reply(text, { mentions: onlineMembers });
  } catch (e) {
    x.react('☢');
    return x.reply(errText(x, e));
  }
}

// ============================ PUBLICGC / SELFGC ============================
const getModeLists = (x) => ({
  self: db.getG(x.session, 'selfGroups', []) || [],
  pub: db.getG(x.session, 'publicGroups', []) || [],
});

function publicRun(x) {
  const { self, pub } = getModeLists(x);
  if (pub.includes(x.jid) && !self.includes(x.jid)) {
    return x.reply(`ℹ️ *ɢʀᴜᴘ ɪɴɪ sᴜᴅᴀʜ ᴍᴏᴅᴇ ᴘᴜʙʟɪᴄ*\n\n> Bot merespon semua member di grup ini\n\n_Gunakan ${x.prefix}selfthisgc untuk menutup akses_`);
  }
  db.setG(x.session, 'selfGroups', self.filter((id) => id !== x.jid));
  if (!pub.includes(x.jid)) db.setG(x.session, 'publicGroups', [...pub, x.jid]);
  x.react('🌐');
  return x.reply(
    `🌐 *ᴍᴏᴅᴇ ᴘᴜʙʟɪᴄ ᴅɪᴀᴋᴛɪꜰᴋᴀsɪ*\n\n> Bot sekarang merespon semua member di grup ini\n> Override mode global aktif untuk grup ini\n\n📋 *Grup lain tidak terpengaruh*\n\n_Gunakan ${x.prefix}selfthisgc untuk menutup akses lagi_`
  );
}

function selfRun(x) {
  const { self, pub } = getModeLists(x);
  if (self.includes(x.jid)) {
    return x.reply(`ℹ️ *ɢʀᴜᴘ ɪɴɪ sᴜᴅᴀʜ ᴍᴏᴅᴇ sᴇʟꜰ*\n\n> Bot hanya merespon owner & bot sendiri\n\n_Gunakan ${x.prefix}publicthisgc untuk membuka akses_`);
  }
  db.setG(x.session, 'selfGroups', [...self, x.jid]);
  db.setG(x.session, 'publicGroups', pub.filter((id) => id !== x.jid));
  x.react('🔒');
  return x.reply(
    `🔒 *ᴍᴏᴅᴇ sᴇʟꜰ ᴀᴋᴛɪꜰ*\n\n> Bot di grup ini sekarang hanya merespon:\n> • Owner bot\n> • Bot sendiri (fromMe)\n\n📋 *Grup lain tidak terpengaruh*\n\n_Gunakan ${x.prefix}publicthisgc untuk membuka akses lagi_`
  );
}

// ============================ SETBYE ============================
async function setbyeRun(x) {
  if (!x.rest) return x.reply(`Teksnya Mana..\nContoh:\nSelamat Tinggal Beban @user`);
  // Rimuru me "@user" tha — VX goodbye me yehi "&mention" hai
  const text = x.rest.replace(/@user/gi, '&mention');
  try {
    const { db: vxdb } = await import(pathToFileURL(path.join(__dirname, '..', 'vx', 'lib', 'client.js')).href);
    const bn = String(x.sock.user?.id || '').split(':')[0].split('@')[0] || 'bot';
    for (const key of [`group:${x.jid}:goodbye`, `group:${x.jid}:goodbye2`]) {
      const cur = (await vxdb.getAsync(bn, key, null)) || {};
      await vxdb.set(bn, key, { ...cur, customText: text });
    }
    // purana Miku goodbye text bhi same rakho
    db.setGroup(x.session, x.jid, 'goodbyeMsg', x.rest.replace(/@user/gi, '@user'));
  } catch (e) {
    console.error('[setbye]', e?.message || e);
    return x.reply('❌ Bye save nahi hua: ' + (e?.message || e));
  }
  return x.reply('Bye Berhasil Diatur...\n@user [mention]');
}

// ============================ BYE (LEAVE) ============================
const extractInviteCode = (text) => {
  for (const re of [/chat\.whatsapp\.com\/([a-zA-Z0-9]{20,})/i, /wa\.me\/([a-zA-Z0-9]{20,})/i]) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
};

async function byeRun(x) {
  const input = x.args.join(' ').trim();
  let target = null;
  let groupName = '';

  if (!input && x.isGroup) {
    target = x.jid;
    groupName = x.meta?.subject || 'Grup ini';
  } else if (input) {
    const code = extractInviteCode(input);
    if (!code) return x.reply(`❌ *ɢᴀɢᴀʟ*\n\n> Link invite tidak valid`);
    try {
      const info = await x.sock.groupGetInviteInfo(code);
      target = info.id;
      groupName = info.subject || 'Unknown';
    } catch {
      return x.reply(`❌ *ɢᴀɢᴀʟ*\n\n> Tidak dapat mengambil info grup dari link`);
    }
  } else {
    return x.reply(
      `🚪 *ʟᴇᴀᴠᴇ ɢʀᴜᴘ*\n\n╭┈┈⬡「 📋 *ᴄᴀʀᴀ ᴘᴀᴋᴀɪ* 」\n┃ ◦ Di grup: \`.leave\`\n┃ ◦ Via link: \`.leave <link>\`\n╰┈┈⬡\n\n\`Contoh: ${x.prefix}leave https://chat.whatsapp.com/xxx\``
    );
  }
  if (!target) return x.reply(`❌ *ɢᴀɢᴀʟ*\n\n> Grup tidak ditemukan`);

  await x.react('🕕');
  try {
    if (x.isGroup && target === x.jid) {
      await x.sock.sendMessage(x.jid, {
        text: `👋 *ɢᴏᴏᴅʙʏᴇ*\n\n> Bot akan keluar dari grup ini.\n> Terima kasih sudah menggunakan bot!`,
        contextInfo: {
          forwardingScore: 9999, isForwarded: true,
          forwardedNewsletterMessageInfo: { newsletterJid: config.channelJid, newsletterName: config.channelName || config.botName, serverMessageId: 127 },
        },
      });
    }
    await x.sock.groupLeave(target);
    if (!x.isGroup || target !== x.jid) {
      await x.react('✅');
      await x.reply(`✅ *ʙᴇʀʜᴀsɪʟ ᴋᴇʟᴜᴀʀ*\n\n> Bot telah keluar dari: *${groupName}*`);
    }
  } catch (e) {
    await x.react('☢');
    await x.reply(errText(x, e));
  }
}

// ============================ TAGADMIN ============================
async function tagadminRun(x) {
  const admins = (x.meta?.participants || []).filter((v) => v.admin).map((v) => v.id);
  if (!admins.length) return x.reply('…adminnya hilang? aneh.');
  const alasan = x.rest ? `\n\nalasan: ${x.rest}` : '';
  let teks = `🎸 *tag admin dulu deh...*\n\n`;
  teks += admins.map((v) => `@${v.split('@')[0]}`).join('\n');
  teks += `${alasan}\n\n_...cepet respon ya._`;
  return x.sock.sendMessage(x.jid, { text: teks, mentions: admins }, { quoted: x.m });
}

// ============================ UPSW / UPSTORY (group story, border hijau) ============================
let gsMod = null;
const loadGs = async () => (gsMod ||= await import(pathToFileURL(path.join(__dirname, '..', 'vx', 'plugins', 'groupstatus.js')).href));

const isImgVid = (t) => t === 'imageMessage' || t === 'videoMessage';
const dlQuoted = (x) => downloadMediaMessage(
  { key: x.quoted.key, message: x.quoted.message }, 'buffer', {},
  { logger: pino({ level: 'silent' }), reuploadRequest: x.sock.updateMediaMessage }
);

async function upswRun(x) {
  if (cooldown(x, 10)) return;
  const text = x.rest || '';
  let content = {};
  try {
    if (x.quoted && isImgVid(x.quoted.mtype)) {
      const buffer = await dlQuoted(x);
      content = x.quoted.mtype === 'imageMessage' ? { image: buffer, caption: text } : { video: buffer, caption: text };
    } else if (isImgVid(x.mtype)) {
      const d = await x.download();
      content = x.mtype === 'imageMessage' ? { image: d.buffer, caption: text } : { video: d.buffer, caption: text };
    } else if (text) {
      content = { text, font: 0, backgroundColor: '#FF2E63' };
    } else {
      return x.reply(
`╭━━━〔 💗 RIMURU GROUP STORY 💗 〕━━⬣
┃
┃ Darling kirim sesuatu dong~
┃
┃ Cara pakai :
┃
┃ .upsw teks
┃ reply gambar .upsw
┃ reply video .upsw
┃
╰━━━━━━━━━━━━━━━━⬣`);
    }

    const gs = await loadGs();
    await gs.sendGroupStatus(x.sock, x.jid, content);

    return x.reply(
`╭━━━〔 💗 RIMURU STORY 💗 〕━━⬣
┃
┃ 📡 Story grup berhasil dipost~
┃
┃ Sekarang icon grup
┃ punya border hijau 😳
┃
╰━━━━━━━━━━━━━━━━⬣`);
  } catch (e) {
    console.error('[upsw]', e?.message || e);
    return x.reply(
`╭━━━〔 ❌ ERROR 〕━━⬣
┃
┃ Gagal upload story
┃ coba lagi ya darling
┃ ${String(e?.message || e).slice(0, 80)}
╰━━━━━━━━━━━━━━━━⬣`);
  }
}

// ============================ SETOWNER (addowner / delowner / ownerlist) ============================
const digits = (v) => String(v || '').replace(/[^0-9]/g, '');

function resolvePn(x, jid) {
  if (!jid) return '';
  if (jid.endsWith('@lid')) {
    const p = (x.meta?.participants || []).find((q) => [q.id, q.lid, q.jid].includes(jid));
    const pn = p?.phoneNumber || (p?.jid && !p.jid.endsWith('@lid') ? p.jid : '') || (p?.id && !p.id.endsWith('@lid') ? p.id : '');
    return pn ? digits(pn.split('@')[0]) : '';
  }
  return digits(jid.split('@')[0]);
}

function extractNumber(x) {
  let n = '';
  if (x.quoted) n = resolvePn(x, x.quoted.senderAlt || x.quoted.sender);
  else if (x.mentioned?.length) n = resolvePn(x, x.mentioned[0]);
  else if (x.args[0]) n = digits(x.args[0]);
  n = n.replace(/^0+/, '');
  return n.length > 15 ? '' : n;
}

const ownerName = (x, n) => (db.getG(x.session, 'ownerNames', {}) || {})[n] || 'Owner';

async function setownerRun(x) {
  const cmd = x.cmd;
  const isAdd = ['addowner', 'addown', 'setowner'].includes(cmd);
  const isDel = ['delowner', 'dedown'].includes(cmd);
  const isList = ['ownerlist', 'listowner'].includes(cmd);
  const dbOwners = db.getG(x.session, 'owners', []) || [];
  const cfgOwners = (config.ownerNumber || []).map(digits).filter(Boolean);

  if (isList) {
    const all = [...new Set([...cfgOwners, ...dbOwners])];
    if (!all.length) return x.reply(`📋 *ᴅᴀꜰᴛᴀʀ ᴏᴡɴᴇʀ*\n\n> Belum ada owner terdaftar.`);
    let txt = `📋 *DAFTAR OWNER*\n\n`;
    all.forEach((n, i) => {
      const isMain = cfgOwners.includes(n), isDb = dbOwners.includes(n);
      const label = isMain && isDb ? '👑⭐' : isMain ? '⭐' : '👑';
      const name = ownerName(x, n);
      txt += `${i + 1}. ${label} @${n}${name !== 'Owner' ? ` — *${name}*` : ''}\n`;
    });
    txt += `\nTotal: *${all.length}* owner | ⭐ Main, 👑 Added`;
    return x.reply(txt, { mentions: all.map((n) => `${n}@s.whatsapp.net`) });
  }

  const target = extractNumber(x);
  const fromArgs = !x.quoted && !x.mentioned?.length && x.args[0];
  const customName = isAdd ? (fromArgs ? x.args.slice(1) : x.args).join(' ').trim() : '';

  if (!target) {
    return x.reply(
      `👑 *${isAdd ? 'ADD' : 'DEL'} OWNER*\n\nReply/tag/ketik nomor user\n\`Contoh: ${x.prefix}${cmd} 917018062209\`\n\`Dengan nama: ${x.prefix}${cmd} 917018062209 NamaOwner\``
    );
  }
  if (target.length < 10 || target.length > 15) return x.reply(`❌ *ɢᴀɢᴀʟ*\n\n> Format nomor tidak valid`);

  if (isAdd) {
    if (dbOwners.includes(target) || cfgOwners.includes(target)) return x.reply(`❌ \`${target}\` sudah menjadi full owner.`);
    db.setG(x.session, 'owners', [...dbOwners, target]);
    if (customName) db.setG(x.session, 'ownerNames', { ...(db.getG(x.session, 'ownerNames', {}) || {}), [target]: customName });
    await x.react('👑');
    return x.reply(`✅ Berhasil menambahkan *${target}* sebagai full owner${customName ? ` (${customName})` : ''}`);
  }
  if (isDel) {
    if (!dbOwners.includes(target)) return x.reply(`❌ \`${target}\` bukan full owner.`);
    db.setG(x.session, 'owners', dbOwners.filter((n) => n !== target));
    const names = { ...(db.getG(x.session, 'ownerNames', {}) || {}) };
    delete names[target];
    db.setG(x.session, 'ownerNames', names);
    await x.react('✅');
    return x.reply(`✅ Berhasil menghapus *${target}* dari full owner`);
  }
}

module.exports = [
  { ...G, name: 'acc', desc: 'Kelola permintaan masuk grup (accept/reject)', admin: 1, botAdmin: 1, run: accRun },
  { ...G, name: 'accall', desc: 'Kelola permintaan masuk grup (accept/reject)', admin: 1, botAdmin: 1, run: accRun },
  { ...G, name: 'antibot', aliases: ['botdetect'], desc: 'Deteksi dan kick bot WhatsApp (baileys) dari grup', admin: 1, botAdmin: 1, run: antibotRun },
  { ...G, name: 'antispam', desc: 'Mengatur perlindungan grup dari pesan spam [on/off/warning/kick/delete/delay]', admin: 1, run: antispamRun },
  { ...G, name: 'bangroup', aliases: ['banchat', 'unbanchat', 'unbangroup'], desc: 'Ban/unban grup dari penggunaan bot (owner)', owner: 1, run: banRun },
  { ...G, name: 'online', aliases: ['cekonline'], desc: 'Cek member yang online di grup', run: onlineRun },
  { ...G, name: 'publicgc', aliases: ['publicthisgc'], desc: 'Aktifkan mode public hanya di grup ini (owner)', owner: 1, run: publicRun },
  { ...G, name: 'publicgroup', desc: 'Aktifkan mode public hanya di grup ini (owner)', owner: 1, run: publicRun },
  { ...G, name: 'selfgc', aliases: ['selfthisgc'], desc: 'Aktifkan mode self hanya di grup ini (owner)', owner: 1, run: selfRun },
  { ...G, name: 'selfgroup', desc: 'Aktifkan mode self hanya di grup ini (owner)', owner: 1, run: selfRun },
  { ...G, name: 'setbye', desc: 'Atur teks goodbye grup (pakai @user)', admin: 1, run: setbyeRun },
  { category: 'owner', name: 'bye', aliases: ['leave'], desc: 'Bot keluar dari grup (owner)', owner: 1, run: byeRun },
  { ...G, name: 'tagadmin', desc: 'Tag semua admin grup', run: tagadminRun },
  { ...G, name: 'upsw', desc: 'Upload story untuk grup (border hijau)', run: upswRun },
  { ...G, name: 'upstory', desc: 'Upload story untuk grup (border hijau)', run: upswRun },
  { category: 'owner', name: 'setowner', aliases: ['addowner', 'addown', 'delowner', 'dedown', 'ownerlist', 'listowner'], desc: 'Kelola owner bot', owner: 1, run: setownerRun },
];
