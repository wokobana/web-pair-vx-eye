# Miku-MD v2 — WhatsApp MD Bot (Public Telegram Pairing)

## Setup
1. Node.js 18+ aur `ffmpeg` (song/sticker/video conversion ke liye recommended).
2. YouTube ke liye server par `yt-dlp` install ho to downloader ka fallback bhi active rahega; `yt-dlp` na ho to bot `@distube/ytdl-core` fallback use karega.
3. Telegram par @BotFather se bot banao, token lo.
4. Environment variable `TG_TOKEN` set karo (Telegram bot token ko source code me hardcode na karein).
   `config.js` me botName, ownerName, ownerNumber, prefix, **channelName / channelJid / channelLink**,
   menuImage, menuAudio, welcome/goodbye text change karo.
5. `assets/menu.mp3` me apna song rakho (menu ke baad ye jayega).
6. `npm install` -> `npm start`

## Public pairing
Telegram bot par: `/pair 919XXXXXXXXX` -> code -> WhatsApp > Linked Devices > Link with phone number.

## .menu kaise jata hai
1. DP + poori command list (caption) — upar *Forwarded from <Channel>* header
2. Uske neeche `assets/menu.mp3` audio (channel se forward)
Themes: `.themes 1/2/3`  |  DP badalna: photo par `.setmenuimg`

## Auto channel
- Pair hote hi bot `channelJid` (ya `channelInvite` code) wala channel **auto follow** karta hai.
- Channel ke naye post par **auto react** (config: autoReactChannel).

## Welcome / Goodbye
`.welcome on` / `.goodbye on` — member ka DP + text jata hai (DP na ho to default avatar).
`.setwelcome ...` / `.setgoodbye ...` — variables: @user @group @count @owner @bot

## Aapki file list -> command mapping
| Aapki file | Command / feature |
|---|---|
| menu.js, menu_img.js, themes.js | `.menu`, `.setmenuimg`, `.themes` |
| ping, owner, setownertype | `.ping`, `.owner`, `.setownertype vcard/text` |
| autoreact.js | `.autoreact on/off` (+ channel auto react) |
| antilink, antilinkgc, antijudol, antiphising, antitoxic, antispam, antimedia, antisticker, antibot, antihidetag, antistatus, antigroupstatus, antitagsw | `.<naam> on/off` |
| antidelete, antiremove, anticall | `.antidelete on/off`, `.antiremove on/off`, `.anticall on/off/block` |
| groupprotect.js | `.groupprotect on/off` (preset) |
| group, open, close, grouptime | `.group`, `.open`, `.close`, `.grouptime open 06:00` |
| groupupdate, notifopengroup | `.groupupdate on/off`, `.notifopengroup on/off` |
| tagall, ht, kick, kickall, warn, delete | `.tagall`, `.hidetag`, `.kick`, `.kickall confirm`, `.warn`, `.delete` |
| setwelcome/setgoodbye, setintro/intro, setmention/mention | same naam ke commands |
| setppgc, delppgc, join | same naam |
| play, song, play3, playch, ytmp3, video, yts | same naam |
| lyrics, searchthatsong | `.lyrics`, `.searchthatsong` |
| ig, pinterest, remini, ssweb, catbox, github | same naam (ig/remini ke liye config me API) |
| sticker, text-sticker, textfonts, text | `.sticker`, `.textsticker`, `.text` |
| gif, fetchGif, kiss | `.gif`, `.kiss` (+ hug pat slap cuddle bonk) |
| anime, Animeimg, ai, vv, whatsapp | same naam |
| swgc, swgcv2, swgcall, swgcv2all | same naam |
| blockDB.js | `.block`, `.unblock` |
| handier, serialize, plugins, createSocket, sessionManager, common, UrlUtil, client, miku-scheduler | `lib/` folder |

## Naya command jodna
`commands/` me koi bhi .js file banao (auto-load + menu me apne aap aa jayega):
```js
module.exports = [{ name: 'hello', category: 'fun', desc: 'Hi bolo', run: (x) => x.reply('Hello!') }];
```
Flags: `group:1`, `admin:1`, `botAdmin:1`, `owner:1`.


## Miku-MD stability fixes
- Welcome/Goodbye moved to `lib/welcome.js`; no Channel-forward header is attached there.
- Welcome/Goodbye use the member's real WhatsApp DP when available, with a fallback avatar.
- Default welcome/goodbye text is Hindi.
- HTTP helpers now use timeout + retry.
- GIF commands have a fallback API and friendly errors.
- YouTube audio commands have more robust request options and error handling.
- Status commands normalize recipients and report actual send errors.
- `antimedia` / `antisticker` no longer block a command caption from being processed.
- Plugin loading is isolated so one broken optional command file does not disable the whole menu.
- Owner command `.cmdcheck` shows which command modules actually loaded.


## Fixes in this build
- Group admin detection now handles WhatsApp LID/phone JID variants and refreshes group metadata before admin/bot-admin commands.
- `.delete` now explicitly requires both group admin and bot admin.
- `.antidelete` toggle now requires a group admin.
- YouTube play/song/video commands try multiple search results and multiple download clients, and no longer reject normal songs just because the first search result is a long compilation.
- YouTube audio is converted to MP3 when FFmpeg is available; audio/video file-size limits are checked before sending.
- `.sticker` and GIF reaction commands have an FFmpeg sticker-conversion fallback.
- `.kiss`, `.hug`, `.pat`, `.slap`, `.cuddle`, `.bonk` and other GIF reactions use three API fallbacks.
- `.ssweb` now tries two screenshot providers instead of silently failing on one provider.


---

## 🆕 v10 — naye commands

**👥 Group:** `.admins` `.gclink` `.resetlink` `.setname` `.setdesc` `.poll` `.topchat` `.resettopchat` `.warnlist` `.afk`

**🎨 Fun:** `.ship` `.truth` `.dare` `.tod` `.wyr` `.joke` `.shayari` `.quote` `.8ball` `.flip` `.dice` `.choose` `.rate` `.iq` `.luck` `.roast` `.compliment` `.getpp` `.calc`

**📡 Status:** `.quotestatus` `.gmstatus` `.gnstatus` `.bdaystatus <naam>` (+ `all` versions, owner) · `.statuscolor` `.setstatuscolor` · `.statuslist` · `.statushelp`

### Status color
Status ka default dark-green hata diya gaya hai. Ab har text-status ka color random (sundar palette) hota hai.
- Fix color: `config.js` me `statusColor: 'purple'` (ya `'#6A1B9A'`)
- WhatsApp se: `.setstatuscolor red` · `.setstatuscolor random` · `.setstatuscolor reset` · owner: `.setstatuscolor all blue`
- Ek baar ke liye: `.gcstatus Hello|purple`

---

## 🆕 v11 — fixes

### 1) Menu late aana / "Waiting for this message"
Bot ke paas `getMessage` cache nahi tha, isliye phone ko decrypt fail hone par retry nahi ho paata tha (2-3 min baad menu aata tha).
Ab har message cache hota hai (`lib/msgStore.js`) + group metadata cache se bhejna tez hai. Lamba menu ab video ke saath chhota head + alag text me jata hai.
Phir bhi "Waiting..." aaye to: bot ko apne hi number ke self-chat me test mat karo (group/dusre number se karo); ya `sessions/<number>` folder delete karke dobara pair karo.

### 2) Anti commands — delete / warn / kick
Har anti command ab 3 action deta hai:
```
.antilink on        -> on (default: warn)
.antilink delete    -> sirf message delete
.antilink warn      -> delete + warning (3 par kick)
.antilink kick      -> delete + turant kick
.antilink off
```
Ye sab par chalta hai: antilink, antilinkgc, antimedia, antisticker, antitoxic, antispam, antijudol, antiphising, antistatus, antigroupstatus, antitagsw, antihidetag, antibot. `.settings` me har on wale ke saath action icon dikhta hai.

### 3) .song / .play / .video / .ytmp3
"Sign in to confirm you're not a bot" = YouTube ne server ka IP block kiya hai. Ab:
- Bot start par `bin/yt-dlp` khud download/update karta hai.
- `cookies.txt` (YouTube cookies) bot folder me rakho, ya `config.yt.proxy` / env `YT_PROXY` set karo.
- Owner commands: `.ytcheck` (status) aur `.ytupdate` (yt-dlp update).
- Error message ab saaf batata hai ki kya karna hai.

---

## 🆕 v12 — Group status (.swgc / .gcstatus / .swgcv2all ...) fix

Error: *"Group status build nahi hua — Baileys version groupStatusMessageV2 support nahi karta"*
- Wajah: `package.json` me Baileys `^6.7.9` tha. Ye hamesha 6.x install karta hai, aur 6.x me group status hai hi nahi.
- Fix: Baileys ab `7.0.0-rc14` par hai (Node **20+** chahiye). Sabhi status commands (`.swgc .gcstatus .swgcv2 .swgcall .swgcv2all .quotestatus .gmstatus .gnstatus .bdaystatus` + `all` versions) ek hi function se bhejte hain, isliye sab ek saath theek ho jate hain.
- **Update kaise karein:** naya zip lagao, phir `npm install` chalao (ya sirf: `npm install @whiskeysockets/baileys@7.0.0-rc14`), bot restart karo.
- Check: `.botcheck` (owner) — Baileys version aur group-status support dikhata hai. Start hote waqt console me bhi likha aata hai.
- Baileys 7.x ESM hai: `lib/baileysLoader.js` purane/naye Node dono par sahi load karta hai.

## v13 changes
- config.js: `channels` (2 channel auto-follow), `telegramLink`, `dpUrls`, `menuImages`, `ownerDpUrl`, `welcomeVideoUrls`, `tgPairDp`, `tgSuccessDp`
- Har reply ke upar owner ka card (naam + number + DP)
- `.menu` = video + menu (song nahi) | `.allmenu` = alag-alag URL DP + menu + song, neeche channel ID/link + Telegram
- `.welcome` / `.goodbye` panel (on/off/bn/en/status); `.welcomevideo on/off`
- Anti messages Bengali (3 random) + tag + buttons: antilink, antilinkgc, linklock, antistatus, antigroupstatus, antitagsw
- Media: antipic, antivideo, antivoice, antisticker, antimedia -> sirf delete / kick (warning nahi)
- antibug (alias antiport): bug/crash message delete + kick
- `.play` = card + Audio/Video button (link nahi); `.video` ab hamesha MP4 bhejta hai
- Telegram: /pair par WhatsApp channel button, code ke saath DP, connect hone par DP

## VX-MD plugins (vx/ folder)
`vx/` me VX-MD ke plugins bina badle chalte hain; `lib/vxbridge.js` unhe Miku ke commands me jodta hai.
- VX se aaye: menu/allmenu/alive/list, gstatus(gs) swgc swgcall swgcv2 swgcv2all gstory delgcstatus, antilink antilinkgc antistatus antimedia antisticker (+pic/video/voice) linklock,
  welcome/goodbye + setwelcome/setgoodbye/type/video, kick kickall tagall open close grouptime delete, play play3 video, videosticker/linkblast/stickerblast, kiss.
- Same naam ka Miku command ho to VX wala chalta hai (Miku wala hat jata hai). `.song` Miku ka hi hai.
- VX ke settings `data/vxdb/` me save hote hain. `npm install` zaroor chalao (naye packages jude hain).
