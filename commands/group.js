const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config');
const db = require('../lib/db');
const { sleep } = require('../lib/common');
const { waGroupCode } = require('../lib/UrlUtil');
const fs = require('fs');
const path = require('path');

const G = { category: 'group', group: 1, admin: 1 };
const GB = { ...G, botAdmin: 1 };

module.exports = [
  { ...G, name: 'tagall', aliases: ['everyone'], desc: 'Sabko tag karo (MP4 video ke saath)',
    run: async (x) => {
      const ids = x.meta.participants.map((p) => p.id);
      const caption = `📢 *TAG ALL*\n${x.rest ? '💬 ' + x.rest + '\n' : ''}\n` + ids.map((i) => `• @${i.split('@')[0]}`).join('\n');
      const src = db.group(x.session, x.jid).allTagVideo;
      const videoPath = src || 'assets/alltag.mp4';
      const fullPath = path.join(__dirname, '..', videoPath);
      if (fs.existsSync(fullPath)) {
        await x.send({ video: fs.readFileSync(fullPath), caption, mentions: ids, mimetype: 'video/mp4' }, { quoted: x.m });
      } else {
        await x.send({ text: caption, mentions: ids }, { quoted: x.m });
      }
    } },

  { ...G, name: 'hidetag', aliases: ['ht', 'h'], desc: 'Bina naam dikhaye sabko tag',
    run: (x) => x.send({ text: x.rest || x.quoted?.text || '📢', mentions: x.meta.participants.map((p) => p.id) }) },

  { ...GB, name: 'kick', aliases: ['remove'], desc: 'Member ko hatao (tag/reply)',
    run: async (x) => {
      if (!x.target) return x.reply('Kisi ko tag karo ya uske message ko reply karo.');
      if (x.admins.includes(x.target)) return x.reply('❌ Admin ko kick nahi kar sakta.');
      await x.sock.groupParticipantsUpdate(x.jid, [x.target], 'remove');
      await x.reply(`👋 @${x.target.split('@')[0]} आपको मैंने इसी ग्रुप से *kick* किया है।`, { mentions: [x.target] });
    } },

  { ...GB, name: 'kickall', desc: 'Sab non-admin hatao (confirm chahiye)',
    run: async (x) => {
      if (x.args[0] !== 'confirm') return x.reply(`⚠️ Ye *sabhi non-admin* members ko hata dega!\nPakka? Likho: ${x.prefix}kickall confirm`);
      const list = x.meta.participants
        .map((p) => jidNormalizedUser(p.id))
        .filter((id) => !x.admins.includes(id) && id !== x.botId && !config.ownerNumber.includes(id.split('@')[0]));
      await x.reply(`🧹 ${list.length} members hata raha hoon...`);
      for (let i = 0; i < list.length; i += 5) {
        await x.sock.groupParticipantsUpdate(x.jid, list.slice(i, i + 5), 'remove').catch(() => {});
        await sleep(1500);
      }
    } },

  { ...GB, name: 'promote', desc: 'Admin banao',
    run: async (x) => { if (!x.target) return x.reply('Tag/reply karo.'); await x.sock.groupParticipantsUpdate(x.jid, [x.target], 'promote'); x.reply('✅ Admin bana diya.'); } },

  { ...GB, name: 'demote', desc: 'Admin hatao',
    run: async (x) => { if (!x.target) return x.reply('Tag/reply karo.'); await x.sock.groupParticipantsUpdate(x.jid, [x.target], 'demote'); x.reply('✅ Admin hata diya.'); } },

  { ...GB, name: 'open', desc: 'Group kholo (sab message kar sakein)',
    run: async (x) => { await x.sock.groupSettingUpdate(x.jid, 'not_announcement'); x.reply('🔓 Group khul gaya.'); } },

  { ...GB, name: 'close', desc: 'Group band karo (sirf admin)',
    run: async (x) => { await x.sock.groupSettingUpdate(x.jid, 'announcement'); x.reply('🔒 Group band ho gaya.'); } },

  { category: 'group', group: 1, name: 'group', aliases: ['gc', 'groupinfo'], desc: 'Group info / group open|close',
    run: async (x) => {
      const a = (x.args[0] || '').toLowerCase();
      if (a === 'open' || a === 'close') {
        if (!(x.isAdmin || x.isOwner)) return x.reply('❌ Sirf admin.');
        if (!x.isBotAdmin) return x.reply('❌ Pehle bot ko admin banao.');
        await x.sock.groupSettingUpdate(x.jid, a === 'open' ? 'not_announcement' : 'announcement');
        return x.reply(a === 'open' ? '🔓 Group khul gaya.' : '🔒 Group band ho gaya.');
      }
      const m = x.meta;
      x.reply(`👥 *${m.subject}*\n🆔 ${m.id}\n👤 Members: ${m.participants.length}\n👑 Admins: ${x.admins.length}\n📅 Bana: ${new Date(m.creation * 1000).toLocaleDateString('en-IN')}\n\n📝 ${m.desc || 'No description'}\n\nUse: ${x.prefix}group open|close`);
    } },

  { ...GB, name: 'setppgc', aliases: ['setppgroup'], desc: 'Group DP badlo (photo reply)',
    run: async (x) => {
      const d = await x.download();
      if (!d || d.type !== 'imageMessage') return x.reply('📸 Photo reply karo ya photo ke caption me likho.');
      await x.sock.updateProfilePicture(x.jid, d.buffer);
      x.reply('✅ Group DP set ho gaya.');
    } },

  { ...GB, name: 'delppgc', desc: 'Group DP hatao',
    run: async (x) => { await x.sock.removeProfilePicture(x.jid); x.reply('✅ Group DP hata diya.'); } },

  { ...G, name: 'setintro', desc: 'Group intro message set karo',
    run: (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}setintro Naam:\nUmar:\nCity:`);
      db.setGroup(x.session, x.jid, 'intro', x.rest);
      x.reply('✅ Intro set ho gaya.');
    } },

  { category: 'group', group: 1, name: 'intro', desc: 'Group ka intro format dikhao',
    run: (x) => x.reply(db.group(x.session, x.jid).intro || `Intro set nahi hai. Admin ${x.prefix}setintro use kare.`) },

  { ...G, name: 'warn', desc: 'Warning do (tag/reply) — limit par kick',
    run: async (x) => {
      if (!x.target) return x.reply('Tag/reply karo.');
      if (x.admins.includes(x.target)) return x.reply('❌ Admin ko warn nahi kar sakte.');
      const n = db.addWarn(x.session, x.jid, x.target);
      const tag = x.target.split('@')[0];
      if (n >= config.warnLimit && x.isBotAdmin) {
        db.resetWarn(x.session, x.jid, x.target);
        await x.sock.groupParticipantsUpdate(x.jid, [x.target], 'remove').catch(() => {});
        return x.send({ text: `🚫 @${tag} ko ${config.warnLimit} warning ke baad remove kiya.`, mentions: [x.target] });
      }
      x.send({ text: `⚠️ @${tag} warning: ${n}/${config.warnLimit}${x.args.slice(1).length ? '\n📝 ' + x.args.slice(1).join(' ') : ''}`, mentions: [x.target] });
    } },

  { ...G, name: 'resetwarn', desc: 'Warning zero karo (tag/reply)',
    run: (x) => { if (!x.target) return x.reply('Tag/reply karo.'); db.resetWarn(x.session, x.jid, x.target); x.reply('✅ Warnings reset.'); } },

  { category: 'group', group: 1, admin: 1, botAdmin: 1, name: 'delete', aliases: ['del'], desc: 'Kisi message ko delete (reply)',
    run: async (x) => {
      if (!x.quoted) return x.reply('Jis message ko delete karna hai use reply karo.');
      if (x.isGroup && !(x.isAdmin || x.isOwner)) return x.reply('❌ Sirf admin.');
      await x.sock.sendMessage(x.jid, { delete: x.quoted.key });
      x.reply('🗑️ Message delete ho gaya.');
    } },

  { category: 'group', name: 'setmention', desc: 'Bot ko mention par reply set (owner)', owner: 1,
    run: (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}setmention Haan boliye, main yahan hoon!`);
      db.setG(x.session, 'mentionMsg', x.rest);
      x.reply('✅ Mention reply set ho gaya.');
    } },

  { category: 'group', name: 'mention', desc: 'Abhi ka mention reply dikhao',
    run: (x) => x.reply(db.getG(x.session, 'mentionMsg', null) || 'Mention reply set nahi hai.') },

  { ...G, name: 'grouptime', desc: 'Auto open/close time (HH:MM)',
    run: (x) => {
      const [t, time] = x.args;
      if (t === 'off') { db.setGroup(x.session, x.jid, 'openAt', null); db.setGroup(x.session, x.jid, 'closeAt', null); return x.reply('✅ Auto open/close band.'); }
      if (!['open', 'close'].includes(t) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || ''))
        return x.reply(`Use:\n${x.prefix}grouptime open 06:00\n${x.prefix}grouptime close 22:00\n${x.prefix}grouptime off\n(Timezone: ${config.timezone})`);
      db.setGroup(x.session, x.jid, t === 'open' ? 'openAt' : 'closeAt', time);
      x.reply(`✅ Group roz *${time}* par auto *${t}* hoga.`);
    } },

  { ...G, name: 'setwelcomevideo', aliases: ['welcomevideo'], desc: 'Welcome MP4 video change karo (video reply/send karo)',
    run: async (x) => {
      // .welcomevideo on/off  => welcome ke saath video ON/OFF (off = member ki DP)
      const sw = (x.args[0] || '').toLowerCase();
      if (['on', 'off'].includes(sw)) {
        db.setGroup(x.session, x.jid, 'welcomeVideoOn', sw === 'on');
        return x.reply(`✅ Welcome video: *${sw.toUpperCase()}*\n${sw === 'on' ? '🎬 Ab welcome ke saath video aayega.' : '🖼️ Ab welcome ke saath member ki DP aayegi.'}`);
      }
      const d = await x.download();
      if (!d || d.type !== 'videoMessage') return x.reply(`🎥 Use:\n${x.prefix}welcomevideo on / off\n(ya MP4 video reply karke ${x.prefix}setwelcomevideo likho)`);
      const file = `welcome-${x.session}.mp4`;
      fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '..', 'data', file), d.buffer);
      db.setGroup(x.session, x.jid, 'welcomeVideo', `data/${file}`);
      return x.reply('✅ Welcome video change ho gaya. Ab naye member ko ye video milega.');
    } },

  { ...G, name: 'resetwelcomevideo', desc: 'Welcome video default assets/welcome.mp4 par lao',
    run: async (x) => { db.setGroup(x.session, x.jid, 'welcomeVideo', null); return x.reply('✅ Welcome video default par reset ho gaya.'); } },

  { ...G, name: 'setalltagvideo', aliases: ['alltagvideo'], desc: 'All Tag MP4 video change karo',
    run: async (x) => {
      const d = await x.download();
      if (!d || d.type !== 'videoMessage') return x.reply(`🎥 MP4 video bhejo ya video ko reply karke ${x.prefix}setalltagvideo likho.`);
      const file = `alltag-${x.session}.mp4`;
      fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '..', 'data', file), d.buffer);
      db.setGroup(x.session, x.jid, 'allTagVideo', `data/${file}`);
      return x.reply('✅ All Tag video change ho gaya.');
    } },

  { ...G, name: 'resetalltagvideo', desc: 'All Tag video default par lao',
    run: async (x) => { db.setGroup(x.session, x.jid, 'allTagVideo', null); return x.reply('✅ All Tag video default par reset ho gaya.'); } },

  { ...G, name: 'setwelcome', desc: 'Welcome message set (reset likho to default)',
    run: (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}setwelcome Welcome @user to @group!\nVariables: @user @group @count @owner @bot\nDefault ke liye: ${x.prefix}setwelcome reset`);
      db.setGroup(x.session, x.jid, 'welcomeMsg', x.rest === 'reset' ? null : x.rest);
      x.reply('✅ Welcome message update ho gaya.');
    } },

  { ...G, name: 'setgoodbye', desc: 'Goodbye message set (reset likho to default)',
    run: (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}setgoodbye Bye @user!\nDefault ke liye: ${x.prefix}setgoodbye reset`);
      db.setGroup(x.session, x.jid, 'goodbyeMsg', x.rest === 'reset' ? null : x.rest);
      x.reply('✅ Goodbye message update ho gaya.');
    } },

  { category: 'owner', name: 'join', desc: 'Group link se join (owner)', owner: 1,
    run: async (x) => {
      const code = waGroupCode(x.rest || x.quoted?.text);
      if (!code) return x.reply(`Use: ${x.prefix}join https://chat.whatsapp.com/xxxx`);
      await x.sock.groupAcceptInvite(code);
      x.reply('✅ Join ho gaya.');
    } },
];
