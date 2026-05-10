import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { nsfwClassifyLocal } from './nsfw_classifier.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';
const SIMILARITY_THRESHOLD = 0.85;
const HARD_STOP_THRESHOLD = 0.80;
const USE_LOCAL_NSFW = process.env.NSFW_CLASSIFIER !== 'claude';

// Hebrew + Hebrew presentation forms Unicode blocks
const HEBREW_REGEX = /[֐-׿יִ-ﭏ]/;

export function detectHebrewInText(text = '') {
  return HEBREW_REGEX.test(text);
}

function parseVisionJSON(text) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON found');
    return JSON.parse(text.slice(start, end + 1).replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}

export async function identityCheck(imageUrl) {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: `Score this AI-generated image for character consistency with BlondeShell:
- Platinum blonde hair (not brown, not dark, not strawberry)
- Green eyes (not blue, not brown)
- Athletic build (toned, fit)
- Fair skin with natural freckles
- Consistent female face structure

Return ONLY valid JSON (no markdown):
{"passed": true|false, "similarity": 0.0-1.0, "notes": "brief assessment", "hair": "pass|fail", "eyes": "pass|fail", "build": "pass|fail"}

Score 1.0 = perfect match. Below 0.85 = fail. Below 0.80 = hard stop.`,
          },
        ],
      }],
    });

    const text = response.content[0]?.text ?? '';
    const result = parseVisionJSON(text);
    if (!result) return { passed: false, similarity: 0, notes: 'Failed to parse identity check response' };

    result.passed = result.similarity >= SIMILARITY_THRESHOLD;
    return result;
  } catch (err) {
    console.warn(`[qa_gate] identityCheck failed: ${err.message}`);
    return { passed: false, similarity: 0, notes: `Identity check error: ${err.message}` };
  }
}

export async function nsfwClassify(imageUrl) {
  if (USE_LOCAL_NSFW) {
    try {
      return await nsfwClassifyLocal(imageUrl);
    } catch (err) {
      console.warn(`[qa_gate] local nsfw failed, falling back to Claude: ${err.message}`);
    }
  }
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: `Classify this image into one content tier:
- T1 (SFW): Fully clothed, athletic wear, swimwear at beach, casual. No suggestive posing. Safe for Instagram/TikTok.
- T2 (Suggestive): Lingerie, revealing bikini, suggestive poses, alluring but clothed. Twitter/Reddit only.
- T3 (Explicit): Nudity, intimate, very revealing. Fanvue only.

Return ONLY valid JSON (no markdown):
{"tier": "T1"|"T2"|"T3", "confidence": 0.0-1.0, "notes": "brief reason"}`,
          },
        ],
      }],
    });

    const text = response.content[0]?.text ?? '';
    const result = parseVisionJSON(text);
    if (!result) return { tier: 'T3', confidence: 0, notes: 'Failed to parse — defaulting to most restrictive tier' };
    return result;
  } catch (err) {
    console.warn(`[qa_gate] nsfwClassify failed: ${err.message}`);
    return { tier: 'T3', confidence: 0, notes: `Classification error: ${err.message} — defaulting restrictive` };
  }
}

/**
 * Israel firewall — Check 2.5 (per v3.1 §10).
 * BlondeShell is positioned as a Los Angeles native; her content must never
 * trace back to Israel/Hebrew/Jewish identity. Runs after NSFW classify and
 * before brand fit. Hard-fails on any positive trace.
 *
 * Cheap caption check first (Hebrew Unicode regex), then Claude vision pass
 * if image likely needs inspection. Fail-closed on API error.
 */
export async function israelFirewallCheck(imageUrl, caption = '') {
  if (detectHebrewInText(caption)) {
    return {
      passed: false,
      has_trace: true,
      traces: ['hebrew_in_caption'],
      notes: 'Caption contains Hebrew Unicode characters',
    };
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: `Inspect this image for ANY of the following Israel-related markers (BlondeShell is positioned as a Los Angeles native; she must never trace back to Israel):

- Hebrew letters or text in the image (Hebrew alphabet block U+0590..U+05FF)
- Israeli flag (blue/white horizontal bands with central blue Star of David)
- Star of David symbol (six-pointed hexagram) on jewelry, prints, tattoos, signage, or backgrounds
- Recognizable Israeli landmarks: Western Wall, Tel Aviv beach with white-city Bauhaus skyline, Dome of the Rock, Iron Dome interceptor trails, Jerusalem Old City walls
- Jewish religious objects: kippa/yarmulke, tallit/prayer shawl, tefillin, mezuzah, menorah, Torah scroll
- Hebrew language signage in background (street signs, posters, store fronts, license plates)

Be strict but precise. A generic five-pointed star is FINE. A surfer at any non-Israeli beach is FINE. A Los Angeles street with English signage is FINE. Only flag clear Israel/Jewish-cultural traces.

Return ONLY valid JSON (no markdown):
{"has_trace": true|false, "traces": ["specific_marker_1"], "confidence": 0.0-1.0, "notes": "what was seen, or 'clean'"}`,
          },
        ],
      }],
    });

    const text = response.content[0]?.text ?? '';
    const result = parseVisionJSON(text);
    if (!result) {
      return {
        passed: false,
        has_trace: false,
        traces: [],
        notes: 'parse_failed_fail_closed',
      };
    }

    return {
      passed: !result.has_trace,
      has_trace: !!result.has_trace,
      traces: result.traces ?? [],
      confidence: result.confidence,
      notes: result.notes ?? '',
    };
  } catch (err) {
    console.warn(`[qa_gate] israelFirewallCheck failed: ${err.message}`);
    return {
      passed: false,
      has_trace: false,
      traces: [],
      notes: `check_failed_fail_closed: ${err.message}`,
    };
  }
}

export async function brandFitCheck(imageUrl, caption = '') {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: `Evaluate if this image fits the BlondeShell brand:
- Gen Z fitness/gaming lifestyle influencer
- Athletic, confident, aspirational
- Settings: beach, gym, travel, urban, gaming setup, home
- Vibe: energetic, playful, bold, authentic
- NOT on-brand: corporate, elderly, dark/gothic, overly formal, political
${caption ? `\nCaption: "${caption}"` : ''}

Return ONLY valid JSON (no markdown):
{"passed": true|false, "notes": "brief assessment of brand fit"}`,
          },
        ],
      }],
    });

    const text = response.content[0]?.text ?? '';
    const result = parseVisionJSON(text);
    if (!result) return { passed: false, notes: 'Failed to parse brand fit response' };
    return result;
  } catch (err) {
    console.warn(`[qa_gate] brandFitCheck failed: ${err.message}`);
    return { passed: true, notes: `Brand fit check unavailable: ${err.message} — auto-approved` };
  }
}

export async function runFullQA(contentItem) {
  const { url, imageUrl, caption } = contentItem;
  const imgUrl = url ?? imageUrl;

  if (!imgUrl) {
    return { approved: false, checks: [], reason: 'No image URL provided' };
  }

  const checks = [];

  const identity = await identityCheck(imgUrl);
  checks.push({ name: 'identity', ...identity });
  if (!identity.passed) {
    const level = identity.similarity < HARD_STOP_THRESHOLD ? 'hard_stop' : 'fail';
    return {
      approved: false,
      checks,
      reason: `Identity check ${level}: similarity ${identity.similarity} — ${identity.notes}`,
    };
  }

  const nsfw = await nsfwClassify(imgUrl);
  checks.push({ name: 'nsfw', ...nsfw });
  const expectedTier = contentItem.tier ?? 'T1';
  const tierOrder = { T1: 1, T2: 2, T3: 3 };
  if (tierOrder[nsfw.tier] > tierOrder[expectedTier]) {
    return {
      approved: false,
      checks,
      reason: `NSFW classification ${nsfw.tier} exceeds expected ${expectedTier} — ${nsfw.notes}`,
    };
  }

  const israel = await israelFirewallCheck(imgUrl, caption);
  checks.push({ name: 'israelFirewall', ...israel });
  if (!israel.passed) {
    return {
      approved: false,
      checks,
      reason: `Israel firewall ${israel.has_trace ? 'trace_detected' : 'check_failed'}: ${(israel.traces ?? []).join(', ')} — ${israel.notes}`,
      owner_alert: israel.has_trace,
    };
  }

  const brand = await brandFitCheck(imgUrl, caption);
  checks.push({ name: 'brandFit', ...brand });
  if (!brand.passed) {
    return {
      approved: false,
      checks,
      reason: `Brand fit check failed — ${brand.notes}`,
    };
  }

  return {
    approved: true,
    checks,
    reason: 'All checks passed',
    classifiedTier: nsfw.tier,
  };
}
