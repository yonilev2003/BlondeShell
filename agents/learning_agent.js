/**
 * Learning Agent — runs daily at 2am ET
 * Quiet analyst. Reads everything, opines only with data.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { logMistake } from '../lib/agent_runner.js';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are the Learning Agent for BlondeShell — an AI influencer analytics system.

You are a quiet analyst. You read performance data and extract patterns. You never speculate.
Every recommendation must cite a specific data point. If data is absent, say so.

Output ONLY valid JSON (no markdown):
{
  "recommendations": [
    {"id": 1, "finding": "data-backed observation", "action": "specific thing to change or keep", "confidence": "high|medium|low"},
    {"id": 2, ...},
    {"id": 3, ...}
  ],
  "raw_analysis": "2-3 paragraph analytical summary with numbers",
  "week_comparison": "this week vs last week in one sentence with numbers",
  "data_gaps": ["list of missing data that would improve analysis"]
}

Rules:
- 3 to 5 recommendations only
- No speculation. If N < 10 data points, flag as low confidence
- Focus on: setting performance, posting time, tier conversion, churn patterns`;

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getPlatformScores(days = 14) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('platform_scores')
    .select('*')
    .gte('date', since)
    .order('date', { ascending: false });
  return data ?? [];
}

async function getContentItems(days = 14) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('content_items')
    .select('id, type, setting, tier, mood, qa_status, platforms, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  return data ?? [];
}

async function getCOODigests(days = 14) {
  const { data } = await supabase
    .from('coo_digests')
    .select('date, digest, revenue_snapshot, growth_metrics, requires_action')
    .order('created_at', { ascending: false })
    .limit(14);
  return data ?? [];
}

async function getSubscriberEvents(days = 14) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('subscriber_events')
    .select('event_type, platform, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  return data ?? [];
}

async function getLastWeekReport() {
  const { data } = await supabase
    .from('learning_reports')
    .select('week_of, recommendations, raw_analysis')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

// ─── Analysis helpers ─────────────────────────────────────────────────────────

function analyzeContent(items) {
  const bySetting = {};
  const byTier = {};
  const thisWeekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const lastWeekCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const thisWeek = items.filter(i => i.created_at >= thisWeekCutoff);
  const lastWeek = items.filter(i => i.created_at >= lastWeekCutoff && i.created_at < thisWeekCutoff);

  for (const item of items) {
    bySetting[item.setting] = (bySetting[item.setting] ?? 0) + 1;
    byTier[item.tier] = (byTier[item.tier] ?? 0) + 1;
  }

  const approved = items.filter(i => i.qa_status === 'approved').length;
  const rejected = items.filter(i => i.qa_status === 'rejected').length;

  return { bySetting, byTier, approved, rejected, thisWeek: thisWeek.length, lastWeek: lastWeek.length };
}

function analyzeSubscriberEvents(events) {
  const thisWeekCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const lastWeekCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const thisWeek = events.filter(e => e.created_at >= thisWeekCutoff);
  const lastWeek = events.filter(e => e.created_at >= lastWeekCutoff && e.created_at < thisWeekCutoff);

  const net = (evts) => evts.filter(e => e.event_type === 'subscribe').length - evts.filter(e => e.event_type === 'unsubscribe').length;
  return { thisWeekNet: net(thisWeek), lastWeekNet: net(lastWeek), thisWeekFollows: thisWeek.filter(e => e.event_type === 'follow').length };
}

function analyzePlatforms(scores) {
  const byPlatform = {};
  for (const s of scores) {
    if (!byPlatform[s.platform]) byPlatform[s.platform] = [];
    byPlatform[s.platform].push(s);
  }

  const summary = {};
  for (const [platform, rows] of Object.entries(byPlatform)) {
    const avg = (field) => rows.reduce((a, r) => a + (r[field] ?? 0), 0) / rows.length;
    summary[platform] = {
      avg_engagement: avg('engagement_rate').toFixed(2),
      avg_followers: Math.round(avg('followers')),
      data_points: rows.length,
    };
  }
  return summary;
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildUserMessage({ contentAnalysis, subAnalysis, platformSummary, cooDigests, lastReport }) {
  const today = new Date().toISOString().slice(0, 10);

  // Get current week_of (Monday)
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  const weekOf = monday.toISOString().slice(0, 10);

  return `Analysis date: ${today} | Week of: ${weekOf}

=== CONTENT PERFORMANCE (last 14 days) ===
Total items: ${contentAnalysis.approved + contentAnalysis.rejected}
Approved: ${contentAnalysis.approved} | Rejected: ${contentAnalysis.rejected}
By setting: ${JSON.stringify(contentAnalysis.bySetting)}
By tier: ${JSON.stringify(contentAnalysis.byTier)}
This week generated: ${contentAnalysis.thisWeek} | Last week: ${contentAnalysis.lastWeek}

=== SUBSCRIBER EVENTS (last 14 days) ===
This week net subs: ${subAnalysis.thisWeekNet} | Last week net subs: ${subAnalysis.lastWeekNet}
This week new follows: ${subAnalysis.thisWeekFollows}
Note: low data volume — treat as low confidence

=== PLATFORM SCORES (last 14 days) ===
${Object.keys(platformSummary).length > 0
  ? JSON.stringify(platformSummary, null, 2)
  : 'NO PLATFORM DATA — insufficient historical data. Flag as data gap.'}

=== COO DIGEST HISTORY (last 14 days) ===
${cooDigests.length > 0
  ? cooDigests.slice(0, 7).map(d => `${d.date}: requires_action=${d.requires_action}`).join('\n')
  : 'No COO digests yet.'}

=== LAST WEEK'S REPORT ===
${lastReport ? `Week of ${lastReport.week_of}:\n${lastReport.raw_analysis}` : 'No prior report — this is the first run.'}

Generate analysis and 3-5 data-backed recommendations.
Flag any low-confidence findings due to insufficient data (N < 10 observations).`;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function saveReport(weekOf, parsed) {
  const { error } = await supabase.from('learning_reports').insert({
    week_of: weekOf,
    recommendations: parsed.recommendations,
    raw_analysis: parsed.raw_analysis,
    applied: false,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`saveReport failed: ${error.message}`);
}

async function logToAgentLogs(status, notes) {
  const { error } = await supabase.from('agent_logs').insert({
    agent: 'learning_agent',
    task: 'weekly_pattern_analysis',
    status,
    notes,
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[learning_agent] agent_logs failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[learning_agent] Starting — ${new Date().toISOString()}`);

  try {
    // 1. Gather data in parallel
    const [platformScores, contentItems, cooDigests, subEvents, lastReport] = await Promise.all([
      getPlatformScores(14),
      getContentItems(14),
      getCOODigests(14),
      getSubscriberEvents(14),
      getLastWeekReport(),
    ]);

    console.log(`[learning_agent] Data: platform_scores=${platformScores.length}, content_items=${contentItems.length}, coo_digests=${cooDigests.length}, sub_events=${subEvents.length}`);

    // 2. Analyze
    const contentAnalysis = analyzeContent(contentItems);
    const subAnalysis = analyzeSubscriberEvents(subEvents);
    const platformSummary = analyzePlatforms(platformScores);

    // 3. Call Claude
    const userMessage = buildUserMessage({ contentAnalysis, subAnalysis, platformSummary, cooDigests, lastReport });
    console.log('[learning_agent] Calling Claude Haiku...');

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');

    // 4. Parse JSON
    let parsed;
    try {
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');
      parsed = JSON.parse(rawText.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1'));
    } catch (e) {
      throw new Error(`Failed to parse output: ${e.message}\n\nRaw:\n${rawText}`);
    }

    // 5. Get current week_of
    const d = new Date();
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    const weekOf = monday.toISOString().slice(0, 10);

    // 6. Save report
    await saveReport(weekOf, parsed);

    // 7. Print
    console.log('\n' + '─'.repeat(60));
    console.log(`LEARNING REPORT — week of ${weekOf}`);
    console.log('─'.repeat(60));
    for (const rec of parsed.recommendations ?? []) {
      console.log(`[${rec.id}] ${rec.finding}`);
      console.log(`    → ${rec.action} [${rec.confidence}]`);
    }
    console.log('\nAnalysis:');
    console.log(parsed.raw_analysis);
    if (parsed.data_gaps?.length) {
      console.log(`\nData gaps: ${parsed.data_gaps.join(', ')}`);
    }
    console.log('─'.repeat(60));

    const summary = `${(parsed.recommendations ?? []).length} recommendations | week_of: ${weekOf} | data_gaps: ${(parsed.data_gaps ?? []).length}`;
    await logToAgentLogs('completed', summary);
    console.log('[learning_agent] Done.\n');

  } catch (err) {
    console.error(`[learning_agent] FATAL: ${err.message}`);
    await logMistake('learning_agent', err);
    await logToAgentLogs('failed', err.message);
    process.exit(1);
  }
}

main();
