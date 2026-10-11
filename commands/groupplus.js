// ============================================================
//  GROUP PLUS — group ke liye naye commands (utility + masti)
//
//  👥 GROUP : admins, gclink, resetlink, setname, setdesc, poll,
//             topchat, resettopchat, warnlist, afk
//  🎨 FUN   : ship, truth, dare, tod, wyr, joke, shayari, quote,
//             8ball, flip, dice, choose, rate, iq, luck, roast,
//             compliment, getpp, calc   (hug/slap gif commands media.js me hain)
// ============================================================
const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const db = require('../lib/db');
const config = require('../config');
const activity = require('../lib/activity');
const { pick } = require('../lib/common');

const G = { category: 'group', group: 1 };
const GA = { ...G, admin: 1 };
const GB = { ...GA, botAdmin: 1 };
const F = { category: 'fun' };
const FG = { category: 'fun', group: 1 };

const num = (j) => String(j).split('@')[0];
const tag = (j) => '@' + num(j);
const pct = () => Math.floor(Math.random() * 101);
const bar = (p) => '█'.repeat(Math.round(p / 10)) + '░'.repeat(10 - Math.round(p / 10));
const members = (x) => x.meta.participants.map((p) => p.id).filter((id) => jidNormalizedUser(id) !== x.botId);
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

// ---------------- masti wala content ----------------
const TRUTH = [
  'Aapka sabse bada darr kya hai?',
  'Aakhri baar kab roye the aur kyun?',
  'Is group me sabse zyada kis se baat karna pasand hai?',
  'Aapki phone ki gallery ki sabse embarrassing photo kaunsi hai?',
  'Kabhi kisi se jhooth bola jo baad me pakda gaya? Kya tha?',
  'Aapka pehla crush kaun tha (naam nahi to initial hi bata do)?',
  'Aisi kaunsi aadat hai jo aap chhodna chahte ho?',
  'Aapne aaj tak ka sabse ajeeb sapna kya dekha?',
  'Agar ek din ke liye invisible ho jao to sabse pehle kya karoge?',
  'Group me kis member ko aap sabse zyada mast/funny maante ho?',
  'Aapki life ka sabse bada regret kya hai?',
  'Kabhi exam me cheating ki hai? Sach batana!',
  'Aapke phone me sabse zyada use hone wali app kaunsi hai?',
  'Aapko kis baat par sabse zyada gussa aata hai?',
];
const DARE = [
  'Apne last chat ka screenshot group me bhejo (jo share kar sako).',
  'Group me 1 minute tak sirf emojis me baat karo.',
  'Apni sabse funny voice note bhejo.',
  'Apne DP ko 10 minute ke liye kisi cartoon ka laga do.',
  'Group ke kisi bhi ek member ki taareef 5 line me likho.',
  'Ek shayari banao aur group me sunao.',
  'Apne naam se ek chhota sa gaana gaakar voice note bhejo.',
  'Agla message ulti spelling me likho.',
  'Group ke sabse pehle online member ko "good morning" bolo (chahe raat ho).',
  'Apni ek purani photo group me daalo.',
  '5 minute tak sirf Hindi shuddh shabdon me baat karo.',
  'Apne ghar ki ek cheez ki photo bhejo jo sabse purani ho.',
];
const WYR = [
  ['Hamesha sach bolna', 'Hamesha mazak me baat karna'],
  ['Bina phone ke 1 hafta', 'Bina khaane ke 1 din'],
  ['Purane zamane me jaana', 'Future me jaana'],
  ['Chai', 'Coffee'],
  ['Subah jaldi uthna', 'Raat ko der tak jaagna'],
  ['Hamesha garmi', 'Hamesha sardi'],
  ['Mind reading power', 'Udne ki power'],
  ['Ek crore rupaye abhi', 'Har mahine 1 lakh zindagi bhar'],
  ['Biryani hamesha', 'Pizza hamesha'],
  ['Bahut saare dost', 'Bas 2-3 pakke dost'],
];
const JOKES = [
  'Teacher: Bataiye, 5 me se 3 gaye to kitne bache?\nStudent: Sir, 3 gaye kahan? Wapas bulao unko! 😂',
  'Pappu: Papa, main pass ho gaya!\nPapa: Wah! Kitne number?\nPappu: 33!\nPapa: Ye toh fail hai.\nPappu: Papa, pass hone ke liye 33 hi chahiye, aapne dhyaan hi nahi diya! 😆',
  'Biwi: Suno, main mote lag rahi hoon?\nPati: (soch kar) Main WiFi hoon, abhi jawab nahi de sakta — connection lost! 📶😅',
  'Doctor: Aapko aaram ki zaroorat hai.\nMareez: Doctor sahab, wo toh mujhe pehle se pata hai, aap dawai batao! 😂',
  'Dost: Tum itna late kyun uthte ho?\nMain: Kyunki sapne me main bahut busy hota hoon! 😴',
  'Maa: Beta, phone chhod do, aankhen kharab ho jayengi.\nBeta: Maa, aankhen kharab hone se pehle recharge khatam ho jayega! 📱😂',
  'Teacher: Tum late kyun aaye?\nStudent: Sir, raste me board laga tha "School Ahead, Go Slow" 🐢',
  'Ek aadmi ne WiFi ka password poocha.\nDukandaar: "Pehle kuch kharido."\nAadmi: "Ek chai dijiye."\nPassword: "Chai_nahi_milegi" 😜',
  'Rahul: Yaar, tumhari life me kya chal raha hai?\nMohit: Bas, 4G chal raha hai aur battery 5% 🔋😂',
  'Interviewer: Aapki sabse badi kamzori?\nCandidate: Sach bolna.\nInterviewer: Ye kamzori nahi hai.\nCandidate: Mujhe parwah nahi ki aapko kya lagta hai. 😎',
];
const SHAYARI = [
  'Dosti ka rishta bhi ajeeb hota hai,\nDil se dil ka rishta bahut kareeb hota hai. 💛',
  'Muskurana seekh lo zindagi ke har mod par,\nGham bhi sharma jayenge tumhari hasi dekhkar. 😊',
  'Sitaron se aage jahan aur bhi hain,\nTumhare liye dua ke lafz aur bhi hain. ✨',
  'Waqt badalta hai to log badal jaate hain,\nJo saath nibhate hain wahi yaad reh jaate hain. 🤝',
  'Chand se poochha, tu itna sundar kyun hai?\nBola, mujhe dekhne wale tum jaise dost jo hain. 🌙',
  'Kaamyabi ki raah me mushkilein aayengi zaroor,\nPar himmat rakho, manzil hogi door nahi. 🚀',
  'Chai ki pyali aur tumhari yaadein,\nDono ke bina subah adhoori si lagti hai. ☕',
  'Zindagi ek safar hai suhana yahan kal kya ho kisne jaana,\nAaj ko jee lo dil khol ke, kal ka kya thikana. 🌈',
  'Har subah ek nayi umeed lekar aati hai,\nBas dil me yakeen rakho, kismat muskurati hai. 🌅',
  'Rishte wahi sacche jo bina kahe samajh jaate hain,\nBaaki toh bas naam ke hote hain. ❤️',
];
const QUOTES = [
  'Mehnat itni khamoshi se karo ki safalta shor macha de. 🔥',
  'Jo log girkar uthte hain, wahi duniya badalte hain. 💪',
  'Sapne wo nahi jo neend me aate hain, sapne wo hain jo neend uda dein. 🌟',
  'Chhoti chhoti koshishein hi badi jeet ki neev hoti hain. 🏆',
  'Waqt ki keemat samajh lo, ye dobara laut kar nahi aata. ⏳',
  'Apne aap par bharosa rakho, aadhi jung wahin jeet jaate ho. 🦁',
  'Muskurahat sabse sasta aur sabse accha shringaar hai. 😊',
  'Jo kal tha wo guzar gaya, aaj ko behtar banao. 🌄',
  'Sabar rakho, sab kuch sahi waqt par milta hai. 🕊️',
  'Achhe log kismat se milte hain, unhe sambhal ke rakho. 🤍',
];
const BALL = [
  '✅ Haan, bilkul!', '✅ Pakka hoga.', '✅ Lagta to yahi hai.', '🤔 Abhi kuch keh nahi sakte.',
  '🤔 Dobara poochho, dhyan se.', '❌ Bilkul nahi!', '❌ Mere hisaab se nahi.', '❌ Umeed mat rakho.',
  '🔮 Sitare kehte hain haan.', '🔮 Sitare kehte hain nahi.',
];
const ROAST = [
  'tumhari planning itni strong hai ki plan B ko bhi plan A ka pata nahi chalta 😂',
  'tum itne cool ho ki AC bhi tumse tips leta hai ❄️😜',
  'tumhara reply itna late aata hai ki message khud "seen" hone ka wait karta hai 🐢',
  'tum wo insaan ho jo Google se bhi zyada sawaal poochta hai 🤓',
  'tumhari neend itni gehri hai ki alarm bhi haar maan jata hai ⏰😴',
  'tum group me aise ho jaise chai me elaichi — kam ho to bhi chalta, na ho to bhi 😆',
  'tumhara phone charging par zyada aur tumhare haath me kam hota hai 🔌📱',
];
const COMPLIMENT = [
  'tumhari smile group ka mood bana deti hai 😊',
  'tum jaise dost kismat wale ko milte hain 💛',
  'tumhari baatein hamesha positive energy deti hain ✨',
  'tum bahut helping nature ke ho, keep it up 🤝',
  'tumhare bina group adhoora lagta hai 🌟',
  'tumhari soch bahut achhi hai, hamesha aisi hi rehna 👏',
  'tum ekdum star ho, chamakte raho ⭐',
];
const SHIP_LINES = [
  [20, '💔 Thodi mushkil hai... par dosti pakki!'],
  [40, '🙂 Kuch to hai, thoda time do.'],
  [60, '😊 Achhi jodi ban sakti hai!'],
  [80, '😍 Wah! Ye toh kaafi mast match hai!'],
  [101, '💞 Made for each other! Shaadi kab hai? 🎉'],
];

module.exports = [
  // ===================== GROUP =====================
  { ...G, name: 'admins', aliases: ['listadmin', 'adminlist', 'staff'], desc: 'Group ke saare admins ko tag karo',
    run: (x) => {
      const list = x.meta.participants.filter((p) => p.admin || p.isAdmin);
      if (!list.length) return x.reply('❌ Koi admin nahi mila.');
      const text = `👑 *GROUP ADMINS* (${list.length})\n\n` +
        list.map((p, i) => `${i + 1}. ${tag(p.id)}${p.admin === 'superadmin' ? ' ⭐ creator' : ''}`).join('\n') +
        (x.rest ? `\n\n💬 ${x.rest}` : '');
      return x.send({ text, mentions: list.map((p) => p.id) }, { quoted: x.m });
    } },

  { ...GB, name: 'gclink', aliases: ['grouplink', 'link', 'invitelink'], desc: 'Group ka invite link',
    run: async (x) => {
      const code = await x.sock.groupInviteCode(x.jid);
      return x.reply(`🔗 *${x.meta.subject}*\nhttps://chat.whatsapp.com/${code}`);
    } },

  { ...GB, name: 'resetlink', aliases: ['revoke', 'revokelink'], desc: 'Group ka purana link band karke naya banao',
    run: async (x) => {
      const code = await x.sock.groupRevokeInvite(x.jid);
      return x.reply(`♻️ Purana link band ho gaya.\n🔗 Naya link:\nhttps://chat.whatsapp.com/${code}`);
    } },

  { ...GB, name: 'setname', aliases: ['setgcname'], desc: 'Group ka naam badlo',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}setname Naya Naam`);
      if (x.rest.length > 100) return x.reply('❌ Naam 100 akshar se chhota rakho.');
      await x.sock.groupUpdateSubject(x.jid, x.rest);
      return x.reply('✅ Group ka naam badal diya.');
    } },

  { ...GB, name: 'setdesc', aliases: ['setgcdesc'], desc: 'Group ki description badlo',
    run: async (x) => {
      if (!x.rest) return x.reply(`Use: ${x.prefix}setdesc Nayi description`);
      await x.sock.groupUpdateDescription(x.jid, x.rest.slice(0, 2000));
      return x.reply('✅ Group description badal di.');
    } },

  { ...G, name: 'poll', aliases: ['vote'], desc: 'Poll banao: .poll Sawal | opt1 | opt2',
    run: async (x) => {
      const parts = x.rest.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) return x.reply(`📊 *Poll*\nUse: ${x.prefix}poll Aaj movie dekhein? | Haan | Nahi | Baad me`);
      const [name, ...values] = parts;
      const uniq = [...new Set(values)].slice(0, 12);
      if (uniq.length < 2) return x.reply('❌ Kam se kam 2 alag options do.');
      return x.send({ poll: { name, values: uniq, selectableCount: 1 } }, { quoted: x.m });
    } },

  { ...G, name: 'topchat', aliases: ['active', 'leaderboard', 'topactive'], desc: 'Group ke sabse active members (top 10)',
    run: (x) => {
      const top = activity.top(x.session, x.jid, 10);
      if (!top.length) return x.reply('📊 Abhi tak koi chat data nahi hai. Thodi der baad dekho!');
      const medal = ['🥇', '🥈', '🥉'];
      const text = '🏆 *TOP ACTIVE MEMBERS*\n\n' +
        top.map(([j, n], i) => `${medal[i] || `${i + 1}.`} ${tag(j)} — *${n}* msgs`).join('\n');
      return x.send({ text, mentions: top.map(([j]) => j) }, { quoted: x.m });
    } },

  { ...GA, name: 'resettopchat', desc: 'Topchat ka data zero karo',
    run: (x) => { activity.resetGroup(x.session, x.jid); return x.reply('✅ Topchat data reset ho gaya.'); } },

  { ...G, name: 'warnlist', aliases: ['warns', 'warnings'], desc: 'Kis kis ko kitni warning mili',
    run: (x) => {
      const w = Object.entries(db.group(x.session, x.jid).warns || {}).filter(([, n]) => n > 0);
      if (!w.length) return x.reply('✅ Is group me kisi ko warning nahi mili.');
      return x.send({
        text: `⚠️ *WARNING LIST*\n\n` + w.map(([j, n]) => `• ${tag(j)} — ${n}/${config.warnLimit}`).join('\n'),
        mentions: w.map(([j]) => j),
      }, { quoted: x.m });
    } },

  { ...G, name: 'afk', desc: 'AFK ho jao — koi tag kare to bot bata dega',
    run: (x) => {
      activity.setAfk(x.session, x.sender, x.rest || 'Busy hoon');
      return x.send({ text: `😴 @${x.senderNum} ab *AFK* hai.\n📝 Wajah: ${x.rest || 'Busy hoon'}`, mentions: [x.sender] }, { quoted: x.m });
    } },

  // ===================== FUN =====================
  { ...FG, name: 'ship', aliases: ['couple', 'jodi'], desc: 'Do logon ki jodi (tag karo ya random)',
    run: (x) => {
      let a, b;
      const m = x.mentioned;
      if (m.length >= 2) [a, b] = m;
      else if (m.length === 1) [a, b] = [x.sender, m[0]];
      else {
        const all = members(x);
        if (all.length < 2) return x.reply('❌ Group me kam members hain.');
        [a, b] = shuffle(all);
      }
      const p = pct();
      const line = SHIP_LINES.find(([max]) => p < max)[1];
      return x.send({ text: `💘 *SHIP METER*\n\n${tag(a)} ❤️ ${tag(b)}\n\n${bar(p)} *${p}%*\n${line}`, mentions: [a, b] }, { quoted: x.m });
    } },

  { ...F, name: 'truth', desc: 'Truth sawal',
    run: (x) => x.reply(`🎯 *TRUTH*\n\n${pick(TRUTH)}`) },

  { ...F, name: 'dare', desc: 'Dare challenge',
    run: (x) => x.reply(`🔥 *DARE*\n\n${pick(DARE)}`) },

  { ...FG, name: 'tod', aliases: ['truthordare'], desc: 'Random Truth ya Dare kisi member par',
    run: (x) => {
      const who = x.target || pick(members(x));
      const isTruth = Math.random() < 0.5;
      return x.send({
        text: `🎲 *TRUTH OR DARE*\n\n${tag(who)}, aapki baari!\n\n${isTruth ? '🎯 *Truth*' : '🔥 *Dare*'}: ${pick(isTruth ? TRUTH : DARE)}`,
        mentions: [who],
      }, { quoted: x.m });
    } },

  { ...G, name: 'wyr', aliases: ['wouldyourather'], desc: 'Would You Rather poll',
    run: async (x) => {
      const [a, b] = pick(WYR);
      return x.send({ poll: { name: '🤔 Would You Rather?', values: [a, b], selectableCount: 1 } }, { quoted: x.m });
    } },

  { ...F, name: 'joke', aliases: ['chutkula'], desc: 'Random chutkula',
    run: (x) => x.reply(`😂 *CHUTKULA*\n\n${pick(JOKES)}`) },

  { ...F, name: 'shayari', desc: 'Random shayari',
    run: (x) => x.reply(`💌 *SHAYARI*\n\n${pick(SHAYARI)}`) },

  { ...F, name: 'quote', aliases: ['suvichar', 'motivation'], desc: 'Random suvichar',
    run: (x) => x.reply(`🌟 *SUVICHAR*\n\n${pick(QUOTES)}`) },

  { ...F, name: '8ball', aliases: ['magic8', 'bhavishya'], desc: 'Sawal poochho, jawab lo',
    run: (x) => {
      if (!x.rest) return x.reply(`🔮 Use: ${x.prefix}8ball Kya main pass ho jaunga?`);
      return x.reply(`🔮 *Sawal:* ${x.rest}\n\n${pick(BALL)}`);
    } },

  { ...F, name: 'flip', aliases: ['coin', 'toss'], desc: 'Sikka uchhalo',
    run: (x) => x.reply(Math.random() < 0.5 ? '🪙 *HEADS* (chhaap)' : '🪙 *TAILS* (patt)') },

  { ...F, name: 'dice', aliases: ['roll'], desc: 'Paasa fenko',
    run: (x) => x.reply(`🎲 Paasa: *${1 + Math.floor(Math.random() * 6)}*`) },

  { ...F, name: 'choose', aliases: ['select', 'pickone'], desc: 'Options me se ek chuno: .choose pizza | burger',
    run: (x) => {
      const opts = x.rest.split('|').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return x.reply(`Use: ${x.prefix}choose pizza | burger | momos`);
      return x.reply(`🤖 Mera chunav: *${pick(opts)}* ✅`);
    } },

  { ...F, name: 'rate', desc: 'Kisi bhi cheez ko rate karo',
    run: (x) => {
      const what = x.rest || (x.target ? tag(x.target) : '');
      if (!what) return x.reply(`Use: ${x.prefix}rate mera swag`);
      const p = pct();
      return x.send({ text: `⭐ *RATING*\n\n${what}\n${bar(p)} *${p}%*`, mentions: x.target ? [x.target] : [] }, { quoted: x.m });
    } },

  { ...F, name: 'iq', desc: 'IQ meter (mazak ke liye)',
    run: (x) => {
      const who = x.target || x.sender;
      return x.send({ text: `🧠 ${tag(who)} ka IQ: *${60 + Math.floor(Math.random() * 100)}*\n_(sirf mazak hai 😄)_`, mentions: [who] }, { quoted: x.m });
    } },

  { ...F, name: 'luck', aliases: ['kismat'], desc: 'Aaj kitni kismat saath hai',
    run: (x) => {
      const who = x.target || x.sender;
      const p = pct();
      return x.send({ text: `🍀 ${tag(who)} ki aaj ki kismat\n${bar(p)} *${p}%*`, mentions: [who] }, { quoted: x.m });
    } },

  { ...F, name: 'roast', desc: 'Pyaar bhara roast (tag/reply)',
    run: (x) => {
      const who = x.target || x.sender;
      return x.send({ text: `😜 ${tag(who)}, ${pick(ROAST)}\n\n_(mazak tha, bura mat maanna 🤗)_`, mentions: [who] }, { quoted: x.m });
    } },

  { ...F, name: 'compliment', aliases: ['taareef'], desc: 'Kisi ki taareef (tag/reply)',
    run: (x) => {
      const who = x.target || x.sender;
      return x.send({ text: `💛 ${tag(who)}, ${pick(COMPLIMENT)}`, mentions: [who] }, { quoted: x.m });
    } },

  { ...F, name: 'getpp', aliases: ['pp', 'dp', 'profilepic'], desc: 'Kisi ki DP nikaalo (tag/reply)',
    run: async (x) => {
      const who = x.target || x.sender;
      let url;
      try { url = await x.sock.profilePictureUrl(who, 'image'); }
      catch { return x.reply('❌ DP nahi mili (private hai ya lagayi hi nahi).'); }
      return x.send({ image: { url }, caption: `🖼️ ${tag(who)} ki DP`, mentions: [who] }, { quoted: x.m });
    } },

  { ...F, name: 'calc', aliases: ['calculate', 'math'], desc: 'Calculator: .calc 25*4+10',
    run: (x) => {
      if (!x.rest) return x.reply(`🧮 Use: ${x.prefix}calc 25*4+10\n(+ - * / % ^ ( ) chalte hain)`);
      const expr = x.rest.replace(/\^/g, '**').replace(/[x×]/gi, '*').replace(/÷/g, '/');
      if (expr.length > 100 || !/^[0-9+\-*/().%\s]+$/.test(expr)) return x.reply('❌ Sirf number aur + - * / % ^ ( ) likho.');
      let r;
      try { r = Function(`"use strict"; return (${expr});`)(); } catch { return x.reply('❌ Calculation galat hai.'); }
      if (typeof r !== 'number' || !Number.isFinite(r)) return x.reply('❌ Jawab nikal nahi paya.');
      return x.reply(`🧮 ${x.rest} = *${Math.round(r * 1e8) / 1e8}*`);
    } },
];
