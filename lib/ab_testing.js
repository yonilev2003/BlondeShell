import { runAgent } from './agent_runner.js';
import { schedulePost, getPlatformIds } from './publer.js';
import { logAgentAction, supabase } from './supabase.js';
import { withRetry } from './retry.js';
import 'dotenv/config';

const MODEL = 'claude-haiku-4-5-20251001';

const VARIATION_PROMPT = `You are a social media hook specialist for BlondeShell — a Gen Z AI influencer in LA.
Generate exactly {count} caption variations for the given base caption.
Each variation must use a different hook strategy: curiosity gap, identity ("POV"), call-to-action, vulnerability, humor.
Keep each under 220 characters (TikTok limit) plus hashtags.
Persona: 21F, platinum blonde, Valorant gamer, pilates, LA life. Voice: casual, lowercase, chronically online.
Return ONLY valid JSON array of strings: ["caption1", "caption2", ...]`;

export async function generateVariations(baseCaption, platform, count = 5) {
  const prompt = VARIATION_PROMPT.replace('{count}', count);
  const userMsg = `Platform: ${platform}\nBase caption:\n${baseCaption}\n\nGenerate ${count} variations.`;

  const raw = await runAgent({ systemPrompt: prompt, userMessage: userMsg, model: MODEL, maxTokens: 1024 });

  let variations;
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    variations = JSON.parse(cleaned);
    if (!Array.isArray(variations)) throw new Error('not an array');
  } catch (e) {
    throw new Error(`generateVariations: failed to parse JSON: ${e.message}\nRaw: ${raw.slice(0, 300)}`);
  }

  return variations.slice(0, count);
}

// Schedule variations staggered intervalMinutes apart, returns array of { jobId, caption, scheduledAt }
export async function scheduleStaggered(mediaId, variations, platform, accountId, networkKey, startTime, intervalMinutes = 30, mediaType = 'photo') {
  const results = [];
  const start = new Date(startTime);

  for (let i = 0; i < variations.length; i++) {
    const scheduledAt = new Date(start.getTime() + i * intervalMinutes * 60 * 1000).toISOString();
    try {
      const jobId = await withRetry(() => schedulePost({
        accountId,
        networkKey,
        caption: variations[i],
        scheduledAt,
        mediaId,
        mediaType,
      }), 3);

      results.push({ index: i, caption: variations[i], scheduledAt, jobId, ok: true });
      console.log(`[ab_testing] variation ${i + 1}/${variations.length} scheduled: job ${jobId}`);
    } catch (err) {
      results.push({ index: i, caption: variations[i], scheduledAt, error: err.message, ok: false });
      console.error(`[ab_testing] variation ${i + 1} failed: ${err.message}`);
    }
  }

  return results;
}

// Save an A/B test group to Supabase
export async function saveTestGroup(contentItemId, platform, variations, scheduledResults) {
  const variationsData = variations.map((caption, i) => ({
    index: i,
    caption,
    jobId: scheduledResults[i]?.jobId ?? null,
    scheduledAt: scheduledResults[i]?.scheduledAt ?? null,
    ok: scheduledResults[i]?.ok ?? false,
  }));

  const { data, error } = await supabase.from('ab_test_groups').insert({
    content_item_id: contentItemId,
    platform,
    variations: variationsData,
    status: 'running',
    created_at: new Date().toISOString(),
  }).select('id').single();

  if (error) throw new Error(`saveTestGroup failed: ${error.message}`);
  return data.id;
}

// Pick winner: query hook_performance for highest engagement in window
export async function pickWinner(testGroupId, metricWindowHours = 2) {
  const { data: group, error: ge } = await supabase
    .from('ab_test_groups')
    .select('*')
    .eq('id', testGroupId)
    .single();
  if (ge) throw new Error(`pickWinner: ${ge.message}`);

  const since = new Date(Date.now() - metricWindowHours * 60 * 60 * 1000).toISOString();
  const jobIds = (group.variations ?? []).map(v => v.jobId).filter(Boolean);

  if (!jobIds.length) return null;

  const { data: perf } = await supabase
    .from('hook_performance')
    .select('post_id, engagement_2h, impressions_2h, ctr')
    .in('post_id', jobIds)
    .gte('created_at', since)
    .order('engagement_2h', { ascending: false })
    .limit(1);

  if (!perf?.length) return null;

  const winner = perf[0];
  await supabase.from('ab_test_groups').update({ winner_id: winner.post_id, status: 'complete' }).eq('id', testGroupId);

  await logAgentAction('ab_testing', 'winner_picked', 'completed',
    `Test ${testGroupId}: winner ${winner.post_id} — ${winner.engagement_2h} engagement`);

  return winner;
}

// Run a full A/B test: generate variations → schedule staggered → save group → return groupId
export async function runABTest({ contentItemId, baseCaption, mediaId, platform, startTime, count = 5, intervalMinutes = 30 }) {
  console.log(`[ab_testing] starting A/B test: ${count} variations on ${platform}`);

  const accounts = await getPlatformIds();
  const accountInfo = platform === 'instagram' ? accounts.instagram : accounts.tiktok;
  if (!accountInfo) throw new Error(`No account found for platform: ${platform}`);

  const variations = await generateVariations(baseCaption, platform, count);
  console.log(`[ab_testing] generated ${variations.length} variations`);

  const scheduled = await scheduleStaggered(
    mediaId, variations, platform,
    accountInfo.id, accountInfo.networkKey ?? platform,
    startTime, intervalMinutes
  );

  const groupId = await saveTestGroup(contentItemId, platform, variations, scheduled);
  console.log(`[ab_testing] test group saved: ${groupId}`);

  await logAgentAction('ab_testing', 'test_started', 'completed',
    `${variations.length} variations scheduled for ${platform}, group ${groupId}`);

  return { groupId, variations, scheduled };
}
