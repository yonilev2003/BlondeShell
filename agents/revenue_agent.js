/**
 * Revenue Agent — runs daily at 3 AM UTC
 * Tracks revenue, manages subscriber segments, alerts on deviations.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { logMistake } from '../lib/agent_runner.js';
import { updateSegments, getSegmentCounts } from '../lib/crm.js';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODEL = 'claude-haiku-4-5-20251001';
const FANVUE_FEE = 0.20;

const SYSTEM_PROMPT = `You are the Revenue Agent for BlondeShell — an AI influencer monetized via Fanvue.

You analyze daily revenue data and subscriber segments. You are precise and numbers-focused.

Output ONLY valid JSON (no markdown):
{
  "summary": "1-2 sentence revenue summary with exact numbers",
  "revenue_status": "on_track|behind|critical",
  "alerts": ["any alerts worth flagging"],
  "recommendations": ["1-3 specific revenue optimization suggestions"]
}

Rules:
- Fanvue takes 20% of all revenue
- Month 1 target: $1,000 DM PPV + 300 subs
- Always report NET revenue (after Fanvue fee)
- Flag if daily revenue run rate won't meet monthly target`;

async function getDailyRevenue() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';

  const [dailyResult, monthResult] = await Promise.all([
    supabase.from('fanvue_earnings').select('amount, source').eq('date', today),
    supabase.from('fanvue_earnings').select('amount, source').gte('date', monthStart),
  ]);

  const sum = (rows, src) => (rows ?? [])
    .filter(r => !src || r.source === src)
    .reduce((acc, r) => acc + Number(r.amount), 0);

  const dailyRows = dailyResult.data ?? [];
  const monthRows = monthResult.data ?? [];

  return {
    today,
    daily_gross: sum(dailyRows),
    daily_net: sum(dailyRows) * (1 - FANVUE_FEE),
    daily_subs: sum(dailyRows, 'subscription'),
    daily_ppv: sum(dailyRows, 'ppv'),
    daily_tips: sum(dailyRows, 'tip'),
    month_gross: sum(monthRows),
    month_net: sum(monthRows) * (1 - FANVUE_FEE),
    month_subs_revenue: sum(monthRows, 'subscription'),
    month_ppv_revenue: sum(monthRows, 'ppv'),
  };
}

async function getMonthlyTarget() {
  const now = new Date();
  const { data } = await supabase
    .from('annual_milestones')
    .select('target_revenue, target_subs')
    .eq('month', now.getMonth() + 1)
    .eq('year', now.getFullYear())
    .single();

  return data || { target_revenue: 1000, target_subs: 300 };
}

async function getPreviousWhaleCount() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('agent_logs')
    .select('notes')
    .eq('agent', 'revenue_agent')
    .eq('task', 'daily_revenue_analysis')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data?.notes) return 0;
  const match = data.notes.match(/whales=(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function buildUserMessage({ revenue, segments, target, prevWhales }) {
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const projectedMonthly = dayOfMonth > 0 ? (revenue.month_net / dayOfMonth) * daysInMonth : 0;

  return `DATE: ${revenue.today}

=== DAILY REVENUE ===
Gross: $${revenue.daily_gross.toFixed(2)} | Net (after 20% Fanvue): $${revenue.daily_net.toFixed(2)}
Subscriptions: $${revenue.daily_subs.toFixed(2)} | PPV: $${revenue.daily_ppv.toFixed(2)} | Tips: $${revenue.daily_tips.toFixed(2)}

=== MONTH TO DATE ===
Gross: $${revenue.month_gross.toFixed(2)} | Net: $${revenue.month_net.toFixed(2)}
Subscriptions: $${revenue.month_subs_revenue.toFixed(2)} | PPV: $${revenue.month_ppv_revenue.toFixed(2)}
Projected monthly net: $${projectedMonthly.toFixed(2)}
Target: $${target.target_revenue} | ${Math.round((revenue.month_net / target.target_revenue) * 100)}% achieved

=== SUBSCRIBER SEGMENTS ===
Whale: ${segments.whale} | Active: ${segments.active} | New: ${segments.new}
At Risk: ${segments.at_risk} | Churned: ${segments.churned}
Total tracked: ${Object.values(segments).reduce((a, b) => a + b, 0)}
Previous whale count: ${prevWhales} | Change: ${segments.whale - prevWhales > 0 ? '+' : ''}${segments.whale - prevWhales}

Day ${dayOfMonth} of ${daysInMonth} — ${Math.round((dayOfMonth / daysInMonth) * 100)}% through month.
Analyze revenue trajectory and provide recommendations.`;
}

async function logToAgentLogs(status, notes) {
  const { error } = await supabase.from('agent_logs').insert({
    agent: 'revenue_agent',
    task: 'daily_revenue_analysis',
    status,
    notes,
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[revenue_agent] agent_logs failed: ${error.message}`);
}

async function alertCOO(message) {
  await supabase.from('agent_logs').insert({
    agent: 'revenue_agent',
    task: 'coo_alert',
    status: 'alert',
    notes: message,
    created_at: new Date().toISOString(),
  });
  console.log(`[revenue_agent] COO alert: ${message}`);
}

async function main() {
  console.log(`\n[revenue_agent] Starting — ${new Date().toISOString()}`);

  try {
    const [segmentResult, revenue, target, prevWhales] = await Promise.all([
      updateSegments(),
      getDailyRevenue(),
      getMonthlyTarget(),
      getPreviousWhaleCount(),
    ]);

    const segments = segmentResult.segments;
    console.log(`[revenue_agent] Segments updated: ${segmentResult.updated} subscribers`);
    console.log(`[revenue_agent] Daily net: $${revenue.daily_net.toFixed(2)} | Month net: $${revenue.month_net.toFixed(2)}`);

    const userMessage = buildUserMessage({ revenue, segments, target, prevWhales });
    console.log('[revenue_agent] Calling Claude Haiku...');

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');

    let parsed;
    try {
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');
      parsed = JSON.parse(rawText.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1'));
    } catch (e) {
      throw new Error(`Failed to parse output: ${e.message}\n\nRaw:\n${rawText}`);
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`REVENUE REPORT — ${revenue.today}`);
    console.log('-'.repeat(60));
    console.log(parsed.summary);
    console.log(`Status: ${parsed.revenue_status}`);
    if (parsed.alerts?.length) {
      for (const alert of parsed.alerts) console.log(`  ALERT: ${alert}`);
    }
    if (parsed.recommendations?.length) {
      for (const rec of parsed.recommendations) console.log(`  -> ${rec}`);
    }
    console.log('-'.repeat(60));

    if (parsed.revenue_status === 'behind' || parsed.revenue_status === 'critical') {
      await alertCOO(`Revenue ${parsed.revenue_status}: ${parsed.summary}`);
    }

    if (segments.whale > prevWhales) {
      console.log(`[revenue_agent] Positive signal: whale count increased ${prevWhales} -> ${segments.whale}`);
    }

    const notes = `net=$${revenue.month_net.toFixed(2)} status=${parsed.revenue_status} whales=${segments.whale} segs=${JSON.stringify(segments)}`;
    await logToAgentLogs('completed', notes);
    console.log('[revenue_agent] Done.\n');

  } catch (err) {
    console.error(`[revenue_agent] FATAL: ${err.message}`);
    await logMistake('revenue_agent', err);
    await logToAgentLogs('failed', err.message);
    process.exit(1);
  }
}

main();
