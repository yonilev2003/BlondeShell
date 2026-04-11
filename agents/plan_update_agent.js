/**
 * Plan Update Agent — runs every Sunday at 10pm ET
 * Reads performance + trends + learning → generates next week's content plan.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { logMistake } from '../lib/agent_runner.js';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODEL = 'claude-haiku-4-5-20251001';

const CONTENT_SETTINGS = ['beach', 'gym', 'street', 'home', 'gaming', 'travel'];
const TIERS = ['T1', 'T2'];
const MOODS = ['warm', 'confident', 'playful', 'neutral', 'edgy'];

const SYSTEM_PROMPT = `You are the Plan Update Agent for BlondeShell — an AI influencer system.

BlondeShell is a platinum blonde, green-eyed AI fitness influencer. She posts:
- T1 (SFW): Instagram, TikTok, YouTube, Threads, LinkedIn, Twitch — 30%+ visual distance from T2
- T2 (suggestive): Twitter/X, Reddit ONLY
- T3 (adult): Fanvue ONLY — do NOT include in weekly plan (separate system)

Available settings: beach, gym, street, home, gaming, travel
Available moods: warm, confident, playful, neutral, edgy
Platform posting times (ET):
- instagram: 7pm
- tiktok: 11am, 7pm
- twitter: 9am, 12pm, 6pm, 9pm

Output ONLY valid JSON (no markdown):
{
  "week_of": "YYYY-MM-DD (next Monday)",
  "theme": "weekly theme name",
  "days": [
    {
      "day": "YYYY-MM-DD",
      "setting": "beach|gym|street|home|gaming|travel",
      "tier": "T1|T2",
      "mood": "warm|confident|playful|neutral|edgy",
      "platforms": ["instagram", "tiktok", "twitter"],
      "prompt_hint": "brief scene description for image generation",
      "posting_times": {"instagram": "7pm", "tiktok": ["11am", "7pm"], "twitter": ["9am", "12pm"]},
      "content": [{"type": "image", "count": 2}, {"type": "video", "count": 1}],
      "caption_vibe": "mood/energy for caption generation"
    }
  ]
}

Rules:
- Exactly 7 days
- T2 platforms (twitter/x, reddit) only on days with tier=T2
- Mix settings throughout the week — don't repeat same setting 3+ days in a row
- Optimize for engagement + conversion to Fanvue paid subscribers
- Use trend signals and learning recommendations to guide choices`;

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getMonthlyPlan() {
  const { data } = await supabase
    .from('monthly_plan')
    .select('*')
    .eq('status', 'active')
    .order('month', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function getPlatformPerformance() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('platform_scores')
    .select('*')
    .gte('date', since)
    .order('date', { ascending: false });
  return data ?? [];
}

async function getContentPerformance() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('content_items')
    .select('setting, tier, mood, qa_status, platforms, created_at')
    .gte('created_at', since)
    .eq('qa_status', 'approved');
  return data ?? [];
}

async function getLatestTrendsReport() {
  const { data } = await supabase
    .from('trends_reports')
    .select('briefing, recommendations, week_of')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function getLatestLearningReport() {
  const { data } = await supabase
    .from('learning_reports')
    .select('recommendations, raw_analysis, week_of')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

// ─── Week calculation ─────────────────────────────────────────────────────────

function getNextMonday() {
  const d = new Date();
  const day = d.getUTCDay(); // 0=Sun
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const next = new Date(d);
  next.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return next.toISOString().slice(0, 10);
}

function getWeekDates(mondayStr) {
  const days = [];
  const monday = new Date(mondayStr);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildUserMessage({ nextMonday, monthlyPlan, platformPerf, contentPerf, trendsReport, learningReport }) {
  const weekDates = getWeekDates(nextMonday);

  // Content breakdown
  const bySetting = {};
  for (const item of contentPerf) {
    bySetting[item.setting] = (bySetting[item.setting] ?? 0) + 1;
  }

  // Platform performance summary
  const platformSummary = {};
  for (const s of platformPerf) {
    if (!platformSummary[s.platform]) platformSummary[s.platform] = [];
    platformSummary[s.platform].push(s.engagement_rate ?? 0);
  }
  const platformAvg = {};
  for (const [p, rates] of Object.entries(platformSummary)) {
    platformAvg[p] = (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2) + '% avg engagement';
  }

  return `Generate the weekly content plan for BlondeShell.

=== NEXT WEEK DATES ===
Week of: ${nextMonday}
Days: ${weekDates.join(', ')}

=== ACTIVE MONTHLY PLAN ===
${monthlyPlan ? `Month: ${monthlyPlan.month}
Targets: ${JSON.stringify(monthlyPlan.targets)}
Themes: ${JSON.stringify(monthlyPlan.content_themes)}
Promotions: ${JSON.stringify(monthlyPlan.promotions)}` : 'No monthly plan — use Month 1 defaults (Beach/gym/street/home, T1 focus)'}

=== PLATFORM PERFORMANCE (last 14 days) ===
${Object.keys(platformAvg).length > 0 ? JSON.stringify(platformAvg) : 'No platform data yet — use defaults'}

=== CONTENT PERFORMANCE (last 14 days, approved items) ===
Total: ${contentPerf.length} items
By setting: ${JSON.stringify(bySetting)}
Note: ${contentPerf.length < 10 ? 'Low data — use defaults and diversify settings' : 'Favor high-count settings if engagement data confirms'}

=== LATEST TRENDS REPORT (${trendsReport?.week_of ?? 'none'}) ===
${trendsReport ? `Briefing: ${trendsReport.briefing}
Top recs: ${(trendsReport.recommendations ?? []).slice(0, 3).map(r => r.action).join(' | ')}` : 'No trends report — use default content plan'}

=== LATEST LEARNING REPORT (${learningReport?.week_of ?? 'none'}) ===
${learningReport ? `${(learningReport.recommendations ?? []).slice(0, 3).map(r => `- ${r.action}`).join('\n')}` : 'No learning report yet — default to beach/gym/street rotation'}

Generate 7-day plan. Ensure variety in settings, optimize for engagement and Fanvue conversion.`;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function savePlan(weekOf, planData) {
  // Convert days array to object keyed by date
  const daysObj = {};
  for (const day of planData.days) {
    daysObj[day.day] = {
      theme: planData.theme,
      batch: day.setting,
      content: day.content,
      platforms: day.platforms,
      mood: day.mood,
      tier: day.tier,
      prompt_hint: day.prompt_hint,
      posting_times: day.posting_times,
      caption_vibe: day.caption_vibe,
    };
  }

  const { error } = await supabase
    .from('weekly_plans')
    .upsert(
      {
        week_of: weekOf,
        days: daysObj,
        batch_complete: false,
        total_posts: planData.days.reduce((sum, d) => sum + (d.content?.reduce((s, c) => s + c.count, 0) ?? 0), 0),
        created_at: new Date().toISOString(),
      },
      { onConflict: 'week_of' }
    );

  if (error) throw new Error(`savePlan failed: ${error.message}`);
}

async function logToAgentLogs(status, notes) {
  const { error } = await supabase.from('agent_logs').insert({
    agent: 'plan_update_agent',
    task: 'weekly_plan_generation',
    status,
    notes,
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[plan_update_agent] agent_logs failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[plan_update_agent] Starting — ${new Date().toISOString()}`);

  try {
    const nextMonday = getNextMonday();
    console.log(`[plan_update_agent] Generating plan for week of ${nextMonday}`);

    // 1. Gather data in parallel
    const [monthlyPlan, platformPerf, contentPerf, trendsReport, learningReport] = await Promise.all([
      getMonthlyPlan(),
      getPlatformPerformance(),
      getContentPerformance(),
      getLatestTrendsReport(),
      getLatestLearningReport(),
    ]);

    console.log(`[plan_update_agent] Data: monthly_plan=${monthlyPlan?.month ?? 'none'}, platform_scores=${platformPerf.length}, content_items=${contentPerf.length}, trends=${trendsReport ? 'yes' : 'none'}, learning=${learningReport ? 'yes' : 'none'}`);

    // 2. Build context and call Claude
    const userMessage = buildUserMessage({ nextMonday, monthlyPlan, platformPerf, contentPerf, trendsReport, learningReport });
    console.log('[plan_update_agent] Calling Claude Haiku...');

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const rawText = response.content.filter(b => b.type === 'text').map(b => b.text).join('');

    // 3. Parse
    let planData;
    try {
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found');
      planData = JSON.parse(rawText.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1'));
    } catch (e) {
      throw new Error(`Failed to parse plan output: ${e.message}\n\nRaw:\n${rawText}`);
    }

    if (!planData.days || planData.days.length !== 7) {
      throw new Error(`Expected 7 days in plan, got ${planData.days?.length ?? 0}`);
    }

    // 4. Save
    await savePlan(nextMonday, planData);

    // 5. Print
    console.log('\n' + '═'.repeat(60));
    console.log(`NEXT WEEK PLAN — ${nextMonday} | Theme: ${planData.theme}`);
    console.log('═'.repeat(60));
    for (const day of planData.days) {
      const contentStr = (day.content ?? []).map(c => `${c.count}x${c.type}`).join(', ');
      console.log(`${day.day} | ${day.setting} | ${day.tier} | ${day.mood} | [${contentStr}] → ${(day.platforms ?? []).join(', ')}`);
      console.log(`  "${day.prompt_hint}"`);
    }
    console.log('═'.repeat(60));

    const summary = `Plan generated for ${nextMonday} | theme: ${planData.theme} | 7 days | total posts: ${planData.days.reduce((s, d) => s + (d.content?.reduce((a, c) => a + c.count, 0) ?? 0), 0)}`;
    await logToAgentLogs('completed', summary);
    console.log('[plan_update_agent] Done.\n');

  } catch (err) {
    console.error(`[plan_update_agent] FATAL: ${err.message}`);
    await logMistake('plan_update_agent', err);
    await logToAgentLogs('failed', err.message);
    process.exit(1);
  }
}

main();
