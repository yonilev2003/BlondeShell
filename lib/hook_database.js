import { runAgent } from './agent_runner.js';
import { supabase } from './supabase.js';
import 'dotenv/config';

const MODEL = 'claude-haiku-4-5-20251001';

export async function logHook({ postId, hookText, hookType = 'unknown', platform, impressions2h = 0, engagement2h = 0, ctr = 0 }) {
  const { error } = await supabase.from('hook_performance').insert({
    post_id: postId,
    hook_text: hookText,
    hook_type: hookType,
    platform,
    impressions_2h: impressions2h,
    engagement_2h: engagement2h,
    ctr,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(`logHook failed: ${error.message}`);
}

export async function updateHookMetrics(postId, { impressions2h, engagement2h, ctr }) {
  const { error } = await supabase
    .from('hook_performance')
    .update({ impressions_2h: impressions2h, engagement_2h: engagement2h, ctr })
    .eq('post_id', postId);
  if (error) throw new Error(`updateHookMetrics failed: ${error.message}`);
}

export async function getTopHooks(platform, limit = 20) {
  const { data, error } = await supabase
    .from('hook_performance')
    .select('post_id, hook_text, hook_type, platform, impressions_2h, engagement_2h, ctr, created_at')
    .eq('platform', platform)
    .order('engagement_2h', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getTopHooks failed: ${error.message}`);
  return data ?? [];
}

export async function getTopHooksByType(platform) {
  const { data, error } = await supabase
    .from('hook_performance')
    .select('hook_type, engagement_2h, impressions_2h, ctr')
    .eq('platform', platform)
    .order('engagement_2h', { ascending: false });

  if (error) throw new Error(`getTopHooksByType failed: ${error.message}`);

  const byType = {};
  for (const row of (data ?? [])) {
    if (!byType[row.hook_type]) byType[row.hook_type] = { count: 0, totalEngagement: 0, totalImpressions: 0 };
    byType[row.hook_type].count++;
    byType[row.hook_type].totalEngagement += Number(row.engagement_2h);
    byType[row.hook_type].totalImpressions += Number(row.impressions_2h);
  }

  return Object.entries(byType).map(([type, stats]) => ({
    hook_type: type,
    avg_engagement: stats.count > 0 ? Math.round(stats.totalEngagement / stats.count) : 0,
    avg_impressions: stats.count > 0 ? Math.round(stats.totalImpressions / stats.count) : 0,
    sample_count: stats.count,
  })).sort((a, b) => b.avg_engagement - a.avg_engagement);
}

export async function generateHookVariations(baseHook, platform, count = 5) {
  const topHooks = await getTopHooks(platform, 10);
  const examples = topHooks.map(h => `- [${h.hook_type}] ${h.hook_text} (eng: ${h.engagement_2h})`).join('\n');

  const system = `You are a viral hook specialist for BlondeShell, a Gen Z AI influencer in LA.
Generate ${count} variations of the given hook, each using a different strategy.
Hook strategies: curiosity_gap, pov_identity, direct_cta, vulnerability, humor, trend_hijack.
Under 100 characters each. Lowercase. No emojis unless they add punch.
Top performing hooks for context:\n${examples || '(none yet)'}
Return ONLY valid JSON: { "variations": [{ "text": "...", "type": "hook_type" }] }`;

  const raw = await runAgent({
    systemPrompt: system,
    userMessage: `Base hook: ${baseHook}\nPlatform: ${platform}`,
    model: MODEL,
    maxTokens: 512,
  });

  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(cleaned);
    return (parsed.variations ?? []).slice(0, count);
  } catch (e) {
    throw new Error(`generateHookVariations: parse error: ${e.message}`);
  }
}
