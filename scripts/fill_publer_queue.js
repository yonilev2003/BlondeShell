/**
 * scripts/fill_publer_queue.js — Rolling queue filler
 *
 * Reads approved content_items from Supabase, schedules via Publer,
 * and records each post in scheduled_posts (skipping already-queued slots).
 *
 * IL timezone = UTC+3
 *
 * Usage:
 *   node scripts/fill_publer_queue.js                   # default: Apr 12–15
 *   node scripts/fill_publer_queue.js --dates Apr16-19  # any 4-day window
 *
 * Requires scheduled_posts table — run once if missing:
 *   CREATE TABLE scheduled_posts (
 *     post_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     platform        TEXT NOT NULL,
 *     post_type       TEXT NOT NULL,
 *     scheduled_at    TIMESTAMPTZ NOT NULL,
 *     content_id      UUID REFERENCES content_items(id),
 *     caption_style   TEXT,
 *     ab_test_variable TEXT,
 *     publer_job_id   TEXT,
 *     created_at      TIMESTAMPTZ DEFAULT now()
 *   );
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { schedulePost, getPlatformIds } from '../lib/publer.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── --dates flag parsing ─────────────────────────────────────────────────────

function parseDatesArg(arg) {
  // Format: Apr16-19 → ['2026-04-16', '2026-04-17', '2026-04-18', '2026-04-19']
  const MONTHS = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
                   Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
  const match = arg.match(/^([A-Za-z]{3})(\d+)-(\d+)$/);
  if (!match) throw new Error(`Invalid --dates format: "${arg}". Expected e.g. Apr16-19`);
  const [, mon, startStr, endStr] = match;
  const key = mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase();
  const month = MONTHS[key];
  if (!month) throw new Error(`Unknown month: ${mon}`);
  const start = parseInt(startStr, 10);
  const end = parseInt(endStr, 10);
  const year = '2026';
  const dates = [];
  for (let d = start; d <= end; d++) {
    dates.push(`${year}-${month}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

const datesArgIdx = process.argv.indexOf('--dates');
const DATES = datesArgIdx !== -1
  ? parseDatesArg(process.argv[datesArgIdx + 1])
  : ['2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15'];

// Slots: platform, postType (Publer type string), media type, tiers allowed, UTC hour
const SLOTS = [
  { key: 'ig_feed',    platform: 'instagram', postType: 'photo',  mediaType: 'image', tiers: ['T1'],       utcHour:  4, utcMin: 0 },
  { key: 'ig_reels',   platform: 'instagram', postType: 'reel',   mediaType: 'video', tiers: ['T1'],       utcHour: 16, utcMin: 0 },
  { key: 'ig_stories', platform: 'instagram', postType: 'story',  mediaType: 'video', tiers: ['T1'],       utcHour:  9, utcMin: 0, maxDuration: 15 },
  { key: 'tiktok_1',        platform: 'tiktok', postType: 'video',  mediaType: 'video', tiers: ['T1'], utcHour:  8, utcMin:  0, aiLabel: true },
  { key: 'tiktok_story_1',  platform: 'tiktok', postType: 'story',  mediaType: 'video', tiers: ['T1'], utcHour:  8, utcMin:  5, aiLabel: true, maxDuration: 15 },
  { key: 'tiktok_2',        platform: 'tiktok', postType: 'video',  mediaType: 'video', tiers: ['T1'], utcHour: 16, utcMin:  0, aiLabel: true },
  { key: 'tiktok_story_2',  platform: 'tiktok', postType: 'story',  mediaType: 'video', tiers: ['T1'], utcHour: 16, utcMin:  5, aiLabel: true, maxDuration: 15 },
  { key: 'twitter_1',  platform: 'twitter',   postType: 'status', mediaType: 'image', tiers: ['T1','T2'],  utcHour:  6, utcMin: 0 },
  { key: 'twitter_2',  platform: 'twitter',   postType: 'status', mediaType: 'image', tiers: ['T1','T2'],  utcHour:  9, utcMin: 0 },
  { key: 'twitter_3',  platform: 'twitter',   postType: 'status', mediaType: 'image', tiers: ['T1','T2'],  utcHour: 15, utcMin: 0 },
  { key: 'twitter_4',  platform: 'twitter',   postType: 'status', mediaType: 'image', tiers: ['T1','T2'],  utcHour: 18, utcMin: 0 },
];

// A/B test config per date (cycle 1: Apr 12–15 | cycle 2: Apr 16–19)
const AB_CONFIG = {
  // Cycle 1
  '2026-04-12': { caption_style: 'rate_my_form',             ab_test_variable: 'caption_style' },
  '2026-04-13': { caption_style: 'gaming_reference',          ab_test_variable: 'caption_style' },
  '2026-04-14': { caption_style: 'default',                   ab_test_variable: 'visual_hook',    visual_hook: 'low_angle' },
  '2026-04-15': { caption_style: 'default',                   ab_test_variable: 'visual_hook',    visual_hook: 'side_profile' },
  // Cycle 2
  '2026-04-16': { caption_style: 'default',                   ab_test_variable: 'sound',          sound: 'stellar_blade_ost' },
  '2026-04-17': { caption_style: 'default',                   ab_test_variable: 'sound',          sound: 'trends_agent_pick' },
  '2026-04-18': { caption_style: 'form_breakdown',            ab_test_variable: 'caption_style' },
  '2026-04-19': { caption_style: 'gaming_crossover_levelup',  ab_test_variable: 'caption_style' },
};
const AB_DEFAULT = { caption_style: 'default', ab_test_variable: 'caption_style' };

// ─── Caption generator ────────────────────────────────────────────────────────

function buildCaption(captionStyle, platform, slot) {
  const tags = {
    instagram: '#aesthetic #blonde #lifestyle #vibes',
    tiktok:    '#fyp #blonde #lifestyle #aesthetic',
    twitter:   '#blonde #aesthetic',
  }[platform] ?? '#blonde';

  if (captionStyle === 'rate_my_form') {
    return `Rate my form 1–10 👇 ${tags}`;
  }
  if (captionStyle === 'gaming_reference') {
    return `Loading new level… ✨ ${tags}`;
  }
  // default — works for visual_hook dates too
  if (slot.postType === 'reel') return `POV: you found the good side 🎬 ${tags}`;
  if (slot.postType === 'story') return `✨ ${tags}`;
  return `Golden hour. ✨ ${tags}`;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function getApprovedContent(mediaType, tiers, exclude = [], maxDuration = null) {
  let query = supabase
    .from('content_items')
    .select('id, url, type, tier, setting, mood, duration_seconds')
    .eq('qa_status', 'approved')
    .eq('type', mediaType)
    .in('tier', tiers)
    .not('id', 'in', `(${exclude.map(id => `"${id}"`).join(',')})`)
    .limit(50);

  if (maxDuration != null) {
    query = query.lte('duration_seconds', maxDuration);
  }

  const { data, error } = await query;
  if (error) throw new Error(`content_items fetch failed: ${error.message}`);
  return data ?? [];
}

async function getAlreadyQueued() {
  const startISO = `${DATES[0]}T00:00:00Z`;
  const endISO   = `${DATES[DATES.length - 1]}T23:59:59Z`;
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('content_id, scheduled_at, platform, post_type')
    .gte('scheduled_at', startISO)
    .lte('scheduled_at', endISO);

  if (error) {
    if (error.message.includes('does not exist')) return { slots: new Set(), usedContentIds: new Set() };
    throw new Error(`scheduled_posts fetch failed: ${error.message}`);
  }

  const slots = new Set((data ?? []).map(r => `${r.platform}|${r.post_type}|${new Date(r.scheduled_at).toISOString()}`));
  const usedContentIds = new Set((data ?? []).map(r => r.content_id).filter(Boolean));
  return { slots, usedContentIds };
}

async function insertScheduledPost({ contentId, platform, postType, scheduledAt, captionStyle, abTestVariable, publerJobId }) {
  const { error } = await supabase.from('scheduled_posts').insert({
    platform,
    post_type:        postType,
    scheduled_at:     scheduledAt,
    content_id:       contentId,
    caption_style:    captionStyle,
    ab_test_variable: abTestVariable,
    publer_job_id:    publerJobId,
  });
  if (error) throw new Error(`scheduled_posts insert failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== FILL PUBLER QUEUE — ${DATES[0]} → ${DATES[DATES.length - 1]} ===\n`);

  // 1. Get Publer platform account IDs
  console.log('Fetching Publer platform IDs...');
  const platformIds = await getPlatformIds();
  console.log(`  instagram : ${platformIds.instagram?.id ?? '(not connected)'}`);
  console.log(`  tiktok    : ${platformIds.tiktok?.id    ?? '(not connected)'}`);
  console.log(`  twitter   : ${platformIds.twitter?.id   ?? '(not connected)'}`);

  // 2. Load already-queued slots to skip duplicates
  console.log('\nLoading existing queue...');
  const { slots: existingSlots, usedContentIds } = await getAlreadyQueued();
  console.log(`  ${existingSlots.size} slots already in queue, ${usedContentIds.size} content IDs used`);

  // 3. Pre-fetch all approved content pools
  console.log('\nFetching approved content...');
  const contentPools = {
    'image:T1':       await getApprovedContent('image', ['T1'], [...usedContentIds]),
    'image:T1,T2':    await getApprovedContent('image', ['T1','T2'], [...usedContentIds]),
    'video:T1':       await getApprovedContent('video', ['T1'], [...usedContentIds]),
    'video:T1:15s':   await getApprovedContent('video', ['T1'], [...usedContentIds], 15),
  };
  for (const [k, items] of Object.entries(contentPools)) {
    console.log(`  ${k}: ${items.length} items`);
  }

  // Content pick cursor per pool (round-robin, no reuse)
  const cursors = Object.fromEntries(Object.keys(contentPools).map(k => [k, 0]));
  const usedNow = new Set(usedContentIds);

  function pickContent(poolKey) {
    const pool = contentPools[poolKey] ?? contentPools['image:T1'];
    const available = pool.filter(item => !usedNow.has(item.id));
    if (!available.length) return null;
    const item = available[cursors[poolKey] % available.length];
    cursors[poolKey]++;
    usedNow.add(item.id);
    return item;
  }

  // 4. Build schedule and submit
  const stats = {};
  let totalScheduled = 0;
  let totalSkipped = 0;

  for (const date of DATES) {
    const ab = AB_CONFIG[date] ?? AB_DEFAULT;
    console.log(`\n--- ${date} | A/B: ${ab.ab_test_variable}=${ab[ab.ab_test_variable] ?? ab.caption_style} ---`);

    for (const slot of SLOTS) {
      const platformAccount = platformIds[slot.platform];
      if (!platformAccount) {
        console.log(`  SKIP ${slot.key} — platform not connected`);
        continue;
      }

      // Build ISO scheduled_at
      const scheduledAt = new Date(`${date}T${String(slot.utcHour).padStart(2,'0')}:${String(slot.utcMin).padStart(2,'0')}:00Z`).toISOString();

      // Skip if slot already filled
      const slotKey = `${slot.platform}|${slot.postType}|${scheduledAt}`;
      if (existingSlots.has(slotKey)) {
        console.log(`  SKIP ${slot.key} @ ${scheduledAt} — already queued`);
        totalSkipped++;
        continue;
      }

      // Pick content
      const poolKey = slot.maxDuration
        ? `video:T1:15s`
        : `${slot.mediaType}:${slot.tiers.join(',')}`;
      const content = pickContent(poolKey);

      if (!content) {
        console.warn(`  WARN ${slot.key} — no available content in pool ${poolKey}`);
        continue;
      }

      // Build caption
      const caption = buildCaption(ab.caption_style, slot.platform, slot);

      // Schedule via Publer
      let publerJobId = null;
      try {
        publerJobId = await schedulePost({
          accountId:  platformAccount.id,
          networkKey: platformAccount.networkKey,
          caption,
          scheduledAt,
          mediaUrl:   content.url,
          isVideo:    slot.mediaType === 'video',
          postType:   slot.postType,
        });
        console.log(`  ✓ ${slot.key} @ ${scheduledAt} | content:${content.id.slice(0,8)} | job:${publerJobId}`);
      } catch (err) {
        console.error(`  ✗ ${slot.key} @ ${scheduledAt} — Publer error: ${err.message}`);
        // Still record in Supabase as pending (job_id null) so slot is claimed
      }

      // Persist to scheduled_posts
      try {
        await insertScheduledPost({
          contentId:       content.id,
          platform:        slot.platform,
          postType:        slot.postType,
          scheduledAt,
          captionStyle:    ab.caption_style,
          abTestVariable:  ab.ab_test_variable,
          publerJobId,
        });
      } catch (err) {
        console.error(`  ✗ DB insert failed for ${slot.key}: ${err.message}`);
      }

      // Track stats
      const statKey = `${slot.platform}/${slot.postType}`;
      stats[statKey] = (stats[statKey] ?? 0) + 1;
      totalScheduled++;
    }
  }

  // 5. Report
  console.log('\n=== REPORT ===');
  console.log(`  Total scheduled : ${totalScheduled}`);
  console.log(`  Total skipped   : ${totalSkipped}`);
  console.log('\n  By platform / post type:');
  for (const [key, count] of Object.entries(stats).sort()) {
    console.log(`    ${key.padEnd(28)} ${count}`);
  }

  // Expected totals (4 days):
  //   instagram/photo  : 4   (1/day feed)
  //   instagram/reel   : 4   (1/day)
  //   instagram/story  : 4   (1/day)
  //   tiktok/video     : 8   (2/day)
  //   twitter/status   : 16  (4/day)
  console.log('\n=== DONE ===');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
