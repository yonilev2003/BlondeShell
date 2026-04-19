/**
 * Backup Content Queue — 7-day safety buffer.
 *
 * If the daily pipeline (lib/pipeline.js) fails (fal.ai outage, Publer down,
 * QA rejects), the hourly backup_check_agent pulls pre-approved items from
 * `backup_content_queue` and schedules them. Keeps the feed alive so the
 * algorithm does not punish us for silence.
 *
 * All queries go through withRetry (2x) from lib/retry.js.
 */

import { supabase } from './supabase.js';
import { withRetry } from './retry.js';

const TABLE = 'backup_content_queue';
const RETRY_OPTS = { maxRetries: 2, baseDelayMs: 500 };

/**
 * Insert a content item into the backup queue.
 * content: { media_url, caption_tt?, caption_ig?, caption_tw?, tier, priority? }
 */
export async function enqueueContent(content) {
  if (!content?.media_url) throw new Error('enqueueContent: media_url required');
  if (!content?.tier) throw new Error('enqueueContent: tier required');

  const row = {
    media_url: content.media_url,
    captions: {
      tt: content.caption_tt ?? null,
      ig: content.caption_ig ?? null,
      tw: content.caption_tw ?? null,
    },
    tier: content.tier,
    priority: content.priority ?? 0,
    used: false,
    created_at: new Date().toISOString(),
  };

  return withRetry(async () => {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(`enqueueContent: ${error.message}`);
    return data;
  }, { ...RETRY_OPTS, label: 'backup_queue.enqueue' });
}

/**
 * Return n unused items matching tier (or any tier if null), ordered
 * by priority desc, created_at asc, and mark them used atomically.
 */
export async function dequeueOldest(n = 1, tier = null) {
  if (n <= 0) return [];

  return withRetry(async () => {
    let q = supabase
      .from(TABLE)
      .select('*')
      .eq('used', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(n);
    if (tier) q = q.eq('tier', tier);

    const { data: rows, error } = await q;
    if (error) throw new Error(`dequeueOldest.select: ${error.message}`);
    if (!rows?.length) return [];

    const ids = rows.map((r) => r.id);
    const { data: updated, error: updateErr } = await supabase
      .from(TABLE)
      .update({ used: true, used_at: new Date().toISOString() })
      .in('id', ids)
      .eq('used', false)
      .select();

    if (updateErr) throw new Error(`dequeueOldest.update: ${updateErr.message}`);
    // Only return rows we actually claimed (guards against a race)
    const claimedIds = new Set((updated ?? []).map((r) => r.id));
    return rows.filter((r) => claimedIds.has(r.id));
  }, { ...RETRY_OPTS, label: 'backup_queue.dequeue' });
}

/**
 * Count of unused items. If tier is null, returns { [tier]: count, total }.
 * If tier is a string, returns a single number.
 */
export async function queueSize(tier = null) {
  return withRetry(async () => {
    if (tier) {
      const { count, error } = await supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('used', false)
        .eq('tier', tier);
      if (error) throw new Error(`queueSize: ${error.message}`);
      return count ?? 0;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select('tier')
      .eq('used', false);
    if (error) throw new Error(`queueSize: ${error.message}`);

    const grouped = { total: 0 };
    for (const row of data ?? []) {
      const key = row.tier ?? 'unknown';
      grouped[key] = (grouped[key] ?? 0) + 1;
      grouped.total++;
    }
    return grouped;
  }, { ...RETRY_OPTS, label: 'backup_queue.size' });
}

/**
 * Refill the queue from content_items that are approved, older than 3 days,
 * and not yet represented in the backup queue. Up to `max` items.
 */
export async function refillFromApproved({ max = 30, olderThanDays = 3 } = {}) {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  const candidates = await withRetry(async () => {
    const { data, error } = await supabase
      .from('content_items')
      .select('id, url, tier, prompt, type, created_at')
      .eq('qa_status', 'approved')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(max * 2); // over-fetch to account for dedupe
    if (error) throw new Error(`refill.select_items: ${error.message}`);
    return data ?? [];
  }, { ...RETRY_OPTS, label: 'backup_queue.refill_select' });

  if (!candidates.length) return { added: 0, skipped: 0 };

  const urls = candidates.map((c) => c.url).filter(Boolean);
  const existing = await withRetry(async () => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('media_url')
      .in('media_url', urls);
    if (error) throw new Error(`refill.select_existing: ${error.message}`);
    return new Set((data ?? []).map((r) => r.media_url));
  }, { ...RETRY_OPTS, label: 'backup_queue.refill_existing' });

  const toInsert = [];
  for (const item of candidates) {
    if (!item.url || existing.has(item.url)) continue;
    if (toInsert.length >= max) break;
    const caption = (item.prompt ?? '').slice(0, 200);
    toInsert.push({
      media_url: item.url,
      captions: { tt: caption, ig: caption, tw: caption },
      tier: item.tier ?? 'T1',
      priority: 0,
      used: false,
      created_at: new Date().toISOString(),
    });
  }

  if (!toInsert.length) return { added: 0, skipped: candidates.length };

  await withRetry(async () => {
    const { error } = await supabase.from(TABLE).insert(toInsert);
    if (error) throw new Error(`refill.insert: ${error.message}`);
  }, { ...RETRY_OPTS, label: 'backup_queue.refill_insert' });

  return { added: toInsert.length, skipped: candidates.length - toInsert.length };
}
