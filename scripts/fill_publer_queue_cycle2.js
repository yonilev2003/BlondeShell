/**
 * scripts/fill_publer_queue_cycle2.js — Rolling queue filler for Apr 16–19 (Cycle 2)
 *
 * A/B test plan:
 *   Apr 16: sound override = Stellar Blade OST     (ab_test_variable: sound)
 *   Apr 17: sound override = trends_agent_pick     (ab_test_variable: sound)
 *   Apr 18: caption style  = form_breakdown        (ab_test_variable: caption_style)
 *   Apr 19: caption style  = gaming_crossover_levelup (ab_test_variable: caption_style)
 *
 * Usage:
 *   node scripts/fill_publer_queue_cycle2.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { schedulePost, getPlatformIds } from '../lib/publer.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Schedule definition (all times UTC, IL = UTC+3) ──────────────────────────

const DATES = ['2026-04-16', '2026-04-17', '2026-04-18', '2026-04-19'];

const SLOTS = [
  { key: 'ig_feed',    platform: 'instagram', postType: 'photo',  mediaType: 'image', tiers: ['T1'],      utcHour:  4, utcMin: 0 },
  { key: 'ig_reels',   platform: 'instagram', postType: 'reel',   mediaType: 'video', tiers: ['T1'],      utcHour: 16, utcMin: 0 },
  { key: 'ig_stories', platform: 'instagram', postType: 'story',  mediaType: 'video', tiers: ['T1'],      utcHour:  9, utcMin: 0, maxDuration: 15 },
  { key: 'tiktok_1',   platform: 'tiktok',    postType: 'video',  mediaType: 'video', tiers: ['T1'],      utcHour:  8, utcMin: 0, aiLabel: true },
  { key: 'tiktok_2',   platform: 'tiktok',    postType: 'video',  mediaType: 'video', tiers: ['T1'],      utcHour: 16, utcMin: 0, aiLabel: true },
  { key: 'twitter_1',  platform: 'twitter',   postType: 'status', mediaType: 'image', tiers: ['T1','T2'], utcHour:  6, utcMin: 0 },
  { key: 'twitter_2',  platform: 'twitter',   postType: 'status', mediaType: 'image', tiers: ['T1','T2'], utcHour:  9, utcMin: 0 },
  { key: 'twitter_3',  platform: 'twitter',   postType: 'status', mediaType: 'image', tiers: ['T1','T2'], utcHour: 15, utcMin: 0 },
  { key: 'twitter_4',  platform: 'twitter',   postType: 'status', mediaType: 'image', tiers: ['T1','T2'], utcHour: 18, utcMin: 0 },
];

// A/B test config per date — Cycle 2
const AB_CONFIG = {
  '2026-04-16': { caption_style: 'default', ab_test_variable: 'sound', sound_override: 'stellar_blade_ost' },
  '2026-04-17': { caption_style: 'default', ab_test_variable: 'sound', sound_override: 'trends_agent_pick' },
  '2026-04-18': { caption_style: 'form_breakdown',          ab_test_variable: 'caption_style' },
  '2026-04-19': { caption_style: 'gaming_crossover_levelup', ab_test_variable: 'caption_style' },
};

// ─── Caption generator ────────────────────────────────────────────────────────

function buildCaption(captionStyle, platform, slot) {
  const tags = {
    instagram: '#aesthetic #blonde #lifestyle #girlgamer',
    tiktok:    '#fyp #blonde #lifestyle #girlgamer',
    twitter:   '#blonde #aesthetic',
  }[platform] ?? '#blonde';

  switch (captionStyle) {
    case 'form_breakdown':
      return `form check: here's what makes this movement elite 🏋️ ${tags}`;
    case 'gaming_crossover_levelup':
      return `real life stats going up 📈 leveling up every session ${tags}`;
    case 'default':
    default:
      if (slot.postType === 'reel') return `POV: you found the good side 🎬 ${tags}`;
      if (slot.postType === 'story') return `✨ ${tags}`;
      return `Golden hour. ✨ ${tags}`;
  }
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
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('content_id, scheduled_at, platform, post_type')
    .gte('scheduled_at', '2026-04-16T00:00:00Z')
    .lte('scheduled_at', '2026-04-19T23:59:59Z');

  if (error) {
    if (error.message.includes('does not exist')) return { slots: new Set(), usedContentIds: new Set() };
    throw new Error(`scheduled_posts fetch failed: ${error.message}`);
  }

  const slots = new Set((data ?? []).map(r => `${r.platform}|${r.post_type}|${new Date(r.scheduled_at).toISOString()}`));
  const usedContentIds = new Set((data ?? []).map(r => r.content_id).filter(Boolean));
  return { slots, usedContentIds };
}

async function insertScheduledPost({ contentId, platform, postType, scheduledAt, captionStyle, abTestVariable, soundOverride, publerJobId }) {
  const row = {
    platform,
    post_type:        postType,
    scheduled_at:     scheduledAt,
    content_id:       contentId,
    caption_style:    captionStyle,
    ab_test_variable: abTestVariable,
    publer_job_id:    publerJobId,
  };

  // sound_override: store in ab_test_variable value if column not yet present
  if (soundOverride) {
    row.ab_test_variable = `sound:${soundOverride}`;
  }

  const { error } = await supabase.from('scheduled_posts').insert(row);
  if (error) throw new Error(`scheduled_posts insert failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== FILL PUBLER QUEUE — Cycle 2 Apr 16–19 ===\n');

  // 1. Get Publer platform account IDs
  console.log('Fetching Publer platform IDs...');
  const platformIds = await getPlatformIds();
  console.log(`  instagram : ${platformIds.instagram?.id ?? '(not connected)'}`);
  console.log(`  tiktok    : ${platformIds.tiktok?.id    ?? '(not connected)'}`);
  console.log(`  twitter   : ${platformIds.twitter?.id   ?? '(not connected)'}`);

  // 2. Load already-queued slots
  console.log('\nLoading existing queue...');
  const { slots: existingSlots, usedContentIds } = await getAlreadyQueued();
  console.log(`  ${existingSlots.size} slots already in queue, ${usedContentIds.size} content IDs used`);

  // 3. Pre-fetch content pools (exclude content already used in Cycle 1)
  console.log('\nFetching approved content...');
  const { data: cycle1Used } = await supabase
    .from('scheduled_posts')
    .select('content_id')
    .lt('scheduled_at', '2026-04-16T00:00:00Z')
    .not('content_id', 'is', null);

  const allUsed = new Set([
    ...usedContentIds,
    ...(cycle1Used ?? []).map(r => r.content_id),
  ]);

  const contentPools = {
    'image:T1':       await getApprovedContent('image', ['T1'], [...allUsed]),
    'image:T1,T2':    await getApprovedContent('image', ['T1','T2'], [...allUsed]),
    'video:T1':       await getApprovedContent('video', ['T1'], [...allUsed]),
    'video:T1:15s':   await getApprovedContent('video', ['T1'], [...allUsed], 15),
  };
  for (const [k, items] of Object.entries(contentPools)) {
    console.log(`  ${k}: ${items.length} items`);
  }

  const cursors = Object.fromEntries(Object.keys(contentPools).map(k => [k, 0]));
  const usedNow = new Set(allUsed);

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
    const ab = AB_CONFIG[date];
    const abLabel = ab.sound_override
      ? `sound:${ab.sound_override}`
      : `caption_style:${ab.caption_style}`;
    console.log(`\n--- ${date} | A/B: ${abLabel} ---`);

    for (const slot of SLOTS) {
      const platformAccount = platformIds[slot.platform];
      if (!platformAccount) {
        console.log(`  SKIP ${slot.key} — platform not connected`);
        continue;
      }

      const scheduledAt = new Date(
        `${date}T${String(slot.utcHour).padStart(2,'0')}:${String(slot.utcMin).padStart(2,'0')}:00Z`
      ).toISOString();

      const slotKey = `${slot.platform}|${slot.postType}|${scheduledAt}`;
      if (existingSlots.has(slotKey)) {
        console.log(`  SKIP ${slot.key} @ ${scheduledAt} — already queued`);
        totalSkipped++;
        continue;
      }

      const poolKey = slot.maxDuration
        ? 'video:T1:15s'
        : `${slot.mediaType}:${slot.tiers.join(',')}`;
      const content = pickContent(poolKey);

      if (!content) {
        console.warn(`  WARN ${slot.key} — no available content in pool ${poolKey}`);
        continue;
      }

      const caption = buildCaption(ab.caption_style, slot.platform, slot);

      // Sound note: if sound_override is 'trends_agent_pick', Publer caption
      // will include a note — Trends Agent resolves actual sound at posting time.
      const finalCaption = ab.sound_override === 'trends_agent_pick'
        ? caption + ' [SOUND: trends_agent_pick]'
        : caption;

      let publerJobId = null;
      try {
        publerJobId = await schedulePost({
          accountId:  platformAccount.id,
          networkKey: platformAccount.networkKey,
          caption:    finalCaption,
          scheduledAt,
          mediaUrl:   content.url,
          isVideo:    slot.mediaType === 'video',
          postType:   slot.postType,
        });
        console.log(`  ✓ ${slot.key} @ ${scheduledAt} | content:${content.id.slice(0,8)} | job:${publerJobId}`);
      } catch (err) {
        console.error(`  ✗ ${slot.key} @ ${scheduledAt} — Publer error: ${err.message}`);
      }

      try {
        await insertScheduledPost({
          contentId:       content.id,
          platform:        slot.platform,
          postType:        slot.postType,
          scheduledAt,
          captionStyle:    ab.caption_style,
          abTestVariable:  ab.ab_test_variable,
          soundOverride:   ab.sound_override ?? null,
          publerJobId,
        });
      } catch (err) {
        console.error(`  ✗ DB insert failed for ${slot.key}: ${err.message}`);
      }

      const statKey = `${slot.platform}/${slot.postType}`;
      stats[statKey] = (stats[statKey] ?? 0) + 1;
      totalScheduled++;
    }
  }

  // 5. Report
  console.log('\n=== CYCLE 2 REPORT ===');
  console.log(`  Total scheduled : ${totalScheduled}`);
  console.log(`  Total skipped   : ${totalSkipped}`);
  console.log('\n  By platform / post type:');
  for (const [key, count] of Object.entries(stats).sort()) {
    console.log(`    ${key.padEnd(28)} ${count}`);
  }
  console.log('\n  A/B test summary:');
  console.log('    Apr 16: sound=stellar_blade_ost');
  console.log('    Apr 17: sound=trends_agent_pick (resolved at runtime)');
  console.log('    Apr 18: caption=form_breakdown (edutainment)');
  console.log('    Apr 19: caption=gaming_crossover_levelup');
  console.log('\n=== DONE ===');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
