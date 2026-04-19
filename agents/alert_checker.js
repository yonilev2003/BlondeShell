/**
 * Alert Checker — runs every 30min via cron.
 * Evaluates Red Alert conditions from CLAUDE.md and dispatches warn/red alerts.
 * Returns a summary object; never calls process.exit.
 *
 * NOTE: Schema uses actual table names in this codebase — `content_items` for
 * generated content and `agent_logs` for agent log rows. The spec referenced
 * `generated_content` / `agent_log` which do not exist in this repo.
 */
import 'dotenv/config.js';
import { supabase } from '../lib/supabase.js';
import { sendAlert, sendRedAlert } from '../lib/alerts.js';

const HOUR_MS = 60 * 60 * 1000;

// Rough $/token for Anthropic spend estimation (blended input+output).
// Conservative mid-tier Sonnet estimate. Adjust as needed.
const CLAUDE_USD_PER_TOKEN = 0.000008;
const CLAUDE_MONTHLY_BUDGET_USD = 150;

async function checkFaceSimilarity() {
  const since = new Date(Date.now() - HOUR_MS).toISOString();
  const { data, error } = await supabase
    .from('content_items')
    .select('id, face_similarity, created_at')
    .gte('created_at', since)
    .lt('face_similarity', 0.85)
    .not('face_similarity', 'is', null);

  if (error) return { name: 'face_similarity', status: 'error', error: error.message };

  const count = (data ?? []).length;
  if (count >= 3) {
    await sendRedAlert(
      'Face similarity HARD STOP',
      `${count} items in the last hour scored below 0.85 face similarity. Generation should pause until hero refs are reviewed.`,
      { count, ids: data.map(d => d.id), threshold: 0.85 }
    );
    return { name: 'face_similarity', status: 'red', count };
  }
  if (count >= 1) {
    await sendAlert({
      level: 'warn',
      title: 'Face similarity degradation',
      body: `${count} item(s) in the last hour scored below 0.85 face similarity. Monitor trend.`,
      metadata: { count, ids: data.map(d => d.id), threshold: 0.85 },
    });
    return { name: 'face_similarity', status: 'warn', count };
  }
  return { name: 'face_similarity', status: 'ok', count: 0 };
}

async function checkFanvueFlagged() {
  const since = new Date(Date.now() - 2 * HOUR_MS).toISOString();
  const { data, error } = await supabase
    .from('posts')
    .select('id, rejection_reason, created_at')
    .eq('status', 'rejected')
    .ilike('rejection_reason', '%flagged%')
    .gte('created_at', since);

  if (error) return { name: 'fanvue_flagged', status: 'error', error: error.message };

  if ((data ?? []).length >= 1) {
    // Pause all posts in content_config
    const { error: cfgErr } = await supabase
      .from('content_config')
      .upsert({ id: 'singleton', publishing_paused: true, paused_at: new Date().toISOString(), paused_reason: 'fanvue_flagged' });

    await sendRedAlert(
      'Fanvue content flagged — publishing PAUSED',
      `${data.length} post(s) rejected with "flagged" reason in the last 2 hours. All publishing has been paused. Owner login required to review.`,
      { count: data.length, ids: data.map(d => d.id), pause_error: cfgErr?.message ?? null }
    );
    return { name: 'fanvue_flagged', status: 'red', count: data.length, paused: !cfgErr };
  }
  return { name: 'fanvue_flagged', status: 'ok', count: 0 };
}

async function checkClaudeSpend() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data, error } = await supabase
    .from('agent_logs')
    .select('tokens_used')
    .gte('created_at', monthStart);

  if (error) return { name: 'claude_spend', status: 'error', error: error.message };

  const totalTokens = (data ?? []).reduce((s, r) => s + Number(r.tokens_used ?? 0), 0);
  const estUsd = totalTokens * CLAUDE_USD_PER_TOKEN;

  if (estUsd > CLAUDE_MONTHLY_BUDGET_USD) {
    await sendRedAlert(
      'Claude API spend exceeded budget',
      `Estimated month-to-date Claude spend is $${estUsd.toFixed(2)} (budget: $${CLAUDE_MONTHLY_BUDGET_USD}). Token audit required immediately.`,
      { total_tokens: totalTokens, estimated_usd: estUsd, budget_usd: CLAUDE_MONTHLY_BUDGET_USD }
    );
    return { name: 'claude_spend', status: 'red', estUsd };
  }
  return { name: 'claude_spend', status: 'ok', estUsd };
}

async function checkPipelineStall() {
  const since = new Date(Date.now() - 6 * HOUR_MS).toISOString();
  const { count, error } = await supabase
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);

  if (error) return { name: 'pipeline_stall', status: 'error', error: error.message };

  if ((count ?? 0) === 0) {
    await sendAlert({
      level: 'warn',
      title: 'Content pipeline stall',
      body: 'No new content_items rows in the last 6 hours. Check generation workers.',
      metadata: { window_hours: 6 },
    });
    return { name: 'pipeline_stall', status: 'warn', count: 0 };
  }
  return { name: 'pipeline_stall', status: 'ok', count };
}

async function checkSubstyService() {
  const url = process.env.SUBSTY_SERVICE_URL;
  if (!url) return { name: 'substy_service', status: 'skipped', reason: 'no_url' };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return { name: 'substy_service', status: 'ok' };
  } catch (err) {
    await sendAlert({
      level: 'warn',
      title: 'Substy service down',
      body: `Health check failed for ${url}/health: ${err.message}. DM automation may be offline.`,
      metadata: { url, error: err.message },
    });
    return { name: 'substy_service', status: 'warn', error: err.message };
  }
}

async function checkFanvueTokens() {
  const { data, error } = await supabase
    .from('fanvue_tokens')
    .select('*')
    .limit(1);

  if (error) return { name: 'fanvue_tokens', status: 'error', error: error.message };
  const row = (data ?? [])[0];
  if (!row) {
    await sendAlert({
      level: 'warn',
      title: 'Fanvue tokens missing',
      body: 'No row in fanvue_tokens table. Run: npm run fanvue:auth',
      metadata: {},
    });
    return { name: 'fanvue_tokens', status: 'warn', reason: 'missing' };
  }
  const updatedAt = row.updated_at ? new Date(row.updated_at) : null;
  const ageDays = updatedAt ? (Date.now() - updatedAt.getTime()) / (24 * HOUR_MS) : null;
  if (ageDays !== null && ageDays > 30) {
    await sendAlert({
      level: 'warn',
      title: 'Fanvue tokens aging — re-auth soon',
      body: `Fanvue tokens last updated ${Math.round(ageDays)} days ago. Refresh may fail soon. Run: npm run fanvue:auth`,
      metadata: { age_days: Math.round(ageDays), updated_at: row.updated_at },
    });
    return { name: 'fanvue_tokens', status: 'warn', ageDays };
  }
  return { name: 'fanvue_tokens', status: 'ok', ageDays };
}

async function runAlertChecks() {
  const startedAt = new Date().toISOString();
  const results = await Promise.allSettled([
    checkFaceSimilarity(),
    checkFanvueFlagged(),
    checkClaudeSpend(),
    checkPipelineStall(),
    checkSubstyService(),
    checkFanvueTokens(),
  ]);

  const checks = results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    const names = ['face_similarity', 'fanvue_flagged', 'claude_spend', 'pipeline_stall', 'substy_service', 'fanvue_tokens'];
    return { name: names[i], status: 'error', error: r.reason?.message ?? String(r.reason) };
  });

  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    red: checks.filter(c => c.status === 'red').length,
    warn: checks.filter(c => c.status === 'warn').length,
    error: checks.filter(c => c.status === 'error').length,
    ok: checks.filter(c => c.status === 'ok').length,
    checks,
  };
  console.log('[alert_checker]', JSON.stringify(summary));
  return summary;
}

// Allow direct invocation (node agents/alert_checker.js)
if (import.meta.url === `file://${process.argv[1]}`) {
  runAlertChecks().catch(err => {
    console.error('[alert_checker] fatal:', err);
  });
}

export { runAlertChecks };
