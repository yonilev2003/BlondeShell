/**
 * scripts/qa_batch_check.js — Pre-publish QA via Anthropic Batch API
 *
 * Fetches all scheduled_posts with qa_status IS NULL for the upcoming window,
 * builds one batch request per post, submits to Anthropic Messages Batches API,
 * polls until complete, then applies pass/fail + reroute logic per platform.
 *
 * Cost: ~50% vs sequential — Batch API is billed at 50% of standard token rates.
 *
 * Usage:
 *   node scripts/qa_batch_check.js           # checks next 24h of posts
 *   node scripts/qa_batch_check.js --hours=48
 *   npm run qa:batch
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODEL     = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;
const FANVUE_LINK = 'fanvue.com/blondeshell';

// ─── CLI args ─────────────────────────────────────────────────────────────────

const hours = parseInt(process.argv.find(a => a.startsWith('--hours='))?.split('=')[1] ?? '24');

// ─── Platform QA prompt builders ──────────────────────────────────────────────

function buildTikTokPrompt(post) {
  return `You are a TikTok content QA checker for an AI influencer account (BlondeShell).

Post details:
- content_id: ${post.content_id}
- content_url: ${post.content_url ?? 'unknown'}
- caption: ${JSON.stringify(post.caption_style)}
- tier: ${post.tier ?? 'T1'}

Rules:
1. TIER: T1 only. T2/T3 = fail with check_failed="wrong_tier"
2. NUDITY: reject visible nipples, genitalia, sexual acts. Approve athletic wear, bikini, beach, gym.
3. WATERMARK: reject if any competing platform watermark visible (Instagram, YouTube logos).
4. C2PA: pass only if content_url contains "/signed/" path.
5. HASHTAGS: count "#" in caption. >5 = fail with check_failed="too_many_hashtags" (auto-fixable: truncate to 5).
6. EXPLICIT_TERMS: reject if caption contains: sexy, hot body, naked, nude, nsfw, 18+, xxx, adult.
7. DUPLICATE: assume no duplicate (duplicate check is done separately in SQL).

Respond ONLY with valid JSON, no markdown:
{
  "passed": true|false,
  "check_failed": null|"wrong_tier"|"nudity"|"watermark"|"c2pa_missing"|"too_many_hashtags"|"explicit_terms",
  "auto_fixable": true|false,
  "fix_note": null|"truncated hashtags to 5"|"stripped explicit term",
  "reroute_to": null|"twitter",
  "upgrade_tier": null|"T2"
}`;
}

function buildInstagramPrompt(post) {
  return `You are an Instagram content QA checker for an AI influencer account (BlondeShell).

Post details:
- content_id: ${post.content_id}
- content_url: ${post.content_url ?? 'unknown'}
- caption: ${JSON.stringify(post.caption_style)}
- post_type: ${post.post_type}
- tier: ${post.tier ?? 'T1'}

Rules:
1. TIER: T1 only. T2/T3 = fail with check_failed="wrong_tier"
2. NUDITY: reject visible nipples, genitalia, sexual acts. Approve athletic wear, bikini, beach, gym.
3. TIKTOK_WATERMARK: HARD FAIL if TikTok logo/UI overlay visible anywhere in image. -30% reach penalty.
4. C2PA: pass only if content_url contains "/signed/" path.
5. ASPECT_RATIO: reel/story must be 9:16; photo must be 1:1 or 4:5. Flag mismatch.
6. TEXT_OVERLAY (reels only): warn if no visible text in first frame (50% watch muted). Non-blocking.
7. DUPLICATE: assume no duplicate (checked in SQL separately).

Respond ONLY with valid JSON, no markdown:
{
  "passed": true|false,
  "check_failed": null|"wrong_tier"|"nudity"|"tiktok_watermark"|"c2pa_missing"|"wrong_aspect_ratio",
  "warn": null|"reels_no_text_overlay",
  "auto_fixable": false,
  "reroute_to": null|"twitter",
  "upgrade_tier": null|"T2"
}`;
}

function buildTwitterPrompt(post) {
  return `You are a Twitter/X content QA checker for an AI influencer account (BlondeShell).

Post details:
- content_id: ${post.content_id}
- caption: ${JSON.stringify(post.caption_style)}
- tier: ${post.tier ?? 'T1'}

Rules:
1. TIERS T1+T2+T3 all allowed. No tier upgrade needed.
2. SENSITIVE_FLAG: T2/T3 requires sensitive content flag enabled on account. Assume enabled unless noted.
3. FANVUE_LINK: T2/T3 captions MUST contain "fanvue.com". If missing, auto-fix by appending "🔗 ${FANVUE_LINK}".
4. DUPLICATE: assume no duplicate (checked in SQL separately).

Respond ONLY with valid JSON, no markdown:
{
  "passed": true|false,
  "check_failed": null|"sensitive_flag_disabled",
  "auto_fixed": null|"fanvue_link_appended",
  "updated_caption": null|"[caption with fanvue link appended]"
}`;
}

function buildFanvuePrompt(post) {
  return `You are a Fanvue content QA checker for an AI influencer account (BlondeShell).

Post details:
- content_id: ${post.content_id}
- content_url: ${post.content_url ?? 'unknown'}
- tier: ${post.tier ?? 'T1'}
- is_free: ${post.is_free ?? true}
- price_usd: ${post.price_usd ?? null}
- media_uuids_present: ${post.media_uuids_present ?? false}
- has_upgrade_of: ${post.has_upgrade_of ?? false}

Rules:
1. AGE: If content_url is available, check if person could appear under 21. HARD STOP if ambiguous.
2. PPV_PRICE: if is_free=false, price_usd must be between 3.00 and 500.00.
3. MEDIA_UUIDS: if is_free=false, media_uuids_present must be true.
4. UPGRADE_OF: T2/T3 should have has_upgrade_of=true. WARN (non-blocking) if false.
5. DUPLICATE: assume no duplicate (checked in SQL separately).

Respond ONLY with valid JSON, no markdown:
{
  "passed": true|false,
  "hard_stop": false,
  "check_failed": null|"age_ambiguous"|"ppv_price_out_of_range"|"media_uuids_missing",
  "warn": null|"upgrade_of_missing"
}`;
}

const PROMPT_BUILDERS = {
  instagram: buildInstagramPrompt,
  tiktok:    buildTikTokPrompt,
  twitter:   buildTwitterPrompt,
  fanvue:    buildFanvuePrompt,
};

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchPendingPosts(windowHours) {
  const until = new Date(Date.now() + windowHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select(`
      post_id, platform, post_type, scheduled_at, content_id,
      caption_style, ab_test_variable, tier_upgraded, rerouted_to,
      content_items ( url, type, tier )
    `)
    .is('qa_status', null)
    .lte('scheduled_at', until)
    .order('scheduled_at', { ascending: true });

  if (error) throw new Error(`fetchPendingPosts: ${error.message}`);
  return (data ?? []).map(p => ({
    ...p,
    content_url:          p.content_items?.url ?? null,
    tier:                 p.content_items?.tier ?? 'T1',
    media_uuids_present:  false, // populated by Fanvue upload flow
    is_free:              true,
    has_upgrade_of:       false,
  }));
}

async function checkDuplicate(post) {
  const window = post.platform === 'twitter' ? '48 hours' : '7 days';
  const { count } = await supabase
    .from('scheduled_posts')
    .select('post_id', { count: 'exact', head: true })
    .eq('platform', post.platform)
    .eq('content_id', post.content_id)
    .gte('scheduled_at', new Date(Date.now() - (post.platform === 'twitter' ? 48 : 168) * 3600000).toISOString())
    .eq('qa_status', 'passed')
    .neq('post_id', post.post_id);

  return (count ?? 0) > 0;
}

async function applyQAResult(post, result) {
  // Duplicate check (SQL-based, not batch)
  const isDuplicate = await checkDuplicate(post);
  if (isDuplicate) {
    await supabase.from('scheduled_posts')
      .update({ qa_status: 'skipped_duplicate' })
      .eq('post_id', post.post_id);
    await supabase.from('qa_decisions').insert({
      post_id: post.post_id, platform: post.platform,
      check_failed: 'duplicate', original_tier: post.tier,
    });
    return 'skipped_duplicate';
  }

  // Hard stop (Fanvue age)
  if (result.hard_stop) {
    await supabase.from('scheduled_posts')
      .update({ qa_status: 'hard_stop' })
      .eq('post_id', post.post_id);
    await supabase.from('qa_decisions').insert({
      post_id: post.post_id, platform: post.platform,
      check_failed: 'AGE_AMBIGUOUS_HARD_STOP', original_tier: post.tier,
    });
    console.error(`  🔴 HARD STOP: post ${post.post_id} — age ambiguous`);
    return 'hard_stop';
  }

  if (!result.passed) {
    const updates = { qa_status: 'failed' };
    if (result.reroute_to) {
      updates.tier_upgraded = true;
      updates.rerouted_to   = result.reroute_to;
    }
    await supabase.from('scheduled_posts').update(updates).eq('post_id', post.post_id);
    await supabase.from('qa_decisions').insert({
      post_id:       post.post_id,
      platform:      post.platform,
      check_failed:  result.check_failed ?? 'unknown',
      original_tier: post.tier,
      upgraded_tier: result.upgrade_tier ?? null,
      rerouted_to:   result.reroute_to ?? null,
    });

    // Insert rerouted post into Twitter queue
    if (result.reroute_to === 'twitter') {
      const twitterAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30min from now
      await supabase.from('scheduled_posts').insert({
        platform: 'twitter', post_type: 'status',
        scheduled_at: twitterAt, content_id: post.content_id,
        caption_style: post.caption_style, ab_test_variable: post.ab_test_variable,
      });
    }
    return 'failed';
  }

  // Apply auto-fixes (Twitter Fanvue link, TikTok hashtag truncation)
  const qaUpdate = { qa_status: 'passed' };
  if (result.updated_caption) qaUpdate.caption_style = result.updated_caption;
  await supabase.from('scheduled_posts').update(qaUpdate).eq('post_id', post.post_id);

  if (result.warn) {
    await supabase.from('qa_decisions').insert({
      post_id: post.post_id, platform: post.platform,
      check_failed: result.warn, original_tier: post.tier,
    });
  }
  return 'passed';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== QA BATCH CHECK — next ${hours}h ===\n`);

  // 1. Fetch pending posts
  const posts = await fetchPendingPosts(hours);
  console.log(`Posts to check: ${posts.length}`);
  if (!posts.length) { console.log('Nothing pending. Done.'); return; }

  // 2. Build batch requests
  const batchRequests = posts.map(post => {
    const builder = PROMPT_BUILDERS[post.platform] ?? PROMPT_BUILDERS.twitter;
    return {
      custom_id: post.post_id,
      params: {
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: builder(post) }],
      },
    };
  });

  // 3. Submit batch
  console.log(`\nSubmitting batch of ${batchRequests.length} requests...`);
  const batch = await anthropic.messages.batches.create({ requests: batchRequests });
  console.log(`Batch ID: ${batch.id} | Status: ${batch.processing_status}`);

  // 4. Poll until ended
  let batchResult = batch;
  while (batchResult.processing_status === 'in_progress') {
    await new Promise(r => setTimeout(r, 5000));
    batchResult = await anthropic.messages.batches.retrieve(batch.id);
    process.stdout.write(`\r  processing... (${batchResult.request_counts?.processing ?? '?'} remaining)   `);
  }
  console.log(`\nBatch complete — status: ${batchResult.processing_status}`);

  // 5. Process results
  const stats = { passed: 0, failed: 0, hard_stop: 0, skipped_duplicate: 0, error: 0 };
  const postMap = Object.fromEntries(posts.map(p => [p.post_id, p]));

  for await (const item of await anthropic.messages.batches.results(batch.id)) {
    const post = postMap[item.custom_id];
    if (!post) continue;

    if (item.result.type === 'errored') {
      console.error(`  ✗ ${item.custom_id}: API error — ${item.result.error?.message}`);
      stats.error++;
      continue;
    }

    const text = item.result.message.content[0]?.text ?? '{}';
    let parsed;
    try {
      const start = text.indexOf('{');
      const end   = text.lastIndexOf('}');
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      console.warn(`  ✗ ${item.custom_id}: JSON parse failed — ${text.slice(0, 80)}`);
      stats.error++;
      continue;
    }

    const outcome = await applyQAResult(post, parsed);
    stats[outcome] = (stats[outcome] ?? 0) + 1;

    const icon = outcome === 'passed' ? '✓' : outcome === 'hard_stop' ? '🔴' : '✗';
    console.log(`  ${icon} ${post.platform.padEnd(10)} ${post.post_id.slice(0,8)} → ${outcome}${parsed.check_failed ? ` (${parsed.check_failed})` : ''}`);
  }

  // 6. Report
  console.log('\n=== QA REPORT ===');
  console.log(`  Total checked  : ${posts.length}`);
  console.log(`  Passed         : ${stats.passed}`);
  console.log(`  Failed         : ${stats.failed}`);
  console.log(`  Hard stops     : ${stats.hard_stop}`);
  console.log(`  Skipped (dup)  : ${stats.skipped_duplicate}`);
  console.log(`  Errors         : ${stats.error}`);
  console.log(`  Pass rate      : ${Math.round((stats.passed / posts.length) * 100)}%`);
  console.log(`\n  Batch ID for audit: ${batch.id}`);
  console.log('=== DONE ===');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
