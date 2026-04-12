/**
 * COO Agent — runs daily at 8am ET
 * Top authority. Supervises all agents. Produces daily digest.
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { runAgent, logMistake } from '../lib/agent_runner.js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendAlertEmail(date, digest, actionReasons) {
  if (!resend) {
    console.warn('[coo_agent] RESEND_API_KEY not set — skipping email alert');
    return;
  }

  const recipients = (process.env.ALERT_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);
  if (!recipients.length) {
    console.warn('[coo_agent] ALERT_EMAILS not set — skipping email alert');
    return;
  }

  const body = [
    `COO DAILY DIGEST — ${date}`,
    '='.repeat(60),
    digest,
    '',
    'ACTION REQUIRED:',
    ...(actionReasons ?? []).map(r => `• ${r}`),
    '',
    '— BlondeShell Automation System',
  ].join('\n');

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM ?? 'alerts@blondeshell.ai',
      to: recipients,
      subject: `🚨 BlondeShell COO Alert — ${date}`,
      text: body,
    });
    if (error) throw new Error(error.message);
    console.log(`[coo_agent] Alert email sent to ${recipients.join(', ')}`);
  } catch (err) {
    console.error(`[coo_agent] Email failed: ${err.message}`);
  }
}

const MODEL = 'claude-sonnet-4-6';

const KNOWN_AGENTS = ['strategy_agent', 'marketing_agent', 'learning_agent', 'trends_agent', 'plan_update_agent'];

const WEEKLY_REVENUE_TARGET = 250 / 4;   // ~$62.50/week (April target $250/mo)
const WEEKLY_SUB_TARGET = 10;            // 10 new subs/week minimum

const SYSTEM_PROMPT = `You are the COO of BlondeShell — an AI influencer monetized via Fanvue subscriptions and PPV.

Persona: Stern. Data-driven. No fluff. You speak only in metrics and decisions.
Max 200 words. No pleasantries. Every sentence must contain a number or a decision.

You will receive a data dump. Output ONLY valid JSON:
{
  "digest": "The daily digest — max 200 words, stern, data-driven, every line has numbers",
  "requires_action": boolean,
  "action_reasons": ["reason 1 if requires_action", ...],
  "revenue_assessment": "on-track | behind | critical",
  "growth_assessment": "on-track | behind | critical",
  "top_priority": "single most important thing to fix or maintain today"
}

Flag requires_action = true if:
- Revenue < 50% of weekly target ($31.25)
- Growth < 10 new subs this week
- Any agent is marked [AGENT DOWN]
- Content pipeline has <5 approved items`;

// ─── Data fetchers ────────────────────────────────────────────────────────────

// Max expected gap (hours) before an agent is considered down
const AGENT_CADENCE_HOURS = {
  marketing_agent:    26,   // daily
  trends_agent:       26,   // daily
  learning_agent:     26,   // daily
  plan_update_agent:  200,  // weekly (~8 days grace)
  strategy_agent:     800,  // monthly (~33 days grace)
};

async function getAgentHealth() {
  const { data } = await supabase
    .from('agent_logs')
    .select('agent, task, status, created_at')
    .order('created_at', { ascending: false });

  const latestByAgent = {};
  for (const row of (data ?? [])) {
    if (!latestByAgent[row.agent]) latestByAgent[row.agent] = row;
  }

  return KNOWN_AGENTS.map((name) => {
    const last = latestByAgent[name];
    const lastRun = last?.created_at ?? null;
    const maxGapMs = (AGENT_CADENCE_HOURS[name] ?? 26) * 60 * 60 * 1000;
    const isDown = !lastRun || new Date(lastRun) < new Date(Date.now() - maxGapMs);
    return { agent: name, last_run: lastRun, status: last?.status ?? 'never_run', down: isDown };
  });
}

async function getRevenueSnapshot() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [week, month] = await Promise.all([
    supabase.from('fanvue_earnings').select('amount, source').gte('date', since7d),
    supabase.from('fanvue_earnings').select('amount, source').gte('date', since30d),
  ]);

  const sum = (rows) => (rows ?? []).reduce((acc, r) => acc + Number(r.amount), 0);
  const bySource = (rows, src) => (rows ?? []).filter(r => r.source === src).reduce((acc, r) => acc + Number(r.amount), 0);

  const weekRows = week.data ?? [];
  const monthRows = month.data ?? [];

  return {
    week_total: sum(weekRows),
    week_subscriptions: bySource(weekRows, 'subscription'),
    week_ppv: bySource(weekRows, 'ppv'),
    week_tips: bySource(weekRows, 'tip'),
    month_total: sum(monthRows),
    weekly_target: WEEKLY_REVENUE_TARGET,
    vs_target_pct: Math.round((sum(weekRows) / WEEKLY_REVENUE_TARGET) * 100),
  };
}

async function getGrowthMetrics() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [week, month] = await Promise.all([
    supabase.from('subscriber_events').select('event_type, platform').gte('created_at', since7d),
    supabase.from('subscriber_events').select('event_type, platform').gte('created_at', since30d),
  ]);

  const count = (rows, type) => (rows ?? []).filter(r => r.event_type === type).length;

  return {
    week_subscribes: count(week.data, 'subscribe'),
    week_unsubscribes: count(week.data, 'unsubscribe'),
    week_net: count(week.data, 'subscribe') - count(week.data, 'unsubscribe'),
    week_follows: count(week.data, 'follow'),
    month_net_subs: count(month.data, 'subscribe') - count(month.data, 'unsubscribe'),
    weekly_sub_target: WEEKLY_SUB_TARGET,
  };
}

async function getContentHealth() {
  const { data: approved } = await supabase
    .from('content_items')
    .select('setting, tier, type, created_at')
    .eq('qa_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: pending } = await supabase
    .from('content_items')
    .select('id')
    .eq('qa_status', 'pending');

  const items = approved ?? [];
  const settingCounts = {};
  for (const item of items) {
    settingCounts[item.setting] = (settingCounts[item.setting] ?? 0) + 1;
  }

  return {
    approved_total: items.length,
    pending_count: (pending ?? []).length,
    images: items.filter(i => i.type === 'image').length,
    videos: items.filter(i => i.type === 'video').length,
    by_setting: settingCounts,
    pipeline_healthy: items.length >= 5,
  };
}

async function getPlatformScores() {
  const { data } = await supabase
    .from('platform_scores')
    .select('*')
    .order('date', { ascending: false })
    .limit(20);
  return data ?? [];
}

async function getRecentAgentLogs() {
  const { data } = await supabase
    .from('agent_logs')
    .select('agent, task, status, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  return data ?? [];
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildUserMessage({ agentHealth, revenue, growth, content, platformScores, recentLogs }) {
  const today = new Date().toISOString().slice(0, 10);
  const downAgents = agentHealth.filter(a => a.down);

  return `DATE: ${today}

=== AGENT HEALTH ===
${agentHealth.map(a =>
  `${a.agent}: ${a.down ? '[AGENT DOWN]' : 'OK'} | last_run: ${a.last_run?.slice(0, 16) ?? 'never'} | status: ${a.status}`
).join('\n')}
Agents down: ${downAgents.length}

=== REVENUE (last 7 days) ===
Total: $${revenue.week_total.toFixed(2)} / target: $${revenue.weekly_target.toFixed(2)} (${revenue.vs_target_pct}%)
Subscriptions: $${revenue.week_subscriptions.toFixed(2)} | PPV: $${revenue.week_ppv.toFixed(2)} | Tips: $${revenue.week_tips.toFixed(2)}
Month-to-date: $${revenue.month_total.toFixed(2)}

=== GROWTH (last 7 days) ===
New subs: ${growth.week_subscribes} | Unsubs: ${growth.week_unsubscribes} | Net: ${growth.week_net}
New follows: ${growth.week_follows}
Month net subs: ${growth.month_net_subs} / target: 25
Weekly sub target: ${growth.weekly_sub_target}

=== CONTENT PIPELINE ===
Approved: ${content.approved_total} items (${content.images} images, ${content.videos} videos)
Pending QA: ${content.pending_count}
By setting: ${JSON.stringify(content.by_setting)}
Pipeline healthy: ${content.pipeline_healthy}

=== PLATFORM SCORES (latest) ===
${platformScores.length ? platformScores.slice(0, 5).map(p =>
  `${p.platform} (${p.date}): ${p.followers} followers, ${p.engagement_rate}% engagement, ${p.posts_count} posts`
).join('\n') : 'No platform scores logged yet.'}

=== RECENT AGENT ACTIVITY ===
${recentLogs.slice(0, 8).map(l =>
  `${l.agent} | ${l.task} | ${l.status} | ${l.created_at?.slice(0, 16)}`
).join('\n') || '(none)'}

Generate the daily COO digest.`;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function writeSnapshot({ date, digest, revenue, growth, requiresAction }) {
  const { error } = await supabase.from('coo_digests').insert({
    date,
    digest,
    revenue_snapshot: revenue,
    growth_metrics: growth,
    requires_action: requiresAction,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`writeSnapshot failed: ${error.message}`);
}

async function logToAgentLogs(status, notes) {
  const { error } = await supabase.from('agent_logs').insert({
    agent: 'coo_agent',
    task: 'daily_digest',
    status,
    notes,
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[coo_agent] agent_logs write failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`\n[coo_agent] Starting — ${new Date().toISOString()}`);

  try {
    // Gather all data in parallel
    const [agentHealth, revenue, growth, content, platformScores, recentLogs] = await Promise.all([
      getAgentHealth(),
      getRevenueSnapshot(),
      getGrowthMetrics(),
      getContentHealth(),
      getPlatformScores(),
      getRecentAgentLogs(),
    ]);

    console.log('[coo_agent] Data gathered:');
    console.log(`  Agents down: ${agentHealth.filter(a => a.down).length}/${agentHealth.length}`);
    console.log(`  Revenue (7d): $${revenue.week_total.toFixed(2)} (${revenue.vs_target_pct}% of target)`);
    console.log(`  Growth (7d): ${growth.week_net} net subs`);
    console.log(`  Content: ${content.approved_total} approved items`);

    // Call Claude
    console.log('[coo_agent] Calling Claude Sonnet...');
    const userMessage = buildUserMessage({ agentHealth, revenue, growth, content, platformScores, recentLogs });
    const rawOutput = await runAgent({ systemPrompt: SYSTEM_PROMPT, userMessage, model: MODEL, maxTokens: 1024 });

    // Parse JSON — strip markdown fences and trailing commas (common LLM artifact)
    let parsed;
    try {
      const jsonText = rawOutput
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .replace(/,(\s*[}\]])/g, '$1')  // remove trailing commas
        .trim();
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Failed to parse COO output as JSON: ${e.message}\n\nRaw:\n${rawOutput}`);
    }

    // Print digest
    console.log('\n' + '═'.repeat(60));
    console.log('COO DAILY DIGEST —', today);
    console.log('═'.repeat(60));
    console.log(parsed.digest);
    console.log('─'.repeat(60));
    console.log(`Revenue: ${parsed.revenue_assessment} | Growth: ${parsed.growth_assessment}`);
    console.log(`Top priority: ${parsed.top_priority}`);

    if (parsed.requires_action) {
      console.log('\n🔴 [ACTION REQUIRED]');
      for (const reason of (parsed.action_reasons ?? [])) {
        console.log(`  • ${reason}`);
      }
      await sendAlertEmail(today, parsed.digest, parsed.action_reasons);
    }
    console.log('═'.repeat(60) + '\n');

    // Write snapshot
    await writeSnapshot({
      date: today,
      digest: parsed.digest,
      revenue,
      growth,
      requiresAction: parsed.requires_action,
    });

    // Log to agent_logs
    await logToAgentLogs('completed', parsed.top_priority);

    console.log('[coo_agent] Done.\n');

  } catch (err) {
    console.error(`[coo_agent] FATAL: ${err.message}`);
    await logMistake('coo_agent', err);
    await logToAgentLogs('failed', err.message);
    process.exit(1);
  }
}

main();
