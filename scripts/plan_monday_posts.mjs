import 'dotenv/config';

const POSTS = [
  {
    image: '/tmp/blondeshell_test_1_gym_mirror_selfie.png',
    theme: 'gym',
    tiktok: {
      caption: `POV: you actually stuck to your pilates plan this week 💅\n\nimagine thinking i'd skip leg day. couldn't be me.\n\n#pilatesgirl #gymtok #lagirls #fitcheck #pilatesbody`,
      postTime: '21:00 UTC', // 6 PM ET / 2 PM PT — TikTok evening peak
    },
    instagram: {
      caption: `pilates princess behavior 🩷\n\nforget gym bros — i'll be in the reformer room manifesting my dream body.\n\ncomment ur favorite workout below 👀\n\n.\n.\n.\n#pilates #pilatesgirl #fitnessmotivation #lalife #fitgirl #gymgirl #pilatesbody #fitspo #workoutmotivation #gymtime`,
      postTime: '19:00 UTC', // 3 PM ET / 12 PM PT — IG lunch peak
    },
  },
  {
    image: '/tmp/blondeshell_test_2_home_bedroom_casual.png',
    theme: 'home',
    tiktok: {
      caption: `monday vibes in my new apartment >>> everything else\n\ntell me ur weekend plans in the comments, i'm bored lol\n\n#morningvibes #aesthetic #lalife #mondayvibes #girlcore`,
      postTime: '14:00 UTC', // 9 AM ET / 6 AM PT - Saturday morning scroll
    },
    instagram: {
      caption: `slow mornings, soft light, zero plans ☁️\n\nthe prettiest kind of chaos is doing nothing at all. currently debating if i should order breakfast or actually cook...\n\nwyd rn?\n\n.\n.\n.\n#slowliving #aestheticvibes #morninglight #homedecor #lastyle #softaesthetic #cozyhome #minimalife #vibesonly`,
      postTime: '15:00 UTC', // 11 AM ET / 8 AM PT — IG morning
    },
  },
  {
    image: '/tmp/blondeshell_test_3_beach_sunset_walk.png',
    theme: 'beach',
    tiktok: {
      caption: `golden hour >>> any hour\n\nsanta monica doing numbers today ☀️🌊\n\n#goldenhour #santamonica #beachgirl #lagirls #sunset`,
      postTime: 'TUE_02:00 UTC', // Monday 7 PM PT = Tuesday 02:00 UTC — TikTok primetime
    },
    instagram: {
      caption: `california dreaming irl 🌅\n\nthe sun hit different today — like the universe was trying to remind me this is my life now.\n\nthrow a 🌊 in the comments if you'd rather be at the beach rn\n\n.\n.\n.\n#goldenhour #santamonica #california #beachvibes #sunsetchaser #californiagirl #beachgirl #lalife #lalifestyle #summeroutfit`,
      postTime: '23:00 UTC', // 7 PM ET / 4 PM PT — IG evening peak
    },
  },
];

// Next Monday in LA timezone (UTC-7 in spring)
function getNextMonday(timeSpec) {
  const isTuesday = timeSpec.startsWith('TUE_');
  const time = timeSpec.replace('TUE_', '').split(' ')[0];
  const [hour, min] = time.split(':').map(Number);
  const now = new Date();
  const daysUntilMonday = (1 - now.getUTCDay() + 7) % 7 || 7;
  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + daysUntilMonday + (isTuesday ? 1 : 0));
  target.setUTCHours(hour, min, 0, 0);
  return target.toISOString();
}

console.log('━━━ Monday Post Plan ━━━\n');
POSTS.forEach((p, i) => {
  console.log(`📸 Post ${i + 1}: ${p.theme.toUpperCase()}`);
  console.log(`   Image: ${p.image}`);
  console.log();
  console.log(`   🎵 TIKTOK — ${p.tiktok.postTime}`);
  console.log(`   Monday ISO: ${getNextMonday(p.tiktok.postTime)}`);
  console.log(`   Caption (${p.tiktok.caption.length} chars):`);
  p.tiktok.caption.split('\n').forEach(l => console.log(`     ${l}`));
  console.log();
  console.log(`   📷 INSTAGRAM — ${p.instagram.postTime}`);
  console.log(`   Monday ISO: ${getNextMonday(p.instagram.postTime)}`);
  console.log(`   Caption (${p.instagram.caption.length} chars):`);
  p.instagram.caption.split('\n').forEach(l => console.log(`     ${l}`));
  console.log();
  console.log('   ─────────────────────────\n');
});

console.log(`Total: 3 images × 2 platforms = 6 scheduled posts for Monday`);
console.log(`\nApprove all? Next step: run scripts/schedule_monday.mjs to push to Publer.\n`);
