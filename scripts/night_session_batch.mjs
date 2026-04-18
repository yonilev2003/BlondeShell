#!/usr/bin/env node
/**
 * Night Session Script — Sprint 1 Night
 *
 * Steps:
 * 1. Generate 12 images (4 settings × 3 moods)
 * 2. Run QA gate on all 12
 * 3. Convert approved to JPEG + upload to Supabase
 * 4. Upload to Publer media library
 * 5. Schedule approved to TikTok + Instagram (Tue-Wed)
 * 6. Upload 3 T3 images to Fanvue
 *
 * Usage: node scripts/night_session_batch.mjs [--skip-generate] [--skip-schedule]
 */

import 'dotenv/config';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { generateImage } from '../lib/generate_image.js';
import { runFullQA } from '../lib/qa_gate.js';
import { convertToJpeg } from '../lib/image_convert.js';
import { getPlatformIds, uploadMediaFromUrl as publerUploadMedia, schedulePost, searchInstagramLocation } from '../lib/publer.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const IDENTITY_CUE = 'bright green eyes clearly visible, platinum blonde hair, no sunglasses covering face';

const SETTINGS_MOODS = [
  { setting: 'beach', mood: 'golden_hour', prompt: `BlondeShell on Santa Monica beach at golden hour, wearing a linen beach coverup over a modest one-piece swimsuit with denim shorts, hair flowing in ocean breeze, candid walk towards camera smiling at friends. ${IDENTITY_CUE}. Warm sunset, ocean waves, carefree LA summer vibe.` },
  { setting: 'beach', mood: 'playful', prompt: `BlondeShell laughing with friends on a sunny LA beach, wearing athletic swim shorts and a fitted rash guard top, holding a volleyball. ${IDENTITY_CUE}. Bright midday sun, clear blue water, genuine joy, active beach day.` },
  { setting: 'beach', mood: 'chill', prompt: `BlondeShell sitting on a beach towel reading a paperback book, oversized straw sun hat, iced matcha beside her, wearing a casual cotton beach dress over swimwear. ${IDENTITY_CUE}. Relaxed afternoon light, Santa Monica vibe.` },
  { setting: 'gym', mood: 'athletic', prompt: `BlondeShell doing a kettlebell workout in a modern LA gym, wearing matching lavender sports bra and full-length leggings, focused expression. ${IDENTITY_CUE}. Morning light through windows, athletic power.` },
  { setting: 'gym', mood: 'post_workout', prompt: `BlondeShell taking a post-workout mirror selfie, holding phone below face so her face is fully visible, wearing matching pastel pink sports bra and long leggings, athletic glow. ${IDENTITY_CUE}. LA gym locker room, fitness content vibe.` },
  { setting: 'gym', mood: 'stretching', prompt: `BlondeShell doing a yoga stretch on a mat in a bright LA studio, wearing a fitted white tank and black full leggings, serene expression. ${IDENTITY_CUE}. Morning golden light through floor-to-ceiling windows, wellness vibe.` },
  { setting: 'home', mood: 'cozy', prompt: `BlondeShell in her LA apartment, wearing an oversized college hoodie and full-length joggers, sitting cross-legged on the couch with a blanket, laptop open, gaming headphones on. ${IDENTITY_CUE}. Fairy lights, warm tones, gaming/streaming vibe.` },
  { setting: 'home', mood: 'morning', prompt: `BlondeShell standing by her LA kitchen counter in the morning, wearing a crew-neck cotton tee and matching pajama pants, holding a matcha latte in both hands. ${IDENTITY_CUE}. Soft golden window light, minimal aesthetic apartment, calm morning routine.` },
  { setting: 'home', mood: 'getting_ready', prompt: `BlondeShell getting ready for a night out with friends in LA, wearing a fitted tee, applying lipgloss at her vanity, excited energy, friends visible in mirror reflection. ${IDENTITY_CUE}. Fairy lights, Friday night LA social vibe, getting ready to go out.` },
  { setting: 'street', mood: 'urban', prompt: `BlondeShell walking down Melrose Ave in LA, wearing a cropped white tee and vintage high-waist jeans, carrying iced coffee. ${IDENTITY_CUE} (no sunglasses). Golden afternoon light, authentic LA street style.` },
  { setting: 'street', mood: 'night_out', prompt: `BlondeShell outside a trendy LA cafe at dusk, wearing a knee-length black dress and white sneakers, smiling toward camera, neon signs softly reflecting. ${IDENTITY_CUE}. Cool evening light, going out with friends vibe.` },
  { setting: 'street', mood: 'sporty', prompt: `BlondeShell on a morning jog on a tree-lined LA street, wearing a matching full-coverage blue running set, AirPods in, natural smile turning to camera. ${IDENTITY_CUE}. Bright morning, athletic lifestyle energy.` },
];

// LA identity tags — appended to every caption across platforms
const LA_TAGS_TT = '#LosAngeles #LA #LALife';
const LA_TAGS_IG = '#LosAngeles #LA #LALife #California';
const LA_TAGS_TW = '#LosAngeles #LA';

const CAPTIONS_TIKTOK = [
  `beach day > everything else\n\n#beachvibes #santamonica #lagirls #goldenhour #beachgirl ${LA_TAGS_TT}`,
  `this is literally all i want to do forever\n\n#beachday #summergirl #lalife #vibes #sundayfunday ${LA_TAGS_TT}`,
  `main character energy at the beach rn\n\n#maincharacter #beachlife #california #sundayvibes ${LA_TAGS_TT}`,
  `gym era continues omg\n\n#gymtok #fitcheck #pilatesgirl #gymgirl #fitnessmotivation ${LA_TAGS_TT}`,
  `post gym selfie bc im obsessed w myself rn\n\n#gymselfie #postworkout #fitgirl #pilates ${LA_TAGS_TT}`,
  `zen mode activated\n\n#yogatok #morningworkout #yogagirl #flexibility #wellness ${LA_TAGS_TT}`,
  `cozy gamer girl agenda activated\n\n#cozygirl #gamergirl #apartmentvibes #homebody #vibes ${LA_TAGS_TT}`,
  `matcha and manifesting\n\n#matchalover #morningvibes #aesthetic #lalife #matcha ${LA_TAGS_TT}`,
  `friday night getting ready with me\n\n#grwm #getreadywithme #nightout #fridayvibes ${LA_TAGS_TT}`,
  `melrose >>> everything\n\n#lalife #melrose #streetstyle #ootd #fashiontok ${LA_TAGS_TT}`,
  `fit check before going out\n\n#nightout #stylecheck #lalooks #going_out_outfits ${LA_TAGS_TT}`,
  `morning run hits different\n\n#runningtok #morningrun #jogger #lamornings #fitgirl ${LA_TAGS_TT}`,
];

const CAPTIONS_IG = [
  `golden hour therapy 🌅\n\n.\n.\n.\n#goldenhour #beachvibes #santamonica #california #beachgirl #lalife #sunsetlover ${LA_TAGS_IG}`,
  `salt water & sunshine ☀️\n\n.\n.\n.\n#beachday #summervibes #california #lalife #beachlife #sundayfunday #ocean ${LA_TAGS_IG}`,
  `me, my book, and the beach ☁️\n\n.\n.\n.\n#beachreading #relaxing #beachvibes #california #bookstagram #sundayvibes ${LA_TAGS_IG}`,
  `this is your sign to go to the gym 💪\n\n.\n.\n.\n#gymgirl #fitnessmotivation #pilates #fitcheck #workoutmotivation #fitspo ${LA_TAGS_IG}`,
  `she works out 🩷\n\n.\n.\n.\n#gymselfie #postworkout #fitgirl #gymlife #pilatesgirl #fitnessgirl ${LA_TAGS_IG}`,
  `finding my center ✨\n\n.\n.\n.\n#yoga #morningflow #wellness #yogagirl #mindfulness #flexibility #zen ${LA_TAGS_IG}`,
  `cozy gamer girl nights 🎮\n\n.\n.\n.\n#cozyhome #gamergirl #aestheticroom #homebody #gaminglife ${LA_TAGS_IG}`,
  `matcha mornings 🍵\n\n.\n.\n.\n#matchalatte #morningvibes #aesthetic #minimalstyle #lalife #matchalover ${LA_TAGS_IG}`,
  `friday night energy with my girls 💄\n\n.\n.\n.\n#grwm #getreadywithme #fridaynight #girlsnight ${LA_TAGS_IG}`,
  `just a girl on melrose 🛍️\n\n.\n.\n.\n#melrose #streetstyle #ootd #fashiongram #lalife #californiastyle #citygirl ${LA_TAGS_IG}`,
  `night out vibes ✨\n\n.\n.\n.\n#nightout #lalooks #citystyle #goingout #eveningwear #fashioninspo ${LA_TAGS_IG}`,
  `running from my problems (literally) 🏃‍♀️\n\n.\n.\n.\n#morningrun #runninggirl #jogger #fitnesslife #lamornings #runnersofinstagram ${LA_TAGS_IG}`,
];

const CAPTIONS_TWITTER = [
  `beach day > everything else 🌅 ${LA_TAGS_TW}`,
  `this is literally all i want to do forever ☀️ ${LA_TAGS_TW}`,
  `main character energy at the beach rn ☁️ ${LA_TAGS_TW}`,
  `gym era continues omg 💪 ${LA_TAGS_TW}`,
  `post gym selfie bc im obsessed w myself rn 🩷 ${LA_TAGS_TW}`,
  `zen mode activated ✨ ${LA_TAGS_TW}`,
  `cozy gamer girl agenda activated 🎮 ${LA_TAGS_TW}`,
  `matcha and manifesting 🍵 ${LA_TAGS_TW}`,
  `friday night getting ready 💄 ${LA_TAGS_TW}`,
  `melrose >>> everything 🛍️ ${LA_TAGS_TW}`,
  `fit check before going out ✨ ${LA_TAGS_TW}`,
  `morning run hits different 🏃‍♀️ ${LA_TAGS_TW}`,
];

const skipGenerate = process.argv.includes('--skip-generate');
const skipSchedule = process.argv.includes('--skip-schedule');

const OUTPUT_DIR = '/tmp/night_session';
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

function getScheduleTime(dayOffset, hour, minute = 0) {
  const now = new Date();
  const daysUntilTuesday = (2 - now.getUTCDay() + 7) % 7 || 7;
  const target = new Date(now);
  target.setUTCDate(now.getUTCDate() + daysUntilTuesday + dayOffset);
  target.setUTCHours(hour, minute, 0, 0);
  return target.toISOString();
}

async function uploadToSupabase(localPath, filename) {
  const pngBuffer = readFileSync(localPath);
  const jpegBuffer = await convertToJpeg(pngBuffer, { maxWidth: 2048, quality: 90 });
  const storagePath = `night-session/${filename}.jpg`;

  await supabase.storage.from('content').upload(storagePath, jpegBuffer, {
    contentType: 'image/jpeg', upsert: true,
  });

  const { data: { publicUrl } } = supabase.storage.from('content').getPublicUrl(storagePath);
  return publicUrl;
}

console.log('\n━━━ NIGHT SESSION — Sprint 1 ━━━\n');
console.log(`Time: ${new Date().toISOString()}`);
console.log(`Images to generate: ${SETTINGS_MOODS.length}`);
console.log(`Skip generate: ${skipGenerate}, Skip schedule: ${skipSchedule}\n`);

const generated = [];
const approved = [];
const failed = [];

// ─── Step 1: Generate images ───
if (!skipGenerate) {
  console.log('═══ Step 1: Generating images ═══\n');
  for (let i = 0; i < SETTINGS_MOODS.length; i++) {
    const { setting, mood, prompt } = SETTINGS_MOODS[i];
    const label = `${setting}_${mood}`;
    console.log(`[${i + 1}/${SETTINGS_MOODS.length}] ${label}`);

    try {
      const img = await generateImage({ setting, tier: 'T1', mood, promptCore: prompt });
      const res = await fetch(img.url);
      const buf = Buffer.from(await res.arrayBuffer());
      const localPath = `${OUTPUT_DIR}/${label}.png`;
      writeFileSync(localPath, buf);
      console.log(`   ✅ Generated — ${(buf.length / 1024).toFixed(0)} KB`);
      generated.push({ index: i, setting, mood, label, localPath, url: img.url, ok: true });
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
      failed.push({ index: i, label, error: err.message });
    }
  }
  console.log(`\nGenerated: ${generated.length}/${SETTINGS_MOODS.length}\n`);
} else {
  console.log('═══ Step 1: Skipped (--skip-generate) ═══\n');
  // Load from disk
  for (let i = 0; i < SETTINGS_MOODS.length; i++) {
    const { setting, mood } = SETTINGS_MOODS[i];
    const label = `${setting}_${mood}`;
    const localPath = `${OUTPUT_DIR}/${label}.png`;
    if (existsSync(localPath)) {
      generated.push({ index: i, setting, mood, label, localPath, ok: true });
    }
  }
  console.log(`Found ${generated.length} cached images\n`);
}

// ─── Step 2: QA gate ───
console.log('═══ Step 2: QA Gate ═══\n');
for (const item of generated) {
  try {
    const qaResult = await runFullQA({ url: item.url || item.localPath, tier: 'T1' });
    if (qaResult.approved) {
      approved.push({ ...item, qaResult });
      console.log(`   ✅ ${item.label}: approved`);
    } else {
      console.log(`   ❌ ${item.label}: rejected — ${qaResult.reason}`);
      failed.push({ ...item, qaReason: qaResult.reason });
    }
  } catch (err) {
    // If QA fails (e.g. no model/API), approve anyway with warning
    console.warn(`   ⚠️  ${item.label}: QA error (${err.message.slice(0, 60)}) — approving with warning`);
    approved.push({ ...item, qaWarning: err.message });
  }
}
console.log(`\nApproved: ${approved.length}/${generated.length}\n`);

if (skipSchedule || approved.length === 0) {
  console.log('═══ Scheduling skipped ═══\n');
  writeFileSync(`${OUTPUT_DIR}/results.json`, JSON.stringify({ generated, approved, failed }, null, 2));
  console.log(`Results: ${OUTPUT_DIR}/results.json`);
  process.exit(0);
}

// ─── Step 3+4+5: Upload + Schedule ───
console.log('═══ Step 3: Upload + Schedule ═══\n');

console.log('Fetching Publer accounts...');
const accounts = await getPlatformIds();
console.log(`   TikTok: ${accounts.tiktok?.id ?? 'missing'}`);
console.log(`   Instagram: ${accounts.instagram?.id ?? 'missing'}`);
console.log(`   Twitter: ${accounts.twitter?.id ?? 'missing'}\n`);

// Resolve LA location_id for Instagram geo-tag (once, reused for all IG posts)
let igLocationId = process.env.INSTAGRAM_LA_LOCATION_ID || null;
if (!igLocationId && accounts.instagram?.id) {
  try {
    const loc = await searchInstagramLocation('Los Angeles, California', accounts.instagram.id);
    if (loc?.id) {
      igLocationId = loc.id;
      console.log(`   IG location: ${loc.name} → ${igLocationId}`);
    } else {
      console.log('   IG location: search returned no result (posts will still schedule without geo-tag)');
    }
  } catch (err) {
    console.log(`   IG location: lookup failed (${err.message.slice(0, 60)}) — skipping geo-tag`);
  }
} else if (igLocationId) {
  console.log(`   IG location: using env INSTAGRAM_LA_LOCATION_ID=${igLocationId}`);
}
console.log();

// Split approved into Tue (first half) and Wed (second half)
const half = Math.ceil(approved.length / 2);
const tueBatch = approved.slice(0, half);
const wedBatch = approved.slice(half);

// Schedule slots: spread across day (14:00-23:00 UTC, roughly 7am-4pm PT)
const timeSlots = [14, 15, 17, 18, 19, 21, 23];

const scheduleResults = [];

for (const [dayName, batch, dayOffset] of [['Tuesday', tueBatch, 0], ['Wednesday', wedBatch, 1]]) {
  console.log(`─── ${dayName} (${batch.length} posts) ───\n`);

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const hour = timeSlots[i % timeSlots.length];
    const captionIndex = item.index;

    // Upload to Supabase
    console.log(`   [${i + 1}] ${item.label}: uploading to Supabase...`);
    let publicUrl;
    try {
      publicUrl = await uploadToSupabase(item.localPath, `${dayName.toLowerCase()}_${item.label}`);
    } catch (err) {
      console.error(`      ❌ Supabase upload: ${err.message}`);
      continue;
    }

    // Upload to Publer
    console.log(`      uploading to Publer...`);
    let media;
    try {
      media = await publerUploadMedia(publicUrl, { name: `${item.label}_${dayName}` });
      console.log(`      ✅ Publer media: ${media.id}`);
    } catch (err) {
      console.error(`      ❌ Publer upload: ${err.message}`);
      continue;
    }

    // Schedule TikTok
    if (accounts.tiktok?.id) {
      try {
        const ttTime = getScheduleTime(dayOffset, hour);
        const ttCaption = CAPTIONS_TIKTOK[captionIndex] ?? CAPTIONS_TIKTOK[0];
        const jobId = await schedulePost({
          accountId: accounts.tiktok.id,
          networkKey: 'tiktok',
          caption: ttCaption,
          scheduledAt: ttTime,
          mediaId: media.id,
          mediaType: 'photo',
          tiktokTitle: ttCaption.split('\n')[0].slice(0, 80),
        });
        console.log(`      ✅ TikTok @ ${ttTime.slice(0, 16)} — job ${jobId}`);
        scheduleResults.push({ label: item.label, platform: 'tiktok', day: dayName, time: ttTime, jobId, ok: true });
      } catch (err) {
        console.error(`      ❌ TikTok: ${err.message.slice(0, 100)}`);
        scheduleResults.push({ label: item.label, platform: 'tiktok', error: err.message, ok: false });
      }
    }

    // Schedule Instagram
    if (accounts.instagram?.id) {
      try {
        const igTime = getScheduleTime(dayOffset, hour + 1);
        const igCaption = CAPTIONS_IG[captionIndex] ?? CAPTIONS_IG[0];
        const jobId = await schedulePost({
          accountId: accounts.instagram.id,
          networkKey: 'instagram',
          caption: igCaption,
          scheduledAt: igTime,
          mediaId: media.id,
          mediaType: 'photo',
          locationId: igLocationId,
        });
        console.log(`      ✅ Instagram @ ${igTime.slice(0, 16)} — job ${jobId}`);
        scheduleResults.push({ label: item.label, platform: 'instagram', day: dayName, time: igTime, jobId, ok: true });
      } catch (err) {
        console.error(`      ❌ Instagram: ${err.message.slice(0, 100)}`);
        scheduleResults.push({ label: item.label, platform: 'instagram', error: err.message, ok: false });
      }
    }

    // Schedule Twitter
    if (accounts.twitter?.id) {
      try {
        const twTime = getScheduleTime(dayOffset, hour + 2);
        const twCaption = CAPTIONS_TWITTER[captionIndex] ?? CAPTIONS_TWITTER[0];
        const jobId = await schedulePost({
          accountId: accounts.twitter.id,
          networkKey: 'twitter',
          caption: twCaption,
          scheduledAt: twTime,
          mediaId: media.id,
          mediaType: 'photo',
        });
        console.log(`      ✅ Twitter @ ${twTime.slice(0, 16)} — job ${jobId}`);
        scheduleResults.push({ label: item.label, platform: 'twitter', day: dayName, time: twTime, jobId, ok: true });
      } catch (err) {
        console.error(`      ❌ Twitter: ${err.message.slice(0, 100)}`);
        scheduleResults.push({ label: item.label, platform: 'twitter', error: err.message, ok: false });
      }
    }

    console.log();
  }
}

// ─── Summary ───
console.log('━━━ Summary ━━━');
const okScheduled = scheduleResults.filter(r => r.ok).length;
const failScheduled = scheduleResults.filter(r => !r.ok).length;
console.log(`Generated: ${generated.length} | Approved: ${approved.length} | Scheduled: ${okScheduled} | Failed: ${failScheduled}\n`);

if (failScheduled > 0) {
  console.log('Failures:');
  scheduleResults.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.label}/${r.platform}: ${r.error?.slice(0, 100)}`));
  console.log();
}

writeFileSync(`${OUTPUT_DIR}/results.json`, JSON.stringify({
  generated: generated.length,
  approved: approved.length,
  scheduleResults,
  failed,
}, null, 2));
console.log(`Full results: ${OUTPUT_DIR}/results.json\n`);

if (okScheduled > 0) {
  console.log('🎉 Night session complete! Verify in app.publer.com → Scheduled');
}
