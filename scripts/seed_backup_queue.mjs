#!/usr/bin/env node
/**
 * Seed the backup_content_queue from existing approved content_items.
 *
 * First-run bootstrap: pulls every approved content_item (oldest first) that
 * isn't already in the backup queue and enqueues up to MAX_ITEMS. Subsequent
 * runs are idempotent — media_url dedup prevents double enqueue.
 *
 * Usage:
 *   node scripts/seed_backup_queue.mjs                 # default 60 items
 *   node scripts/seed_backup_queue.mjs --max=120       # custom cap
 *   node scripts/seed_backup_queue.mjs --tier=T1       # tier filter
 *   node scripts/seed_backup_queue.mjs --dry-run       # preview only
 */

import 'dotenv/config';
import { supabase } from '../lib/supabase.js';
import { enqueueContent, queueSize } from '../lib/backup_queue.js';

function parseArgs(argv) {
  const args = { max: 60, tier: null, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--max=')) args.max = parseInt(a.slice(6), 10) || args.max;
    else if (a.startsWith('--tier=')) args.tier = a.slice(7);
  }
  return args;
}

async function fetchApprovedCandidates({ max, tier }) {
  let q = supabase
    .from('content_items')
    .select('id, url, tier, prompt, type, created_at')
    .eq('qa_status', 'approved')
    .order('created_at', { ascending: true })
    .limit(max * 3); // over-fetch to allow dedup
  if (tier) q = q.eq('tier', tier);
  const { data, error } = await q;
  if (error) throw new Error(`fetchApprovedCandidates: ${error.message}`);
  return data ?? [];
}

async function fetchExistingUrls(urls) {
  if (!urls.length) return new Set();
  const { data, error } = await supabase
    .from('backup_content_queue')
    .select('media_url')
    .in('media_url', urls);
  if (error) throw new Error(`fetchExistingUrls: ${error.message}`);
  return new Set((data ?? []).map((r) => r.media_url));
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`[seed_backup_queue] starting — max=${args.max} tier=${args.tier ?? 'ANY'} dryRun=${args.dryRun}`);

  const before = await queueSize();
  console.log('[seed_backup_queue] queue before:', before);

  const candidates = await fetchApprovedCandidates(args);
  console.log(`[seed_backup_queue] approved candidates fetched: ${candidates.length}`);
  if (!candidates.length) {
    console.log('[seed_backup_queue] nothing to seed, exiting.');
    return;
  }

  const urls = candidates.map((c) => c.url).filter(Boolean);
  const existing = await fetchExistingUrls(urls);

  const toEnqueue = [];
  for (const item of candidates) {
    if (!item.url || existing.has(item.url)) continue;
    if (toEnqueue.length >= args.max) break;
    const caption = (item.prompt ?? '').slice(0, 200);
    toEnqueue.push({
      media_url: item.url,
      caption_tt: caption,
      caption_ig: caption,
      caption_tw: caption,
      tier: item.tier ?? 'T1',
      priority: 0,
    });
  }

  console.log(`[seed_backup_queue] will enqueue: ${toEnqueue.length} (skipped dup/missing: ${candidates.length - toEnqueue.length})`);

  if (args.dryRun) {
    console.log('[seed_backup_queue] --dry-run, no inserts');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const item of toEnqueue) {
    try {
      await enqueueContent(item);
      ok++;
    } catch (err) {
      fail++;
      console.warn(`[seed_backup_queue] enqueue failed for ${item.media_url}: ${err.message}`);
    }
  }

  const after = await queueSize();
  console.log(`[seed_backup_queue] done — enqueued=${ok} failed=${fail}`);
  console.log('[seed_backup_queue] queue after:', after);
}

main().catch((err) => {
  console.error('[seed_backup_queue] FATAL:', err.message);
  process.exit(1);
});
