import Anthropic from '@anthropic-ai/sdk';
import { supabase } from './supabase.js';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-haiku-4-5-20251001';

const BASE_APPEARANCE = 'platinum blonde hair, green eyes, athletic build, fair skin, toned physique';

const ANTI_AI_MODIFIERS = 'real human skin texture with visible pores, natural freckles, fine baby hairs catching light, moist eye reflections, asymmetric natural features';

const NEGATIVE_PROMPT = 'watermark, text, signature, ai-label, generated-tag, letters, numbers, blurry, low quality, distorted, anime, illustration, cartoon, stylized, CGI, 3D render, digital art, painting, plastic skin, doll-like, synthetic, smoothed skin, filter, airbrush, photoshop, overly glossy, unrealistic perfection, too symmetrical, dead eyes, fake smile, artificial glow, heavy makeup, Instagram filter, smooth poreless skin, painted, drawn';

const TIER_GUIDELINES = {
  T1: 'Safe for YouTube, Instagram, TikTok. Fully clothed or tasteful athletic/swimwear. No nudity, no suggestive posing.',
  T2: 'Twitter/Reddit suitable. Suggestive but not explicit. Lingerie, bikini, revealing but covered. Confident alluring energy.',
  T3: 'Fanvue only. Artistic intimate context. Artistic full-body, bold styling, premium exclusive feel.',
};

async function fetchTopPerformingContent(limit = 10) {
  const { data, error } = await supabase
    .from('post_analytics')
    .select('setting, mood, tier, engagement_rate, impressions, prompt')
    .order('engagement_rate', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn(`[inspiration_engine] Failed to fetch analytics: ${error.message}`);
    return [];
  }
  return data ?? [];
}

async function fetchTrends() {
  const { data, error } = await supabase
    .from('trends')
    .select('category, description, relevance_score')
    .order('relevance_score', { ascending: false })
    .limit(5);

  if (error) {
    console.warn(`[inspiration_engine] Failed to fetch trends: ${error.message}`);
    return [];
  }
  return data ?? [];
}

export async function generateCreativeBrief(arcContext, analytics = null) {
  const topContent = analytics ?? await fetchTopPerformingContent();
  const trends = await fetchTrends();

  const topContentSummary = topContent.length
    ? topContent.map(c => `- ${c.setting}/${c.mood} (engagement: ${c.engagement_rate})`).join('\n')
    : '- No historical data yet. Default to varied beach/gym/street/travel settings.';

  const trendsSummary = trends.length
    ? trends.map(t => `- ${t.category}: ${t.description}`).join('\n')
    : '- No trends data. Focus on evergreen fitness/lifestyle content.';

  const prompt = `You are a creative director for BlondeShell, an AI-generated fitness/lifestyle influencer.

Character: ${BASE_APPEARANCE}
Brand: Gen Z fitness-gaming lifestyle, confident, aspirational, authentic feel.

Current brand arc context:
${arcContext ?? 'Standard content week. Mix of fitness, lifestyle, and travel themes.'}

Top-performing past content:
${topContentSummary}

Current trends:
${trendsSummary}

Generate a creative brief for today's content batch. Return ONLY valid JSON (no markdown):
{
  "poses": ["pose description 1", "pose description 2", "pose description 3"],
  "outfits": ["outfit description 1", "outfit description 2", "outfit description 3"],
  "settings": ["setting/location 1", "setting/location 2", "setting/location 3"],
  "colorPalettes": ["palette description 1", "palette description 2"],
  "moods": ["mood/vibe 1", "mood/vibe 2", "mood/vibe 3"],
  "cameraAngles": ["angle 1", "angle 2", "angle 3"]
}

Requirements:
- 3 poses, 3 outfits, 3 settings, 2 color palettes, 3 moods, 3 camera angles
- Reflect what performs well based on analytics
- Incorporate relevant trends naturally
- Keep it fresh — avoid repeating the exact same combinations`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text ?? '';
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON in response');
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    console.warn(`[inspiration_engine] Failed to parse brief, using defaults: ${err.message}`);
    return {
      poses: ['confident standing pose', 'relaxed seated pose', 'dynamic walking pose'],
      outfits: ['athletic crop top and leggings', 'casual summer dress', 'bikini with coverup'],
      settings: ['golden hour beach', 'modern gym interior', 'urban rooftop at sunset'],
      colorPalettes: ['warm golden tones with soft highlights', 'cool blue-teal with warm skin tones'],
      moods: ['confident and energetic', 'relaxed and playful', 'bold and commanding'],
      cameraAngles: ['medium shot, slightly below eye level', 'full body, straight on', 'close-up portrait, soft bokeh'],
    };
  }
}

export function buildDynamicPrompt(brief, tier) {
  if (!brief) throw new Error('buildDynamicPrompt: brief is required');
  if (!tier || !['T1', 'T2', 'T3'].includes(tier)) throw new Error('buildDynamicPrompt: tier must be T1, T2, or T3');

  const pose = brief.poses?.[0] ?? 'confident natural pose';
  const outfit = brief.outfits?.[0] ?? 'stylish athletic wear';
  const setting = brief.settings?.[0] ?? 'outdoor natural setting';
  const palette = brief.colorPalettes?.[0] ?? 'warm natural tones';
  const mood = brief.moods?.[0] ?? 'confident and approachable';
  const angle = brief.cameraAngles?.[0] ?? 'medium shot';

  const prompt = `# CHARACTER
${BASE_APPEARANCE}. ${ANTI_AI_MODIFIERS}.

# EYE DEFINITION
Photorealistic human eyes with warm genuine expression. Clear detailed green iris with natural texture and real human depth. Natural catchlight reflecting light. Warm engaging gaze.

# OUTFIT
${outfit}

# POSE & BODY
${pose}

# SETTING & LOCATION
${setting}

# COLOR & LIGHTING
${palette}. Professional photography lighting, natural color temperature.

# MOOD & ATMOSPHERE
${mood}

# CAMERA
${angle}. Professional 8K photorealistic, sharp focus, shallow depth of field.

# AVOID
${NEGATIVE_PROMPT}

# CONTENT CONSTRAINTS
${TIER_GUIDELINES[tier]}`;

  return {
    prompt: prompt.trim(),
    negative_prompt: NEGATIVE_PROMPT,
    tier,
    setting,
    mood,
  };
}

export { BASE_APPEARANCE, ANTI_AI_MODIFIERS, NEGATIVE_PROMPT, TIER_GUIDELINES };
