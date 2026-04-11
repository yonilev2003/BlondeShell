/**
 * scripts/post_backlog_to_fanvue.js
 *
 * Pushes scheduled Publer image backlog to Fanvue as subscriber-only posts,
 * aligned to the same Apr 12–19 window, max 3 per day.
 *
 * Usage:
 *   node scripts/post_backlog_to_fanvue.js            # dry-run (no posts sent)
 *   node scripts/post_backlog_to_fanvue.js --execute  # live
 *   node scripts/post_backlog_to_fanvue.js --execute --max-per-day 2
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { uploadMediaFromUrl, scheduleFanvuePost } from '../lib/fanvue.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY_RUN     = !process.argv.includes('--execute');
const maxArgIdx   = process.argv.indexOf('--max-per-day');
const MAX_PER_DAY = maxArgIdx !== -1 ? parseInt(process.argv[maxArgIdx + 1], 10) : 3;

// Fanvue posting times per slot index (UTC) — spread across the day
// 3-slot day: 09:00, 14:00, 20:00 (12:00, 17:00, 23:00 IL)
// 2-slot day: 09:00, 18:00
// 1-slot day: 12:00
const SLOT_TIMES = ['09:00', '14:00', '20:00'];

// ─── Load scheduled images from Publer queue ──────────────────────────────────

async function loadScheduledImages() {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select(`
      post_id,
      scheduled_at,
      platform,
      post_type,
      caption_style,
      content_id,
      content_items (
        id, url, type, tier, setting, mood
      )
    `)
    .order('scheduled_at', { ascending: true });

  if (error) throw new Error(`scheduled_posts fetch failed: ${error.message}`);

  // Filter to image-type content only, skip nulls
  return (data ?? []).filter(row =>
    row.content_items?.type === 'image' &&
    row.content_items?.url
  );
}

// ─── Group + deduplicate by date, pick max N per day ─────────────────────────

function buildDayMap(rows, maxPerDay) {
  // Deduplicate: one content_id may appear in multiple platform slots (IG + Twitter)
  // Keep the earliest scheduled_at for date-alignment purposes
  const seenContentIds = new Set();
  const unique = [];
  for (const row of rows) {
    if (!seenContentIds.has(row.content_id)) {
      seenContentIds.add(row.content_id);
      unique.push(row);
    }
  }

  // Group by UTC date
  const byDate = {};
  for (const row of unique) {
    const date = row.scheduled_at.slice(0, 10); // 'YYYY-MM-DD'
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(row);
  }

  // Pick up to maxPerDay per day, assign Fanvue scheduled times
  const plan = [];
  for (const [date, items] of Object.entries(byDate).sort()) {
    const picked = items.slice(0, maxPerDay);
    for (let i = 0; i < picked.length; i++) {
      const time = SLOT_TIMES[i] ?? SLOT_TIMES[SLOT_TIMES.length - 1];
      plan.push({
        ...picked[i],
        fanvueScheduledAt: `${date}T${time}:00Z`,
      });
    }
  }

  return plan;
}

// ─── Caption builder ──────────────────────────────────────────────────────────

function buildCaption(item) {
  const setting = item.content_items?.setting ?? 'lifestyle';
  const mood    = item.content_items?.mood    ?? 'aesthetic';
  const captions = {
    beach:  '🌊 Exclusive for subscribers — unfiltered golden hour.',
    gym:    '💪 Behind the scenes — your exclusive gym content.',
    home:   '🏠 Just for you. Subscriber exclusive.',
    street: '✨ Subscriber exclusive — city vibes, unfiltered.',
  };
  return captions[setting] ?? `✨ Subscriber exclusive — ${mood} content just for you.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== POST BACKLOG TO FANVUE ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'} ===`);
  console.log(`Max per day: ${MAX_PER_DAY}\n`);

  // 1. Load + plan
  const rows = await loadScheduledImages();
  console.log(`Loaded ${rows.length} Publer image slots`);

  const plan = buildDayMap(rows, MAX_PER_DAY);
  console.log(`After dedup + capping: ${plan.length} Fanvue posts planned\n`);

  // Preview
  let currentDate = '';
  for (const item of plan) {
    const date = item.fanvueScheduledAt.slice(0, 10);
    if (date !== currentDate) {
      console.log(`--- ${date} ---`);
      currentDate = date;
    }
    console.log(`  ${item.fanvueScheduledAt} | ${item.content_items.setting} | ${item.content_id.slice(0, 8)} | ${item.content_items.url.split('/').pop().slice(0, 40)}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log('DRY RUN — pass --execute to post for real.\n');
    return;
  }

  // 2. Execute — upload + schedule each item
  const stats = { ok: 0, failed: 0, errors: [] };

  for (const item of plan) {
    const { content_items: ci, fanvueScheduledAt, content_id } = item;
    const caption = buildCaption(item);

    try {
      process.stdout.write(`  Uploading ${content_id.slice(0, 8)} (${ci.setting})... `);

      const mediaUuid = await uploadMediaFromUrl(ci.url, `${ci.id}.png`);

      await scheduleFanvuePost({
        mediaUuids:  [mediaUuid],
        caption,
        scheduledAt: fanvueScheduledAt,
        isFree:      false,
        audience:    'subscribers',
      });

      console.log(`✓ scheduled @ ${fanvueScheduledAt}`);
      stats.ok++;

    } catch (err) {
      console.log(`✗ FAILED — ${err.message}`);
      stats.failed++;
      stats.errors.push(`${content_id.slice(0, 8)} @ ${fanvueScheduledAt}: ${err.message}`);
    }

    // Rate-limit: 1s between calls to avoid hammering Fanvue API
    await new Promise(r => setTimeout(r, 1000));
  }

  // 3. Report
  console.log('\n=== REPORT ===');
  console.log(`  Planned   : ${plan.length}`);
  console.log(`  Posted ✓  : ${stats.ok}`);
  console.log(`  Failed ✗  : ${stats.failed}`);
  if (stats.errors.length) {
    console.log('\n  Errors:');
    for (const e of stats.errors) console.log(`    - ${e}`);
  }
  console.log('\n=== DONE ===\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
