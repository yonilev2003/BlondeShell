/**
 * Backup Check Agent — runs hourly.
 *
 * Logic:
 *   1. Count today's scheduled publishes (post_analytics + publer_scheduled).
 *      If < 3 expected slots, dequeue backup content and schedule it via Publer.
 *   2. queueSize('T1') < 10 → yellow warn.
 *   3. queueSize('T1') < 3  → red "CONTENT QUEUE CRITICALLY LOW".
 *   4. Log summary to agent_logs.
 */

import { dequeueOldest, queueSize } from '../lib/backup_queue.js';
import { supabase, logAgentAction } from '../lib/supabase.js';
import { schedulePost, uploadMediaFromUrl, getPlatformIds } from '../lib/publer.js';
import 'dotenv/config';

const MIN_DAILY_SLOTS = 3;
const WARN_QUEUE_SIZE = 10;
const CRIT_QUEUE_SIZE = 3;

// Dynamic alert loader — Agent B may not have shipped lib/alerts.js yet.
async function sendAlertSafe(level, message, meta = {}) {
  try {
    const mod = await import('../lib/alerts.js');
    if (mod?.sendAlert) return await mod.sendAlert({ level, message, meta });
  } catch {
    // fall through
  }
  const prefix = level === 'red' ? '[RED ALERT]' : level === 'yellow' ? '[WARN]' : '[INFO]';
  console.warn(`${prefix} ${message}`, meta);
}

function todayBoundsUtc() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function countScheduledToday() {
  const { start, end } = todayBoundsUtc();
  let total = 0;

  // post_analytics: posts that have already gone live today
  try {
    const { count, error } = await supabase
      .from('post_analytics')
      .select('id', { count: 'exact', head: true })
      .gte('posted_at', start)
      .lt('posted_at', end);
    if (error) throw error;
    total += count ?? 0;
  } catch (err) {
    console.warn(`[backup_check] post_analytics count failed: ${err.message}`);
  }

  // publer_scheduled: future scheduled posts for today (optional table)
  try {
    const { count, error } = await supabase
      .from('publer_scheduled')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_at', start)
      .lt('scheduled_at', end);
    if (!error) total += count ?? 0;
  } catch {
    // table may not exist; ignore
  }

  return total;
}

async function scheduleBackupItem(item, platformIds) {
  // Default to TikTok (cheap + tolerant of repeat content); fall back to IG.
  const account = platformIds.tiktok ?? platformIds.instagram ?? platformIds.twitter;
  if (!account?.id) throw new Error('no Publer account available');

  const media = await uploadMediaFromUrl(item.media_url, {
    name: `backup_${item.id}.jpg`,
  });

  const captions = item.captions ?? {};
  const caption = captions.tt ?? captions.ig ?? captions.tw ?? 'new drop';

  // Schedule 30 min out so Publer has time to ingest.
  const scheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const jobId = await schedulePost({
    accountId: account.id,
    networkKey: account.networkKey,
    caption,
    scheduledAt,
    mediaId: media.id,
    mediaType: 'photo',
    tiktokTitle: account.networkKey === 'tiktok' ? caption.slice(0, 80) : null,
  });

  return { jobId, platform: account.networkKey, scheduledAt };
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`\n[backup_check] Starting — ${startedAt}`);

  const summary = {
    startedAt,
    scheduledToday: 0,
    backupsScheduled: 0,
    backupsFailed: 0,
    queue: null,
    alerts: [],
    errors: [],
  };

  try {
    const scheduledToday = await countScheduledToday();
    summary.scheduledToday = scheduledToday;
    console.log(`[backup_check] Scheduled today: ${scheduledToday} (min ${MIN_DAILY_SLOTS})`);

    if (scheduledToday < MIN_DAILY_SLOTS) {
      const needed = MIN_DAILY_SLOTS - scheduledToday;
      console.log(`[backup_check] Gap detected — pulling ${needed} backup items`);
      const items = await dequeueOldest(needed, 'T1');

      if (items.length === 0) {
        summary.errors.push('no T1 backup items available');
        await sendAlertSafe('red', 'CONTENT QUEUE EMPTY — no T1 backups to fill gap', { needed });
      } else {
        let platformIds;
        try {
          platformIds = await getPlatformIds();
        } catch (err) {
          platformIds = { instagram: null, tiktok: null, twitter: null };
          summary.errors.push(`getPlatformIds: ${err.message}`);
        }

        for (const item of items) {
          try {
            const result = await scheduleBackupItem(item, platformIds);
            summary.backupsScheduled++;
            console.log(`[backup_check] scheduled backup ${item.id} → ${result.platform} @ ${result.scheduledAt} (job ${result.jobId})`);
          } catch (err) {
            summary.backupsFailed++;
            summary.errors.push(`schedule ${item.id}: ${err.message}`);
            console.warn(`[backup_check] schedule failed ${item.id}: ${err.message}`);
          }
        }
      }
    }

    const queue = await queueSize();
    summary.queue = queue;
    const t1 = queue.T1 ?? 0;

    if (t1 < CRIT_QUEUE_SIZE) {
      summary.alerts.push('red');
      await sendAlertSafe('red', 'CONTENT QUEUE CRITICALLY LOW', { tier: 'T1', remaining: t1 });
    } else if (t1 < WARN_QUEUE_SIZE) {
      summary.alerts.push('yellow');
      await sendAlertSafe('yellow', `Backup queue low: T1=${t1} (warn threshold ${WARN_QUEUE_SIZE})`, { queue });
    }

    summary.completedAt = new Date().toISOString();
    console.log('[backup_check] Summary:', JSON.stringify(summary, null, 2));

    const status = summary.errors.length === 0 ? 'completed' : 'partial';
    await logAgentAction('backup_check_agent', 'hourly_backup_check', status, JSON.stringify(summary));
    return summary;
  } catch (err) {
    summary.errors.push(`fatal: ${err.message}`);
    console.error(`[backup_check] FATAL: ${err.message}`);
    await logAgentAction('backup_check_agent', 'hourly_backup_check', 'failed', err.message).catch(() => {});
    throw err;
  }
}

// Only auto-run when executed directly (not when imported in tests).
const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch(() => process.exit(1));
}

export { main };
