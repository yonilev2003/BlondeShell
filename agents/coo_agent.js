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

async function sendDailyEmail(date, digest, requiresAction, actionReasons, extras = {}) {
  if (!resend) {
    console.warn('[coo_agent] RESEND_API_KEY not set — skipping email');
    return;
  }

  const recipients = (process.env.ALERT_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);
  if (!recipients.length) {
    console.warn('[coo_agent] ALERT_EMAILS not set — skipping email');
    return;
  }

  const lines = [
    `COO DAILY DIGEST — ${date}`,
    '='.repeat(60),
    digest,
    '',
  ];

  if (requiresAction && actionReasons?.length) {
    lines.push('⚠️  ACTION REQUIRED:');
    for (const r of actionReasons) lines.push(`• ${r}`);
    lines.push('');
  }

  if (extras.revenueWow !== null && extras.revenueWow !== undefined) {
    lines.push(`Revenue WoW: ${extras.revenueWow >= 0 ? '+' : ''}${extras.revenueWow}%`);
  }
  if (extras.growthWow !== null && extras.growthWow !== undefined) {
    lines.push(`Growth WoW: ${extras.growthWow >= 0 ? '+' : ''}${extras.growthWow}%`);
  }
  if (extras.varietyScore !== undefined) {
    lines.push(`Content variety: ${extras.varietyScore}/100`);
  }

  lines.push('', '— BlondeShell Automation System');

  const subject = requiresAction
    ? `🚨 BlondeShell COO Alert — ${date}`
    : `📊 BlondeShell COO Digest — ${date}`;

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM ?? 'alerts@blondeshell.ai',
      to: recipients,
      subject,
      text: lines.join('\n'),
    });
    if (error) throw new Error(error.message);
    console.log(`[coo_agent] Daily email sent to ${recipients.join(', ')}`);
  } catch (err) {
    console.error(`[coo_agent] Email failed: ${err.message}`);
  }
}

const MODEL = 'claude-sonnet-4-6';

const KNOWN_AGENTS = ['strategy_agent', 'marketing_agent', 'learning_agent', 'trends_agent', 'plan_update_agent', 'revenue_agent', 'tool_eval_agent'];

const WEEKLY_REVENUE_TARGET = 250 / 4;   // ~$62.50/week (April target $250/mo)
const WEEKLY_SUB_TARGET = 10;            // 10 new subs/week minimum

const SYSTEM_PROMPT = `You are the COO of BlondeShell — an AI influencer monetized via Fanvue subscriptions and PPV.

Persona: Stern. Data-driven. No fluff. You speak only in metrics and decisions.
Max 250 words. No pleasantries. Every sentence must contain a number or a decision.

You will receive a data dump including week-over-week comparisons. Output ONLY valid JSON:
{
  "digest": "The daily digest — max 250 words, stern, data-driven, every line has numbers. Include % changes vs last week.",
  "requires_action": boolean,
  "action_reasons": ["reason 1 if requires_action", ...],
  "revenue_assessment": "on-track | behind | critical",
  "growth_assessment": "on-track | behind | critical",
  "top_priority": "single most important thing to fix or maintain today",
  "api_issues": ["any unresolved API errors/questions — include the API name + error code"],
  "content_variety_score": number_0_to_100,
  "platform_health": { "tiktok": "up|flat|down", "instagram": "up|flat|down", "twitter": "up|flat|down" },
  "agent_quality_notes": ["e.g. learning_agent produced 3 HIGH rules this week"]
}

Flag requires_action = true if:
- Revenue < 50% of weekly target ($31.25)
- Revenue down >20% week-over-week
- Growth < 10 new subs this week
- Any agent is marked [AGENT DOWN]
- Content pipeline has <5 approved items
- Content variety score < 40 (>60% same setting/mood)
- Unresolved Fanvue or Publer API errors for >24h

For API errors list them in api_issues so the owner can ask the relevant AI assistant:
- Fanvue questions: api.fanvue.com/docs → Ask AI button
- Publer questions: publer.com/docs → Ask AI button
- Always include mediaUuid / job_id / error message when escalating`;

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
  const since7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [week, prevWeek, month] = await Promise.all([
    supabase.from('fanvue_earnings').select('amount, source').gte('date', since7d),
    supabase.from('fanvue_earnings').select('amount, source').gte('date', since14d).lt('date', since7d),
    supabase.from('fanvue_earnings').select('amount, source').gte('date', since30d),
  ]);

  const sum = (rows) => (rows ?? []).reduce((acc, r) => acc + Number(r.amount), 0);
  const bySource = (rows, src) => (rows ?? []).filter(r => r.source === src).reduce((acc, r) => acc + Number(r.amount), 0);

  const weekRows = week.data ?? [];
  const prevWeekRows = prevWeek.data ?? [];
  const monthRows = month.data ?? [];

  const weekTotal = sum(weekRows);
  const prevWeekTotal = sum(prevWeekRows);
  const wow = prevWeekTotal > 0 ? Math.round(((weekTotal - prevWeekTotal) / prevWeekTotal) * 100) : null;

  return {
    week_total: weekTotal,
    prev_week_total: prevWeekTotal,
    week_over_week_pct: wow,
    week_subscriptions: bySource(weekRows, 'subscription'),
    week_ppv: bySource(weekRows, 'ppv'),
    week_tips: bySource(weekRows, 'tip'),
    month_total: sum(monthRows),
    weekly_target: WEEKLY_REVENUE_TARGET,
    vs_target_pct: Math.round((weekTotal / WEEKLY_REVENUE_TARGET) * 100),
  };
}

async function getGrowthMetrics() {
  const since7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [week, prevWeek, month] = await Promise.all([
    supabase.from('subscriber_events').select('event_type, platform').gte('created_at', since7d),
    supabase.from('subscriber_events').select('event_type, platform').gte('created_at', since14d).lt('created_at', since7d),
    supabase.from('subscriber_events').select('event_type, platform').gte('created_at', since30d),
  ]);

  const count = (rows, type) => (rows ?? []).filter(r => r.event_type === type).length;

  const weekNet = count(week.data, 'subscribe') - count(week.data, 'unsubscribe');
  const prevWeekNet = count(prevWeek.data, 'subscribe') - count(prevWeek.data, 'unsubscribe');
  const wow = prevWeekNet !== 0 ? Math.round(((weekNet - prevWeekNet) / Math.abs(prevWeekNet)) * 100) : null;

  return {
    week_subscribes: count(week.data, 'subscribe'),
    week_unsubscribes: count(week.data, 'unsubscribe'),
    week_net: weekNet,
    prev_week_net: prevWeekNet,
    week_over_week_pct: wow,
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

  // Variety score: 100 = fully varied, 0 = all same setting
  // Penalise when one setting dominates >60% of items
  const totalItems = items.length;
  let varietyScore = 100;
  if (totalItems > 0) {
    const maxCount = Math.max(...Object.values(settingCounts), 0);
    const dominancePct = maxCount / totalItems;
    varietyScore = Math.round(Math.max(0, 100 - (dominancePct - 0.33) * 200));
  }

  return {
    approved_total: totalItems,
    pending_count: (pending ?? []).length,
    images: items.filter(i => i.type === 'image').length,
    videos: items.filter(i => i.type === 'video').length,
    by_setting: settingCounts,
    pipeline_healthy: totalItems >= 5,
    variety_score: varietyScore,
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

async function getPlatformHealthTrend() {
  const { data } = await supabase
    .from('platform_scores')
    .select('platform, date, engagement_rate, followers')
    .order('date', { ascending: false })
    .limit(40);

  const rows = data ?? [];
  const platforms = ['tiktok', 'instagram', 'twitter'];
  const trend = {};

  for (const platform of platforms) {
    const pts = rows.filter(r => r.platform === platform).slice(0, 14);
    if (pts.length < 2) { trend[platform] = 'unknown'; continue; }
    const recent = pts.slice(0, 7).reduce((s, r) => s + Number(r.engagement_rate ?? 0), 0) / Math.min(7, pts.length);
    const prior = pts.slice(7, 14).reduce((s, r) => s + Number(r.engagement_rate ?? 0), 0) / Math.min(7, pts.slice(7).length);
    if (prior === 0) { trend[platform] = 'unknown'; continue; }
    const delta = ((recent - prior) / prior) * 100;
    trend[platform] = delta > 5 ? 'up' : delta < -5 ? 'down' : 'flat';
  }

  return trend;
}

async function getLearningQuality() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('skill_rules')
    .select('confidence, created_at')
    .gte('created_at', since7d);

  const rows = data ?? [];
  const high = rows.filter(r => r.confidence === 'HIGH').length;
  const medium = rows.filter(r => r.confidence === 'MEDIUM').length;
  const low = rows.filter(r => r.confidence === 'LOW').length;
  return { total: rows.length, high, medium, low };
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

function buildUserMessage({ agentHealth, revenue, growth, content, platformScores, platformTrend, learningQuality, recentLogs }) {
  const today = new Date().toISOString().slice(0, 10);
  const downAgents = agentHealth.filter(a => a.down);

  const wowRevStr = revenue.week_over_week_pct !== null
    ? ` (${revenue.week_over_week_pct >= 0 ? '+' : ''}${revenue.week_over_week_pct}% WoW)`
    : ' (no prior week data)';
  const wowSubStr = growth.week_over_week_pct !== null
    ? ` (${growth.week_over_week_pct >= 0 ? '+' : ''}${growth.week_over_week_pct}% WoW)`
    : ' (no prior week data)';

  return `DATE: ${today}

=== AGENT HEALTH ===
${agentHealth.map(a =>
  `${a.agent}: ${a.down ? '[AGENT DOWN]' : 'OK'} | last_run: ${a.last_run?.slice(0, 16) ?? 'never'} | status: ${a.status}`
).join('\n')}
Agents down: ${downAgents.length}

=== REVENUE (last 7 days) ===
Total: $${revenue.week_total.toFixed(2)} / target: $${revenue.weekly_target.toFixed(2)} (${revenue.vs_target_pct}%)${wowRevStr}
Prior week: $${revenue.prev_week_total.toFixed(2)}
Subscriptions: $${revenue.week_subscriptions.toFixed(2)} | PPV: $${revenue.week_ppv.toFixed(2)} | Tips: $${revenue.week_tips.toFixed(2)}
Month-to-date: $${revenue.month_total.toFixed(2)}

=== GROWTH (last 7 days) ===
New subs: ${growth.week_subscribes} | Unsubs: ${growth.week_unsubscribes} | Net: ${growth.week_net}${wowSubStr}
Prior week net: ${growth.prev_week_net}
New follows: ${growth.week_follows}
Month net subs: ${growth.month_net_subs} / target: 25
Weekly sub target: ${growth.weekly_sub_target}

=== CONTENT PIPELINE ===
Approved: ${content.approved_total} items (${content.images} images, ${content.videos} videos)
Pending QA: ${content.pending_count}
By setting: ${JSON.stringify(content.by_setting)}
Pipeline healthy: ${content.pipeline_healthy}
Variety score: ${content.variety_score}/100 (flag if <40)

=== PLATFORM HEALTH TREND (engagement rate, 7d vs prior 7d) ===
TikTok: ${platformTrend.tiktok ?? 'unknown'} | Instagram: ${platformTrend.instagram ?? 'unknown'} | Twitter: ${platformTrend.twitter ?? 'unknown'}

=== PLATFORM SCORES (latest) ===
${platformScores.length ? platformScores.slice(0, 5).map(p =>
  `${p.platform} (${p.date}): ${p.followers} followers, ${p.engagement_rate}% engagement, ${p.posts_count} posts`
).join('\n') : 'No platform scores logged yet.'}

=== LEARNING QUALITY (last 7 days) ===
Rules produced: ${learningQuality.total} total | HIGH: ${learningQuality.high} | MEDIUM: ${learningQuality.medium} | LOW: ${learningQuality.low}

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
    const [agentHealth, revenue, growth, content, platformScores, platformTrend, learningQuality, recentLogs] = await Promise.all([
      getAgentHealth(),
      getRevenueSnapshot(),
      getGrowthMetrics(),
      getContentHealth(),
      getPlatformScores(),
      getPlatformHealthTrend(),
      getLearningQuality(),
      getRecentAgentLogs(),
    ]);

    console.log('[coo_agent] Data gathered:');
    console.log(`  Agents down: ${agentHealth.filter(a => a.down).length}/${agentHealth.length}`);
    console.log(`  Revenue (7d): $${revenue.week_total.toFixed(2)} (${revenue.vs_target_pct}% of target, WoW: ${revenue.week_over_week_pct ?? '?'}%)`);
    console.log(`  Growth (7d): ${growth.week_net} net subs (WoW: ${growth.week_over_week_pct ?? '?'}%)`);
    console.log(`  Content: ${content.approved_total} items, variety: ${content.variety_score}/100`);
    console.log(`  Learning: ${learningQuality.total} rules (${learningQuality.high} HIGH)`);

    // Call Claude
    console.log('[coo_agent] Calling Claude Sonnet...');
    const userMessage = buildUserMessage({ agentHealth, revenue, growth, content, platformScores, platformTrend, learningQuality, recentLogs });
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
    }
    console.log('═'.repeat(60) + '\n');

    // Always send daily email (alert subject if action required)
    await sendDailyEmail(today, parsed.digest, parsed.requires_action, parsed.action_reasons, {
      revenueWow: revenue.week_over_week_pct,
      growthWow: growth.week_over_week_pct,
      varietyScore: content.variety_score,
    });

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
