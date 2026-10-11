// Saare Bengali (BN) messages — har jagah 3 alag-alag, random chalte hain.
// @user = tag, @count = warning count, @limit = warn limit
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const SETS = {
  link: [
    '🚫 @user, এই গ্রুপে লিংক দেওয়া সম্পূর্ণ নিষিদ্ধ!\n🗑️ তোমার লিংকটি ডিলিট করে দেওয়া হয়েছে।',
    '⚠️ @user, গ্রুপের নিয়ম ভাঙা চলবে না!\nলিংক পাঠানো এখানে অনুমোদিত নয়, তাই তোমার মেসেজ মুছে ফেলা হলো।',
    '❌ @user, আবার লিংক দিলে কিন্তু গ্রুপ থেকে বের করে দেওয়া হবে!\n🗑️ তোমার লিংকটি ডিলিট করা হয়েছে।',
  ],
  linkgc: [
    '🚫 @user, এই গ্রুপে অন্য গ্রুপের লিংক দেওয়া নিষেধ!\n🗑️ তোমার লিংকটি ডিলিট করা হয়েছে।',
    '⚠️ @user, গ্রুপ লিংক শেয়ার করা এখানে অনুমোদিত নয়!\nতোমার মেসেজটি মুছে ফেলা হলো।',
    '❌ @user, অন্য গ্রুপের প্রচার করা চলবে না!\n🗑️ লিংকটি ডিলিট করা হয়েছে, পরেরবার সাবধান।',
  ],
  linklock: [
    '🔒 @user, এই গ্রুপে লিংক লক করা আছে!\n🗑️ তোমার লিংকটি ডিলিট করা হয়েছে।',
    '🔐 @user, লিংক পাঠানো এখন বন্ধ, অ্যাডমিন ছাড়া কেউ লিংক দিতে পারবে না!\nমেসেজ মুছে ফেলা হলো।',
    '⛔ @user, লিংক লক চালু আছে! নিয়ম মেনে চলো, নইলে গ্রুপ থেকে বাদ পড়বে।',
  ],
  status: [
    '🚫 @user, এই গ্রুপে স্টেটাস মেনশন করা নিষিদ্ধ!\n🗑️ তোমার মেসেজটি ডিলিট করা হয়েছে।',
    '⚠️ @user, গ্রুপে স্টেটাস ট্যাগ করা চলবে না!\nতোমার মেসেজ মুছে ফেলা হলো।',
    '❌ @user, আবার স্টেটাস মেনশন করলে গ্রুপ থেকে বের করে দেওয়া হবে!\n🗑️ মেসেজ ডিলিট করা হয়েছে।',
  ],
  pic: [
    '📸 @user, এই গ্রুপে ছবি পাঠানো নিষেধ!\n🗑️ তোমার ছবিটি ডিলিট করা হয়েছে।',
    '🚫 @user, গ্রুপে ছবি দেওয়া এখানে অনুমোদিত নয়!\nতোমার ছবি মুছে ফেলা হলো।',
    '❌ @user, আবার ছবি দিলে কিন্তু রেহাই নেই!\n🗑️ ছবিটি ডিলিট করা হয়েছে।',
  ],
  video: [
    '🎬 @user, এই গ্রুপে ভিডিও পাঠানো নিষেধ!\n🗑️ তোমার ভিডিওটি ডিলিট করা হয়েছে।',
    '🚫 @user, গ্রুপে ভিডিও দেওয়া অনুমোদিত নয়!\nতোমার ভিডিও মুছে ফেলা হলো।',
    '❌ @user, আবার ভিডিও দিলে গ্রুপ থেকে বের করে দেওয়া হবে!\n🗑️ ভিডিওটি ডিলিট করা হয়েছে।',
  ],
  voice: [
    '🎙️ @user, এই গ্রুপে ভয়েস মেসেজ পাঠানো নিষেধ!\n🗑️ তোমার ভয়েসটি ডিলিট করা হয়েছে।',
    '🚫 @user, গ্রুপে অডিও/ভয়েস দেওয়া অনুমোদিত নয়!\nতোমার ভয়েস মুছে ফেলা হলো।',
    '❌ @user, আবার ভয়েস দিলে কিন্তু ছাড় পাবে না!\n🗑️ ভয়েসটি ডিলিট করা হয়েছে।',
  ],
  sticker: [
    '🎭 @user, এই গ্রুপে স্টিকার পাঠানো নিষেধ!\n🗑️ তোমার স্টিকারটি ডিলিট করা হয়েছে।',
    '🚫 @user, গ্রুপে স্টিকার দেওয়া অনুমোদিত নয়!\nস্টিকারটি মুছে ফেলা হলো।',
    '❌ @user, আবার স্টিকার দিলে গ্রুপ থেকে বের করে দেওয়া হবে!\n🗑️ স্টিকার ডিলিট করা হয়েছে।',
  ],
  doc: [
    '📁 @user, এই গ্রুপে ফাইল/ডকুমেন্ট পাঠানো নিষেধ!\n🗑️ তোমার ফাইলটি ডিলিট করা হয়েছে।',
    '🚫 @user, গ্রুপে ফাইল দেওয়া অনুমোদিত নয়!\nতোমার ফাইল মুছে ফেলা হলো।',
    '❌ @user, আবার ফাইল দিলে কিন্তু ছাড় পাবে না!\n🗑️ ফাইলটি ডিলিট করা হয়েছে।',
  ],
  bug: [
    '☠️ @user, এই গ্রুপে বাগ/ক্র্যাশ মেসেজ পাঠানো নিষেধ!\n🗑️ তোমার মেসেজটি ডিলিট করা হয়েছে।',
    '🛡️ @user, বাগ পাঠিয়ে লাভ নেই, আমাদের অ্যান্টি-বাগ চালু আছে!\nমেসেজ মুছে ফেলা হলো।',
    '🚨 @user, বাগ মেসেজ ধরা পড়েছে! এই গ্রুপে এসব চলবে না।\n🗑️ মেসেজ ডিলিট করা হয়েছে।',
  ],
  generic: [
    '🚫 @user, এই গ্রুপে এটি অনুমোদিত নয়!\n🗑️ তোমার মেসেজটি ডিলিট করা হয়েছে।',
    '⚠️ @user, গ্রুপের নিয়ম মেনে চলো!\nতোমার মেসেজ মুছে ফেলা হলো।',
    '❌ @user, আবার এমন করলে গ্রুপ থেকে বের করে দেওয়া হবে!\n🗑️ মেসেজ ডিলিট করা হয়েছে।',
  ],
};

// anti feature -> message set
const SET_OF = {
  antilink: 'link', antilinkgc: 'linkgc', linklock: 'linklock',
  antistatus: 'status', antigroupstatus: 'status', antitagsw: 'status',
  antipic: 'pic', antivideo: 'video', antivoice: 'voice', antisticker: 'sticker', antibug: 'bug',
};
const MEDIA_SET = { imageMessage: 'pic', videoMessage: 'video', audioMessage: 'voice', documentMessage: 'doc', stickerMessage: 'sticker' };

function antiText(name, x, extra = {}) {
  const set = name === 'antimedia' ? (MEDIA_SET[x.mtype] || 'generic') : (SET_OF[name] || 'generic');
  let t = pick(SETS[set] || SETS.generic).replace(/@user/g, '@' + x.senderNum);
  if (extra.warn) t += `\n\n⚠️ সতর্কতা: ${extra.warn.n}/${extra.warn.limit}`;
  if (extra.kicked) t += '\n\n🚪 তাই তোমাকে গ্রুপ থেকে বের করে দেওয়া হলো।';
  return t;
}

// ---- Welcome / Goodbye ----
const WELCOME = {
  bn: [
    '🎉 *স্বাগতম!*\n\n@user, *@group* গ্রুপে তোমাকে আন্তরিক স্বাগত! 💐\n👥 মোট সদস্য: @count\n\n✨ গ্রুপের নিয়ম মেনে চলো আর আড্ডা উপভোগ করো।',
    '🌸 *নতুন সদস্য!*\n\nহ্যালো @user, *@group* পরিবারে তোমাকে স্বাগত! 🤗\n👥 এখন আমরা @count জন।\n\n🙏 সবার সাথে মিলেমিশে থাকো।',
    '💫 *Welcome!*\n\n@user, তোমাকে পেয়ে *@group* গ্রুপ আরও সুন্দর হলো! 🎊\n👥 সদস্য সংখ্যা: @count\n\n📌 নিয়ম মেনে চলো, মজা করো!',
  ],
  en: [
    '🎉 *Welcome!*\n\n@user, a warm welcome to *@group*! 💐\n👥 Members: @count\n\n✨ Follow the group rules and enjoy.',
    '🌸 *New Member!*\n\nHello @user, welcome to the *@group* family! 🤗\n👥 We are now @count.\n\n🙏 Be nice to everyone.',
    '💫 *Welcome!*\n\n@user, *@group* just got better with you here! 🎊\n👥 Total members: @count\n\n📌 Follow the rules and have fun!',
  ],
};
const GOODBYE = {
  bn: [
    '👋 *বিদায়!*\n\n@user গ্রুপ ছেড়ে চলে গেছে। 😢\n👥 এখন সদস্য: @count\n\n🙏 ভালো থেকো!',
    '🥀 *আবার দেখা হবে*\n\n@user আর আমাদের সাথে নেই।\n👥 বর্তমান সদস্য: @count\n\n💔 যেখানেই থাকো, ভালো থেকো।',
    '😔 *Goodbye*\n\n@user, *@group* ছেড়ে গেলে! তোমাকে মিস করব।\n👥 সদস্য: @count',
  ],
  en: [
    '👋 *Goodbye!*\n\n@user has left the group. 😢\n👥 Members now: @count\n\n🙏 Take care!',
    '🥀 *See you again*\n\n@user is no longer with us.\n👥 Current members: @count\n\n💔 Stay well wherever you are.',
    '😔 *Goodbye*\n\n@user left *@group*. We will miss you.\n👥 Members: @count',
  ],
};

// ---- grouptime ----
const OPEN_MSG = [
  '🔓 *গ্রুপ খুলে দেওয়া হলো!* ({time})\nএখন সবাই মেসেজ করতে পারবে। 🎉',
  '✅ *গ্রুপ ওপেন* ({time})\nসবাই এখন কথা বলতে পারো, আড্ডা শুরু করো! 💬',
  '🌅 *গ্রুপ চালু হয়েছে* ({time})\nসবাইকে স্বাগত, মেসেজ করতে পারো। 😊',
];
const CLOSE_MSG = [
  '🔒 *গ্রুপ বন্ধ করা হলো!* ({time})\nএখন শুধু অ্যাডমিনরা মেসেজ করতে পারবে।',
  '⛔ *গ্রুপ ক্লোজ* ({time})\nসবাইকে ধন্যবাদ, আবার দেখা হবে! 🌙',
  '🌙 *শুভ রাত্রি!* ({time})\nগ্রুপ এখন বন্ধ, শুধু অ্যাডমিন লিখতে পারবে।',
];

module.exports = { pick, SETS, antiText, WELCOME, GOODBYE, OPEN_MSG, CLOSE_MSG };
