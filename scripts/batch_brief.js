/**
 * scripts/batch_brief.js — End-of-day batch summary generator
 *
 * Called by Learning Agent at end of each content cycle.
 * Queries post_analytics and outputs a structured brief.
 *
 * Usage:
 *   node scripts/batch_brief.js [--date 2026-04-15]
 *   Returns JSON to stdout — pipe to agent_alerts or print to digest.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const dateArgIdx = process.argv.indexOf('--date');
const TARGET_DATE = dateArgIdx !== -1
  ? process.argv[dateArgIdx + 1]
  : new Date().toISOString().slice(0, 10);

const DAY_START = `${TARGET_DATE}T00:00:00Z`;
const DAY_END   = `${TARGET_DATE}T23:59:59Z`;

async function main() {
  // 1. Posts published today
  const { data: posts, error: postsErr } = await supabase
    .from('post_analytics')
    .select('post_id, platform, impressions, likes, comments, hook_type, caption_style, sound_used, winning_variable, confidence_level, posted_at')
    .gte('posted_at', DAY_START)
    .lte('posted_at', DAY_END);

  if (postsErr) throw new Error(`post_analytics fetch failed: ${postsErr.message}`);

  const postsPublished = posts?.length ?? 0;

  // 2. Top performer
  let topPerformer = null;
  if (posts && posts.length > 0) {
    const top = posts.reduce((best, p) => (p.impressions ?? 0) > (best.impressions ?? 0) ? p : best, posts[0]);
    topPerformer = {
      platform:         top.platform,
      impressions:      top.impressions ?? 0,
      winning_variable: top.winning_variable ?? null,
    };
  }

  // 3. A/B winner — find caption_style or visual_hook with highest avg impressions today
  let abWinner = 'insufficient_data';
  if (posts && posts.length >= 2) {
    const byStyle = {};
    for (const p of posts) {
      const key = p.caption_style ?? 'default';
      if (!byStyle[key]) byStyle[key] = { total: 0, count: 0 };
      byStyle[key].total += p.impressions ?? 0;
      byStyle[key].count += 1;
    }
    const ranked = Object.entries(byStyle)
      .map(([style, v]) => ({ style, avg: v.total / v.count }))
      .sort((a, b) => b.avg - a.avg);
    if (ranked.length > 0 && ranked[0].avg > 0) {
      abWinner = `${ranked[0].style} (avg ${Math.round(ranked[0].avg).toLocaleString()} impressions)`;
    }
  }

  // 4. Recommended adjustments from Learning Agent rules
  const { data: rules } = await supabase
    .from('skill_rules')
    .select('rule_id, new_rule, confidence')
    .eq('status', 'active')
    .gte('created_at', DAY_START)
    .order('created_at', { ascending: false })
    .limit(5);

  const recommendedAdjustments = (rules ?? []).map(r => `[${r.rule_id}] ${r.new_rule}`);
  if (recommendedAdjustments.length === 0) {
    recommendedAdjustments.push('No new rules today — monitor Cycle 1 data');
  }

  // 5. Overall confidence level for the day
  const highCount = (posts ?? []).filter(p => p.confidence_level === 'HIGH').length;
  const medCount  = (posts ?? []).filter(p => p.confidence_level === 'MEDIUM').length;
  const totalWithConf = highCount + medCount + (posts ?? []).filter(p => p.confidence_level === 'LOW').length;
  let confidenceLevel = 'low';
  if (totalWithConf > 0) {
    const highRatio = highCount / totalWithConf;
    if (highRatio >= 0.6) confidenceLevel = 'high';
    else if (highRatio >= 0.3) confidenceLevel = 'medium';
  }

  // 6. Build and emit brief
  const brief = {
    date:                   TARGET_DATE,
    posts_published:        postsPublished,
    top_performer:          topPerformer,
    a_b_winner:             abWinner,
    recommended_adjustments: recommendedAdjustments,
    confidence_level:       confidenceLevel,
  };

  console.log(JSON.stringify(brief, null, 2));

  // 7. Insert into agent_alerts for pickup by COO agent
  const { error: alertErr } = await supabase.from('agent_alerts').insert({
    agent_target: 'coo_agent',
    alert_type:   'batch_brief',
    priority:     'normal',
    payload:      brief,
  }).select().maybeSingle();

  // agent_alerts table may not exist yet — soft-fail
  if (alertErr && !alertErr.message.includes('does not exist')) {
    console.error('agent_alerts insert warning:', alertErr.message);
  }
}

main().catch(err => {
  console.error('batch_brief fatal:', err.message);
  process.exit(1);
});
