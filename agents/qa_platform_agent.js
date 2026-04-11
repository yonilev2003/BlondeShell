/**
 * Platform QA Agent
 * Input:  { imageUrl, platform, tier }
 * Output: { approved: boolean, reason: string }
 *
 * Rules:
 *  instagram — T1: approve athletic wear + swimwear/beach. Reject nudity/nipples/explicit.
 *  tiktok    — T1: approve athletic wear + swimwear/beach. Reject nudity/nipples/explicit.
 *  twitter   — T1 + T2 OK: auto-approve
 *  fanvue    — all tiers: auto-approve
 */

import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

// Platforms that need vision inspection
const STRICT_PLATFORMS = new Set(['instagram', 'tiktok']);

const PLATFORM_RULES = {
  instagram: `Instagram T1 content moderation rules:
- APPROVE: athletic wear (sports bra, leggings, gym clothes), swimwear (bikini, one-piece), beach content, casual clothing, street style, home wear
- APPROVE: midriff exposure, skin, beach/poolside poses — these are normal lifestyle content
- REJECT ONLY: visible nipples, visible genitalia, sexual acts, explicit nudity, underwear presented sexually
- Default: APPROVE unless clearly explicit. Lifestyle and fitness content is always OK.`,

  tiktok: `TikTok T1 content moderation rules:
- APPROVE: athletic wear (sports bra, leggings), swimwear (bikini, one-piece), beach content, casual clothing
- APPROVE: midriff exposure, skin, beach/poolside poses — normal fitness and lifestyle content
- REJECT ONLY: visible nipples, visible genitalia, sexual acts, explicit nudity
- Default: APPROVE unless clearly explicit. Fitness and beach content is always OK.`,
};

/**
 * Vision-based QA for strict platforms (instagram, tiktok)
 */
async function visionCheck(imageUrl, platform) {
  const rules = PLATFORM_RULES[platform];

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: `You are a content moderator for a social media scheduling platform.

${rules}

Analyze this image and return ONLY valid JSON (no markdown):
{"approved": true|false, "reason": "one sentence explanation citing specific visual elements"}`,
          },
        ],
      }],
    });
  } catch (err) {
    // If vision call fails, fail open with a warning (don't block on API errors)
    console.warn(`[qa_platform] vision check failed for ${platform}: ${err.message}`);
    return { approved: true, reason: `Vision check unavailable — auto-approved with warning` };
  }

  const text = response.content[0]?.text ?? '';
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1) throw new Error('no JSON');
    return JSON.parse(text.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    // Fallback: parse manually from text
    const approved = !text.toLowerCase().includes('"approved": false') && !text.toLowerCase().includes('"approved":false');
    return { approved, reason: text.slice(0, 120) };
  }
}

/**
 * Main QA function — callable as a module or CLI
 * @param {string} imageUrl
 * @param {string} platform  instagram|tiktok|twitter|fanvue
 * @param {string} [tier]    T1|T2|T3
 * @returns {Promise<{approved: boolean, reason: string}>}
 */
export async function checkPlatformQA(imageUrl, platform, tier = 'T1') {
  const p = platform.toLowerCase();

  // Auto-approve for permissive platforms
  if (p === 'twitter' || p === 'x') {
    return { approved: true, reason: 'Twitter/X allows T1+T2 content' };
  }
  if (p === 'fanvue') {
    return { approved: true, reason: 'Fanvue allows all tiers' };
  }

  // Tier gate: instagram/tiktok only allow T1
  if (tier === 'T2' || tier === 'T3') {
    return { approved: false, reason: `${platform} only allows T1 content — ${tier} rejected` };
  }

  // Vision check for strict platforms
  if (STRICT_PLATFORMS.has(p)) {
    return await visionCheck(imageUrl, p);
  }

  // Unknown platform — approve with note
  return { approved: true, reason: `Unknown platform ${platform} — auto-approved` };
}

// ── CLI mode ──────────────────────────────────────────────────────────────────
if (process.argv[2]) {
  const [, , imageUrl, platform, tier] = process.argv;
  if (!imageUrl || !platform) {
    console.error('Usage: node agents/qa_platform_agent.js <imageUrl> <platform> [tier]');
    process.exit(1);
  }
  const result = await checkPlatformQA(imageUrl, platform, tier ?? 'T1');
  console.log(JSON.stringify(result, null, 2));
}
