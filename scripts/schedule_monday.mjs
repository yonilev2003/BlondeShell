import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { getPlatformIds, schedulePost } from '../lib/publer.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const POSTS = [
  {
    image: '/tmp/blondeshell_test_1_gym_mirror_selfie.png',
    theme: 'gym',
    tiktok: {
      caption: `POV: you actually stuck to your pilates plan this week 💅\n\nimagine thinking i'd skip leg day. couldn't be me.\n\n#pilatesgirl #gymtok #lagirls #fitcheck #pilatesbody`,
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

async function uploadToSupabase(localPath, filename) {
  const buffer = readFileSync(localPath);
  const storagePath = `monday-launch/${filename}`;

  await supabase.storage.from('content').upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });

  const { data: { publicUrl } } = supabase.storage.from('content').getPublicUrl(storagePath);
  return { publicUrl, storagePath };
}

console.log('\n━━━ Monday Schedule (REAL) ━━━\n');

// Verify all images exist
for (const p of POSTS) {
  if (!existsSync(p.image)) {
    console.error(`❌ Missing: ${p.image}`);
    console.error(`   Run: node scripts/test_fal_generate.mjs`);
    process.exit(1);
  }
}
console.log(`✅ All 3 images present\n`);

// Get platform IDs
console.log('Fetching Publer accounts...');
const accounts = await getPlatformIds();
if (!accounts.instagram || !accounts.tiktok) {
  console.error('❌ Missing IG or TikTok connection in Publer');
  process.exit(1);
}
console.log(`✅ IG: ${accounts.instagram.id}`);
console.log(`✅ TikTok: ${accounts.tiktok.id}\n`);

const results = [];

for (let i = 0; i < POSTS.length; i++) {
  const post = POSTS[i];
  console.log(`[${i + 1}/3] ${post.theme.toUpperCase()}`);

  // Upload image to Supabase for public URL
  const filename = `post_${i + 1}_${post.theme}.png`;
  console.log(`   📤 Uploading to Supabase storage...`);
  const { publicUrl, storagePath } = await uploadToSupabase(post.image, filename);
  console.log(`      ${publicUrl}`);

  // TikTok
  try {
    const ttTime = getMondayTime(post.tiktok.postTime, post.tiktok.dayOffset);
    console.log(`   🎵 TikTok @ ${ttTime}`);
    const jobId = await schedulePost({
      accountId: accounts.tiktok.id,
      networkKey: accounts.tiktok.networkKey,
      caption: post.tiktok.caption,
      scheduledAt: ttTime,
      mediaUrl: publicUrl,
    });
    console.log(`      ✅ job ${jobId}`);
    results.push({ theme: post.theme, platform: 'tiktok', jobId, time: ttTime, ok: true });
  } catch (err) {
    console.log(`      ❌ ${err.message}`);
    results.push({ theme: post.theme, platform: 'tiktok', error: err.message, ok: false });
  }

  // Instagram
  try {
    const igTime = getMondayTime(post.instagram.postTime, post.instagram.dayOffset);
    console.log(`   📷 Instagram @ ${igTime}`);
    const jobId = await schedulePost({
      accountId: accounts.instagram.id,
      networkKey: accounts.instagram.networkKey,
      caption: post.instagram.caption,
      scheduledAt: igTime,
      mediaUrl: publicUrl,
    });
    console.log(`      ✅ job ${jobId}`);
    results.push({ theme: post.theme, platform: 'instagram', jobId, time: igTime, ok: true, storagePath });
  } catch (err) {
    console.log(`      ❌ ${err.message}`);
    results.push({ theme: post.theme, platform: 'instagram', error: err.message, ok: false });
  }
  console.log();
}

console.log('━━━ Summary ━━━');
const ok = results.filter(r => r.ok).length;
console.log(`${ok}/${results.length} posts scheduled\n`);

if (ok === results.length) {
  console.log('🎉 Monday launch is locked in!');
  console.log('   Check app.publer.com → Scheduled to verify.\n');
  console.log('⚠️  Supabase storage: images will auto-delete after post goes live');
  console.log('   (via cleanup script after verifyPostLive confirms)\n');
}

// Log to agent_logs
await supabase.from('agent_logs').insert({
  agent: 'schedule_monday',
  task: 'launch_posts',
  status: ok === results.length ? 'completed' : 'partial',
  notes: JSON.stringify(results),
  created_at: new Date().toISOString(),
});
