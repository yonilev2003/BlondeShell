import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { getPlatformIds, uploadMediaFromUrl, schedulePost } from '../lib/publer.js';
import { convertToJpeg } from '../lib/image_convert.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const POSTS = [
  {
    image: '/tmp/blondeshell_test_1_gym_mirror_selfie.png',
    theme: 'gym',
    tiktok: {
      caption: `POV: you actually stuck to your pilates plan this week 💅\n\nimagine thinking i'd skip leg day. couldn't be me.\n\n#pilatesgirl #gymtok #lagirls #fitcheck #pilatesbody`,
      title: 'pilates princess era',
      postTime: '21:00',
      dayOffset: 0,
    },
    instagram: {
      caption: `pilates princess behavior 🩷\n\nforget gym bros — i'll be in the reformer room manifesting my dream body.\n\ncomment ur favorite workout below 👀\n\n.\n.\n.\n#pilates #pilatesgirl #fitnessmotivation #lalife #fitgirl #gymgirl #pilatesbody #fitspo #workoutmotivation #gymtime`,
      postTime: '19:00',
      dayOffset: 0,
    },
  },
  {
    image: '/tmp/blondeshell_test_2_home_bedroom_casual.png',
    theme: 'home',
    tiktok: {
      caption: `monday vibes in my new apartment >>> everything else\n\ntell me ur weekend plans in the comments, i'm bored lol\n\n#morningvibes #aesthetic #lalife #mondayvibes #girlcore`,
      title: 'monday morning aesthetic',
      postTime: '14:00',
      dayOffset: 0,
    },
    instagram: {
      caption: `slow mornings, soft light, zero plans ☁️\n\nthe prettiest kind of chaos is doing nothing at all. currently debating if i should order breakfast or actually cook...\n\nwyd rn?\n\n.\n.\n.\n#slowliving #aestheticvibes #morninglight #homedecor #lastyle #softaesthetic #cozyhome #minimalife #vibesonly`,
      postTime: '15:00',
      dayOffset: 0,
    },
  },
  {
    image: '/tmp/blondeshell_test_3_beach_sunset_walk.png',
    theme: 'beach',
    tiktok: {
      caption: `golden hour >>> any hour\n\nsanta monica doing numbers today ☀️🌊\n\n#goldenhour #santamonica #beachgirl #lagirls #sunset`,
      title: 'santa monica golden hour',
      postTime: '02:00',
      dayOffset: 1,
    },
    instagram: {
      caption: `california dreaming irl 🌅\n\nthe sun hit different today — like the universe was trying to remind me this is my life now.\n\nthrow a 🌊 in the comments if you'd rather be at the beach rn\n\n.\n.\n.\n#goldenhour #santamonica #california #beachvibes #sunsetchaser #californiagirl #beachgirl #lalife #lalifestyle #summeroutfit`,
      postTime: '23:00',
      dayOffset: 0,
    },
  },
];

function getMondayTime(hhmm, dayOffset = 0) {
  const [hour, min] = hhmm.split(':').map(Number);
  const now = new Date();
  const daysUntilMonday = (1 - now.getUTCDay() + 7) % 7 || 7;
  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + daysUntilMonday + dayOffset);
  target.setUTCHours(hour, min, 0, 0);
  return target.toISOString();
}

async function ensureSupabaseUrl(localPngPath, filename) {
  const pngBuffer = readFileSync(localPngPath);
  const jpegBuffer = await convertToJpeg(pngBuffer, { maxWidth: 2048, quality: 90 });
  const storagePath = `monday-launch/${filename}.jpg`;

  await supabase.storage.from('content').upload(storagePath, jpegBuffer, {
    contentType: 'image/jpeg', upsert: true,
  });

  const { data: { publicUrl } } = supabase.storage.from('content').getPublicUrl(storagePath);
  return publicUrl;
}

console.log('\n━━━ Monday Schedule v2 (proper flow) ━━━\n');

for (const p of POSTS) {
  if (!existsSync(p.image)) {
    console.error(`❌ Missing: ${p.image}`);
    console.error(`   Run: node scripts/test_fal_generate.mjs`);
    process.exit(1);
  }
}
console.log(`✅ All 3 local images present\n`);

console.log('Fetching Publer accounts...');
const accounts = await getPlatformIds();
if (!accounts.instagram || !accounts.tiktok) {
  console.error('❌ Missing IG or TikTok in Publer');
  process.exit(1);
}
console.log(`✅ IG: ${accounts.instagram.id} (${accounts.instagram.accountType})`);
console.log(`✅ TikTok: ${accounts.tiktok.id}\n`);

const results = [];

for (let i = 0; i < POSTS.length; i++) {
  const post = POSTS[i];
  console.log(`─── [${i + 1}/3] ${post.theme.toUpperCase()} ───`);

  // Step 1: convert to JPEG and upload to Supabase
  console.log(`   1. Converting + uploading to Supabase storage...`);
  const publicUrl = await ensureSupabaseUrl(post.image, `post_${i + 1}_${post.theme}`);
  console.log(`      ${publicUrl}`);

  // Step 2: upload to Publer's media library (get Publer media ID)
  console.log(`   2. Uploading to Publer media library...`);
  let media;
  try {
    media = await uploadMediaFromUrl(publicUrl, {
      name: `${post.theme}_monday`,
      caption: post.instagram.caption.slice(0, 100),
    });
    console.log(`      ✅ Publer media id: ${media.id}`);
    if (media.validity) {
      const validInstagram = media.validity.instagram?.photo ?? media.validity.ig_business?.photo;
      const validTiktok = media.validity.tiktok?.photo ?? media.validity.tiktok?.video;
      console.log(`      validity: instagram=${!!validInstagram}, tiktok=${!!validTiktok}`);
    }
  } catch (err) {
    console.log(`      ❌ Publer upload failed: ${err.message}`);
    results.push({ theme: post.theme, error: err.message });
    continue;
  }

  // Step 3: schedule TikTok
  try {
    const ttTime = getMondayTime(post.tiktok.postTime, post.tiktok.dayOffset);
    console.log(`   3. TikTok @ ${ttTime}`);
    const jobId = await schedulePost({
      accountId: accounts.tiktok.id,
      networkKey: 'tiktok',
      caption: post.tiktok.caption,
      scheduledAt: ttTime,
      mediaId: media.id,
      mediaType: 'photo',
      tiktokTitle: post.tiktok.title,
    });
    console.log(`      ✅ job ${jobId}`);
    results.push({ theme: post.theme, platform: 'tiktok', jobId, time: ttTime, ok: true });
  } catch (err) {
    console.log(`      ❌ TikTok: ${err.message}`);
    results.push({ theme: post.theme, platform: 'tiktok', error: err.message, ok: false });
  }

  // Step 4: schedule Instagram
  try {
    const igTime = getMondayTime(post.instagram.postTime, post.instagram.dayOffset);
    console.log(`   4. Instagram @ ${igTime}`);
    const jobId = await schedulePost({
      accountId: accounts.instagram.id,
      networkKey: 'instagram',
      caption: post.instagram.caption,
      scheduledAt: igTime,
      mediaId: media.id,
      mediaType: 'photo',
    });
    console.log(`      ✅ job ${jobId}`);
    results.push({ theme: post.theme, platform: 'instagram', jobId, time: igTime, ok: true });
  } catch (err) {
    console.log(`      ❌ Instagram: ${err.message}`);
    results.push({ theme: post.theme, platform: 'instagram', error: err.message, ok: false });
  }
  console.log();
}

console.log('━━━ Summary ━━━');
const ok = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok);
console.log(`${ok}/${results.length} posts scheduled\n`);

if (fail.length > 0) {
  console.log('Failures:');
  fail.forEach(r => console.log(`  ❌ ${r.theme}/${r.platform}: ${r.error?.slice(0, 150)}`));
  console.log();
}

writeFileSync('/tmp/monday_v2_results.json', JSON.stringify(results, null, 2));
console.log('Full results: /tmp/monday_v2_results.json\n');

if (ok === results.length) {
  console.log('🎉 Monday launch is locked in! Verify in app.publer.com → Scheduled');
}
