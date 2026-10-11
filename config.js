// ============================================================
//  SIRF YAHAN SE SAB CHANGE KARO
// ============================================================
module.exports = {
  botName: '𝗩𝗫 𝗠𝗗 𝗕𝗢𝗧',
  ownerName: '𝗠𝗢𝗡 𝗦𝗧𝗘𝗥  ',
  ownerNumber: ['919907925376'],        // country code ke saath, + ke bina
  // Bot link hote hi jo "connect ho gaya" message jata hai uska pic (URL) aur 2 owner number (problem ke liye)
  connectImage: 'https://files.catbox.moe/l2gb41.jpg',
  connectOwners: ['919907925376', '8801730682614'],  // yahan DONO owner number daalo (country code ke saath, + ke bina)
  prefix: '.',
  timezone: 'Asia/Kolkata',

  // ---- Telegram pairing ----
  tgToken: process.env.TG_TOKEN || '', // Railway Variables me TG_TOKEN set karein
  maxSessions: 100,
  pairCooldownSec: 60,

  // ---- WhatsApp CHANNEL (menu/welcome upar "Forwarded from <channel>" dikhega) ----
  channelName: 'VX MD Official Channel',
  channelJid: '120363410099245350@newsletter',   // apne channel ki ID
  channelLink: '',
  channelInvite: '',                              // channel link ka last code (jid nahi pata to yahan daalo)
  autoFollowChannel: true,                        // pair hote hi bot channel follow kar lega
  autoReactChannel: true,                         // channel ke naye post par auto react
  channelReactEmojis: ['❤️', '🔥', '😍', '👏', '😂', '💯'],
  channelLiveSubscribe: false,                    // true karoge to channel live-updates subscribe hongi (experimental)
  channelReactDelaySec: [2, 90],                  // har number [min, max] sec random delay ke baad react kare

  // ---- Menu ----
  menuImage: 'https://files.catbox.moe/jiy7xh.jpg',
  //   menuImage: URL  |  'assets/menu.jpg'  |  'bot' (bot ka apna DP)
  menuVideo: 'assets/menu.mp4',               // .menu ka MP4
  menuAudio: 'assets/menu.mp3',                   // .allmenu ke baad ye song jayega (mp3 file ya URL)

  // Member ka DP na ho to ye image use hogi
  defaultDp: (num) => `https://ui-avatars.com/api/?name=${num}&size=512&background=random&color=fff`,

  // ---- Group status ka default background color ----
  // 'random' = har status ka color alag (sundar palette se)  |  'purple', 'red', 'navy'...  |  '#6A1B9A'
  // WhatsApp se bhi badal sakte ho: .setstatuscolor red   (owner: .setstatuscolor all red)
  statusColor: 'random',

  // ---- YouTube downloader (.song .play .video) ----
  // "Sign in to confirm you're not a bot" = YouTube ne server ka IP block kiya hai. Fix options:
  //   1) bot folder me cookies.txt rakho (browser se YouTube cookies export karke)
  //   2) proxy do (ghar/residential IP best): proxy: 'http://user:pass@host:port'
  //   3) .ytupdate (yt-dlp latest) — bot start par khud bhi update karta hai
  yt: {
    cookies: '',          // khaali = <bot folder>/cookies.txt
    proxy: '',            // ya env YT_PROXY
    forceIpv4: true,
    autoInstall: true,    // yt-dlp na mile to bot khud bin/yt-dlp download kare
  },

  // ---- Protection ----
  warnLimit: 3,
  badWords: /\b(fuck|bitch|asshole|madarchod|bhenchod|behenchod|chutiya|gandu|randi|harami|kamina)\b/i,

  // ---- Optional third-party APIs (khaali chhodo to command bata dega) ----
  apis: {
    ig: '',      // Instagram downloader API, e.g. 'https://your-api.com/ig?url='
    remini: '',  // Image enhance API, e.g. 'https://your-api.com/remini?url='
  },

  // ---- Default Welcome / Goodbye (customizable; see lib/welcome.js) ----
  welcomeText:
    '👋 *स्वागत है!*\\n\\n' +
    '@user जी, आपका *@group* में हार्दिक स्वागत है। 🎉\\n' +
    '👥 कुल सदस्य: @count\\n\\n' +
    '✨ ग्रुप के नियमों का पालन करें और आनंद लें।',

  goodbyeText:
    '👋 *विदाई संदेश*\\n\\n' +
    '@user ने ग्रुप छोड़ दिया है। 😢\\n' +
    '👥 अब ग्रुप में @count सदस्य हैं।\\n\\n' +
    '🙏 फिर मिलेंगे, अपना ख्याल रखना!',

  // ============================================================
  //  2 CHANNEL (pair hote hi bot dono ko auto follow karega)
  //  jid ya invite (channel link ka last code) me se kuch ek bharo
  //  link: https://whatsapp.com/channel/XXXX  -> invite = 'XXXX'
  // ============================================================
  channels: [
    { name: 'VX MD Official Channel', jid: '120363410099245350@newsletter', invite: '', link: '' },
    { name: 'VX MD Channel 2',        jid: '120363414036374133@newsletter', invite: '', link: 'https://whatsapp.com/channel/0029Vb9Zs0R5Ejy1dQMTH02e' },
  ],
  telegramLink: 'https://t.me/vxmdbot999',

  // ---- Random DP / image URLs (anti messages, panels) — jitne chaho daalo ----
  dpUrls: ['https://files.catbox.moe/8tgpuj.png'],

  // .allmenu ke liye alag-alag DP (har baar random)
  menuImages: [
    'https://files.catbox.moe/jiy7xh.jpg',
    'https://files.catbox.moe/i8x21j.jpg',
    'https://files.catbox.moe/hyh276.jpg',
    'https://files.catbox.moe/zjtxrj.jpg',
    'https://files.catbox.moe/8lduh7.jpg',
    'https://files.catbox.moe/znjdbv.jpg',
    'https://files.catbox.moe/4ly443.jpg',
    'https://files.catbox.moe/q3hg2c.jpg',
    'https://files.catbox.moe/dmwhit.jpg',
    'https://files.catbox.moe/qg37nx.jpg',
    'https://files.catbox.moe/4dinla.jpg',
    'https://files.catbox.moe/vvbots.jpg',
    'https://files.catbox.moe/d5emjn.jpg',
    'https://files.catbox.moe/ruc4mn.jpg',
    'https://files.catbox.moe/2o60co.jpg',
  ],

  // Owner ki DP: khaali = owner ka real WhatsApp DP
  ownerDpUrl: 'https://files.catbox.moe/7qtb1o.jpg',

  // Welcome video URL(s) — .welcomevideo on karne par yahin se random aayega
  welcomeVideoUrls: [
    'https://files.catbox.moe/gng7ch.mp4',
    'https://files.catbox.moe/wx4ypc.mp4',
    'https://files.catbox.moe/07hzxg.mp4',
    'https://files.catbox.moe/8t70j8.mp4',
    'https://files.catbox.moe/uailwu.mp4',
    'https://files.catbox.moe/bol8ye.mp4',
    'https://files.catbox.moe/ip9z0f.mp4',
    'https://files.catbox.moe/8adybw.mp4',
    'https://files.catbox.moe/qhooii.mp4',
    'https://files.catbox.moe/27bmrx.mp4',
    'https://files.catbox.moe/rormzr.mp4',
    'https://files.catbox.moe/dhqps7.mp4',
    'https://files.catbox.moe/fon87f.mp4',
    'https://files.catbox.moe/wk1neu.mp4',
    'https://files.catbox.moe/i0xzdq.mp4',
    'https://files.catbox.moe/lkgws8.mp4',
    'https://files.catbox.moe/9ryxbc.mp4',
    'https://files.catbox.moe/fa98s1.mp4',
    'https://files.catbox.moe/v7pakm.mp4',
  ],

  // ---- Telegram pairing DP ----
  tgPairDp: 'https://files.catbox.moe/a2zl5u.png',      // pairing code ke saath jayegi
  tgSuccessDp: 'https://files.catbox.moe/agwmas.png',   // connect hone ke baad jayegi
};
