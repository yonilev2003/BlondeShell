/**
 * Strategy Agent — runs monthly (1st of month, 7am ET)
 * Reads performance data, generates next month's plan, updates Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import { runAgent, logMistake } from '../lib/agent_runner.js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `You are the Strategy Agent for BlondeShell — an AI influencer automation system.

BlondeShell is a platinum blonde, green-eyed AI influencer monetized via Fanvue (T3 content, 20% fee),
Twitter/X and Reddit (T2 suggestive), and TikTok/Instagram/YouTube (T1 SFW). Revenue comes from
subscriptions and PPV sales via Substy. Month 1 target: 300 subs / $1,000 DM PPV / 5M impressions.

Your job each month:
1. Analyze performance vs targets (revenue, subscribers, PPV sales, follower growth)
2. Identify top-performing content settings and tiers
3. Generate a concrete monthly plan for next month with specific targets and content themes
4. Flag if annual plan trajectory needs adjustment

Output ONLY valid JSON in this exact structure:
{
  "analysis": {
    "summary": "2-3 sentence performance summary",
    "wins": ["win 1", "win 2"],
    "gaps": ["gap 1", "gap 2"],
    "top_content": "best performing content setting/tier"
  },
  "monthly_plan": {
    "month": "YYYY-MM",
    "targets": {
      "new_subscribers": number,
      "revenue_usd": number,
      "ppv_sales": number,
      "follower_growth": number
    },
    "content_themes": ["Week 1: theme", "Week 2: theme", "Week 3: theme", "Week 4: theme"],
    "promotions": {
      "ppv_focus": "description",
      "platform_push": "platform to prioritize",
      "special_campaigns": ["campaign 1"]
    }
  },
  "annual_plan_update_needed": boolean,
  "annual_plan_note": "reason if update needed, else null",
  "report": "Full executive summary paragraph for owner review"
}`;

// ─── Data gathering ──────────────────────────────────────────────────────────

async function getAnnualPlan() {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('annual_plan')
    .select('*')
    .eq('year', year)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function getLastThreeMonthlyPlans() {
  const { data } = await supabase
    .from('monthly_plan')
    .select('*')
    .order('month', { ascending: false })
    .limit(3);
  return data ?? [];
}

async function getContentPerformance() {
  // Last 90 days of approved content, grouped by setting and tier
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('content_items')
    .select('setting, tier, qa_status, created_at')
    .gte('created_at', since)
    .eq('qa_status', 'approved');
  return data ?? [];
}

async function getAgentRunHistory() {
  const { data } = await supabase
    .from('agent_logs')
    .select('agent, created_at, status')
    .order('created_at', { ascending: false })
    .limit(10);
  return data ?? [];
}

// ─── Context builder ─────────────────────────────────────────────────────────

function buildUserMessage({ annualPlan, monthlyPlans, contentItems, agentHistory }) {
  const today = new Date().toISOString().slice(0, 10);

  // Next month calculation
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = nextMonth.toISOString().slice(0, 7);

  // Content breakdown by setting
  const settingCounts = {};
  for (const item of contentItems) {
    settingCounts[item.setting] = (settingCounts[item.setting] ?? 0) + 1;
  }

  const currentPlan = monthlyPlans[0] ?? null;

  return `Today: ${today}
Next month to plan: ${nextMonthStr}

=== ANNUAL PLAN ===
${annualPlan ? JSON.stringify(annualPlan, null, 2) : 'No annual plan found — operating on defaults.'}

=== LAST 3 MONTHLY PLANS ===
${monthlyPlans.length ? JSON.stringify(monthlyPlans, null, 2) : 'No monthly plans found yet.'}

=== CONTENT PERFORMANCE (last 90 days, approved items only) ===
Total approved: ${contentItems.length}
By setting: ${JSON.stringify(settingCounts)}

=== CURRENT MONTH TARGETS (${currentPlan?.month ?? 'none'}) ===
${currentPlan ? JSON.stringify(currentPlan.targets, null, 2) : 'No current plan.'}

=== AGENT HEALTH ===
Recent runs: ${agentHistory.length} logged
${agentHistory.slice(0, 3).map(r => `  ${r.agent} — ${r.created_at?.slice(0, 10)} — ${r.status}`).join('\n') || '  (none)'}

Generate the monthly plan for ${nextMonthStr} based on this data.
If no historical data exists, use Month 1 targets as baseline and be optimistic but realistic.`;
}

// ─── Plan persistence ─────────────────────────────────────────────────────────

async function upsertMonthlyPlan(plan) {
  const { error } = await supabase
    .from('monthly_plan')
    .upsert(
      {
        month: plan.month,
        targets: plan.targets,
        content_themes: plan.content_themes,
        promotions: plan.promotions,
        status: 'active',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'month' }
    );
  if (error) throw new Error(`upsertMonthlyPlan failed: ${error.message}`);
}

async function logReport(status, report) {
  const { error } = await supabase.from('agent_logs').insert({
    agent: 'strategy_agent',
    task: 'monthly_planning',
    status,
    notes: typeof report === 'string' ? report : JSON.stringify(report),
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[strategy_agent] logReport failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[strategy_agent] Starting — ${new Date().toISOString()}`);

  try {
    // 1. Gather context in parallel
    const [annualPlan, monthlyPlans, contentItems, agentHistory] = await Promise.all([
      getAnnualPlan(),
      getLastThreeMonthlyPlans(),
      getContentPerformance(),
      getAgentRunHistory(),
    ]);

    console.log('[strategy_agent] Context gathered:');
    console.log(`  annual_plan: ${annualPlan ? 'found' : 'none'}`);
    console.log(`  monthly_plans: ${monthlyPlans.length}`);
    console.log(`  approved content items (90d): ${contentItems.length}`);

    // 2. Build user message
    const userMessage = buildUserMessage({ annualPlan, monthlyPlans, contentItems, agentHistory });

    // 3. Call Claude haiku
    console.log('[strategy_agent] Calling Claude haiku...');
    const rawOutput = await runAgent({ systemPrompt: SYSTEM_PROMPT, userMessage, model: MODEL, maxTokens: 2048 });

    // 4. Parse JSON output
    let parsed;
    try {
      // Strip markdown code fences if present
      const jsonText = rawOutput
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .replace(/,(\s*[}\]])/g, '$1')
        .trim();
      parsed = JSON.parse(jsonText);
    } catch (e) {
      throw new Error(`Failed to parse Claude output as JSON: ${e.message}\n\nRaw output:\n${rawOutput}`);
    }

    console.log('\n[strategy_agent] Analysis:');
    console.log(`  Summary: ${parsed.analysis.summary}`);
    console.log(`  Wins: ${parsed.analysis.wins.join(', ')}`);
    console.log(`  Gaps: ${parsed.analysis.gaps.join(', ')}`);

    // 5. Upsert monthly plan
    await upsertMonthlyPlan(parsed.monthly_plan);
    console.log(`\n[strategy_agent] Monthly plan upserted for ${parsed.monthly_plan.month}`);
    console.log(`  Targets: ${JSON.stringify(parsed.monthly_plan.targets)}`);

    // 6. Annual plan update note
    if (parsed.annual_plan_update_needed) {
      console.log(`\n🟡 ANNUAL PLAN UPDATE NEEDED: ${parsed.annual_plan_note}`);
    }

    // 7. Log report
    await logReport('completed', parsed.report);

    console.log('\n[strategy_agent] Report:');
    console.log(parsed.report);
    console.log('\n[strategy_agent] Done.\n');

  } catch (err) {
    console.error(`[strategy_agent] FATAL: ${err.message}`);
    await logMistake('strategy_agent', err);
    await logReport('failed', err.message);
    process.exit(1);
  }
}

main();
