import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { generateVideo } from '../lib/generate_video.js';
import { getPlatformIds, uploadMediaFromUrl, schedulePost } from '../lib/publer.js';

const RESULTS = '/tmp/night_session/results.json';
const OUT = '/tmp/night_session/videos.json';
const MAX_VIDEOS = parseInt(process.env.VIDEO_COUNT || '6', 10);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function settingFromName(name) {
  if (name.startsWith('beach')) return 'beach';
  if (name.startsWith('gym')) return 'gym';
  if (name.startsWith('street')) return 'street';
  return 'home';
}

const CAPTIONS_BY_SETTING = {
  beach: [
    { tt: 'ok but the ocean is literally my therapist', ig: 'the sound of waves >> any playlist 🌊', tw: 'beach therapy hits different' },
    { tt: 'pov: this is your sign to book the flight', ig: 'california summer never ends 🌅', tw: 'living for these sunsets' },
  ],
  gym: [
    { tt: 'day 47 of becoming that girl', ig: 'consistency > motivation every single time 💪', tw: 'gym era activated' },
    { tt: 'she lifts, she stretches, she slays', ig: 'the glow up is showing up 🏋️‍♀️', tw: 'pilates girl summer' },
  ],
  street: [
    { tt: 'la mornings hit different tbh', ig: 'golden hour walks = cheapest therapy ☕', tw: 'just a girl & her coffee' },
    { tt: 'main character energy only', ig: 'outside is healing me 🌿', tw: 'romanticizing my life fr' },
  ],
  home: [
    { tt: 'soft life era incoming', ig: 'currently manifesting a slow sunday 🕯️', tw: 'cozy mode: permanent' },
    { tt: 'pov: you have no plans & it rules', ig: 'slow mornings forever pls 🤍', tw: 'being a homebody is a personality' },
  ],
};

const LA_TAGS_TT = '#lalife #losangeles #fyp';
const LA_TAGS_IG = '#lalife #losangeles #californiagirl #lastyle';
const LA_TAGS_TW = '#LA';

function getSlotDate(dayOffsetFromToday, hourUtc) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffsetFromToday);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

async function uploadVideoToSupabase(videoUrl, name) {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`fetch video failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `videos/${Date.now()}_${name}.mp4`;
  const { error } = await supabase.storage.from('content').upload(path, buf, {
    contentType: 'video/mp4', upsert: true,
  });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('content').getPublicUrl(path);
  return publicUrl;
}

console.log('\n━━━ NIGHT VIDEOS — Sprint 2 ━━━\n');
console.log(`Time: ${new Date().toISOString()}\n`);

if (!existsSync(RESULTS)) {
  console.error(`Missing ${RESULTS} — run 'npm run schedule:night' first`);
  process.exit(1);
}

const nightResults = JSON.parse(readFileSync(RESULTS, 'utf-8'));
const approved = (nightResults.items || []).filter(i => i.qa?.approved);
console.log(`Approved images in night_session: ${approved.length}`);
if (approved.length === 0) {
  console.error('No approved images to convert to video. Re-run QA first.');
  process.exit(1);
}

const seenSettings = new Set();
const picks = [];
for (const item of approved) {
  const s = settingFromName(item.name);
  if (seenSettings.has(s) && picks.length > MAX_VIDEOS / 2) continue;
  seenSettings.add(s);
  picks.push(item);
  if (picks.length >= MAX_VIDEOS) break;
}
console.log(`Generating ${picks.length} videos (${picks.map(p => p.name).join(', ')})\n`);

const accounts = await getPlatformIds();
console.log(`Publer: TT=${accounts.tiktok?.id} IG=${accounts.instagram?.id} TW=${accounts.twitter?.id || 'MISSING'}\n`);

const results = [];
const slots = [
  { dayOffset: 4, hour: 14 }, // Thu 14 UTC
  { dayOffset: 4, hour: 17 }, // Thu 17 UTC
  { dayOffset: 5, hour: 14 }, // Fri 14 UTC
  { dayOffset: 5, hour: 17 }, // Fri 17 UTC
  { dayOffset: 6, hour: 14 }, // Sat 14 UTC
  { dayOffset: 6, hour: 17 }, // Sat 17 UTC
];

for (let i = 0; i < picks.length; i++) {
  const item = picks[i];
  const setting = settingFromName(item.name);
  const slot = slots[i] ?? slots[i % slots.length];
  const caps = CAPTIONS_BY_SETTING[setting][i % CAPTIONS_BY_SETTING[setting].length];

  console.log(`[${i + 1}/${picks.length}] ${item.name} (${setting}) — ${slot.dayOffset}d @ ${slot.hour}:00 UTC`);

  try {
    console.log('   generating Kling v3 i2v...');
    const video = await generateVideo({
      startImageUrl: item.url,
      setting,
      motionIndex: i,
      duration: 5,
    });
    const videoUrl = video.url || video;
    console.log(`   ✅ generated: ${videoUrl.slice(0, 80)}`);

    console.log('   uploading to Supabase...');
    const publicUrl = await uploadVideoToSupabase(videoUrl, item.name);

    console.log('   uploading to Publer...');
    const media = await uploadMediaFromUrl(publicUrl, {
      name: `video_${item.name}`,
      caption: caps.ig.slice(0, 100),
      mediaType: 'video',
    });
    console.log(`   Publer media: ${media.id}`);

    const jobs = { name: item.name, setting, videoUrl: publicUrl, mediaId: media.id };

    try {
      jobs.tiktok = await schedulePost({
        accountId: accounts.tiktok.id,
        networkKey: 'tiktok',
        caption: `${caps.tt}\n\n${LA_TAGS_TT}`,
        scheduledAt: getSlotDate(slot.dayOffset, slot.hour),
        mediaId: media.id,
        mediaType: 'video',
      });
      console.log(`   ✅ TT scheduled`);
    } catch (e) { jobs.tiktokError = e.message; console.log(`   ❌ TT: ${e.message}`); }

    try {
      jobs.instagram = await schedulePost({
        accountId: accounts.instagram.id,
        networkKey: 'instagram',
        caption: `${caps.ig}\n\n${LA_TAGS_IG}`,
        scheduledAt: getSlotDate(slot.dayOffset, slot.hour + 1),
        mediaId: media.id,
        mediaType: 'video',
        postType: 'reel',
      });
      console.log(`   ✅ IG scheduled (reel)`);
    } catch (e) { jobs.instagramError = e.message; console.log(`   ❌ IG: ${e.message}`); }

    if (accounts.twitter?.id) {
      try {
        jobs.twitter = await schedulePost({
          accountId: accounts.twitter.id,
          networkKey: 'twitter',
          caption: `${caps.tw} ${LA_TAGS_TW}`,
          scheduledAt: getSlotDate(slot.dayOffset, slot.hour + 2),
          mediaId: media.id,
          mediaType: 'video',
        });
        console.log(`   ✅ TW scheduled`);
      } catch (e) { jobs.twitterError = e.message; console.log(`   ❌ TW: ${e.message}`); }
    }

    results.push(jobs);
  } catch (err) {
    console.log(`   ❌ video failed: ${err.message}`);
    results.push({ name: item.name, error: err.message });
  }
  console.log();
}

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log('━━━ Summary ━━━');
const ok = results.filter(r => !r.error).length;
console.log(`${ok}/${results.length} videos generated + scheduled`);
console.log(`Results: ${OUT}`);
