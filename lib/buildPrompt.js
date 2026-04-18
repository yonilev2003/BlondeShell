import { buildDynamicPrompt, BASE_APPEARANCE, ANTI_AI_MODIFIERS, NEGATIVE_PROMPT, TIER_GUIDELINES } from './inspiration_engine.js';

const MOOD_MAP = {
  'golden-aggressive': 'Warm golden hour lighting, soft glow, dreamy ambiance, ethereal quality, glowing skin',
  'golden-soft': 'Warm soft lighting without oversaturation, natural skin tone, gentle glow, relaxed atmosphere',
  'neutral-skin-focus': 'Natural daylight, bright and clear, professional lighting with realistic skin tones',
  'skin-only': 'Professional lighting, natural skin texture, realistic depth, accurate colors',
  'no-mood': '',
  'color-graded': 'Professional color-graded lighting, cinematic tone, warm skin tones with cool highlights, color science-accurate',
  'canon-85mm': 'Shot on Canon EOS R6 with 85mm f/1.4 lens, natural bokeh, shallow depth of field',
  'film-photography': 'Portra 400 film stock aesthetic, fine grain texture, vintage color palette, organic skin texture with character',
  'combined-best': 'Professional cinema color grading, 85mm lens aesthetic, natural skin with film-like texture, warm cinematic tones',
  'optimized-j': 'Professional lighting, cinematic color grading, studio quality, natural skin tones',
  'optimized-k': 'Professional lighting, cinematic color grading, studio quality, natural skin tones, exact outfit matching',
  'optimized-l': 'Professional cinema lighting, ultra-high definition color grading, studio quality, flawless skin tones',
  'microdetail-m': 'Studio lighting with soft directional fill, ultra-detailed skin texture visible, freckles and pores rendered naturally, photorealistic skin with microdetails',
  'eye-enhanced-n': 'Cinematic side lighting with eye catch light, glowing green eyes with refractive iris, sharp eyelash detail visible, subsurface scattering in skin',
  'production-ready-o': 'Professional cinema color grading, ultra-detailed skin with freckles visible, glowing green eyes with iris detail, subsurface scattering, studio lighting, magazine-ready quality',
  'natural-p': 'Natural outdoor late afternoon lighting, realistic skin and eyes, detailed but natural appearance',
  'outfit-consistent-q': 'Natural outdoor lighting, exact outfit matching from reference image, no extra layers, no sweater',
  'production-v2-r': 'Natural outdoor late afternoon lighting, outfit consistent with reference, realistic freckles, natural eyes, magazine-quality',
  'photorealistic-s3': 'Beach photoshoot. Natural sunlight, golden hour. Confident athletic pose.',
  'authentic-t3': 'Beach photoshoot. Warm afternoon light. Natural playful energy.',
  'natural-professional-u3': 'Beach photoshoot. Professional portrait lighting. Confident relaxed pose.',
  golden: 'Warm golden hour lighting, soft glow, dreamy ambiance, glowing skin',
  flirty: 'Playful, confident, alluring expression, teasing smile, engaging eyes',
  athletic: 'Fit, toned body, athletic pose, dynamic energy, intense gaze, powerful stance',
  cozy: 'Warm, comfortable, relaxed, soft window lighting, homey atmosphere',
  bold: 'Strong statement pose, commanding presence, confident attitude, eye-catching',
};

const SETTING_VIBES = {
  beach: 'ocean breeze, sand texture, seaside atmosphere, 3-point beach setup',
  gym: 'bright studio lights, equipment visible, athletic energy, high contrast',
  home: 'soft window light, intimate bedroom/living room, warm and cozy, natural light',
  studio: '3-point studio lighting, clean backdrop, professional setup, shadowless',
  street: 'daylight, urban environment, natural shadows, candid street photography',
  travel: 'scenic background, travel vibe, wanderlust atmosphere, diverse settings',
};

/**
 * Build a prompt from a creative brief (new inspiration engine path)
 * or from legacy reference image metadata (backward compatible).
 *
 * @param {object} referenceImageOrBrief - Creative brief object OR legacy reference image metadata
 * @param {string} mood - Mood key or free-text mood string
 * @param {string} tier - T1, T2, or T3
 * @param {string} [customSetting] - Optional override for setting
 * @returns {string} Multi-section prompt string
 */
function buildPrompt(referenceImageOrBrief, mood, tier, customSetting = null) {
  if (!referenceImageOrBrief) throw new Error('buildPrompt: first argument is required');
  if (!tier || !['T1', 'T2', 'T3'].includes(tier)) throw new Error('buildPrompt: tier must be T1, T2, or T3');

  // Detect creative brief (has poses/outfits/settings arrays)
  if (referenceImageOrBrief.poses || referenceImageOrBrief.outfits || referenceImageOrBrief.settings) {
    const brief = referenceImageOrBrief;
    if (mood) {
      const moodFragment = MOOD_MAP[mood] || mood;
      brief.moods = brief.moods ?? [];
      if (moodFragment && !brief.moods.includes(moodFragment)) {
        brief.moods.unshift(moodFragment);
      }
    }
    if (customSetting) {
      brief.settings = brief.settings ?? [];
      brief.settings.unshift(customSetting);
    }
    return buildDynamicPrompt(brief, tier).prompt;
  }

  // Legacy path: reference image metadata
  if (!mood) throw new Error('buildPrompt: mood is required');

  const {
    face_description = 'woman',
    hair_color = 'blonde',
    hair_style = 'long',
    expression = 'confident',
    skin_tone = 'fair',
    identity_anchors = '',
    outfit_type = 'casual',
    outfit_description = 'stylish outfit',
    body_position = 'standing',
    setting = 'indoors',
    negative_prompts = '',
  } = referenceImageOrBrief;

  const actualSetting = customSetting || setting;
  const moodFragment = MOOD_MAP[mood] || mood;
  const constraint = TIER_GUIDELINES[tier] || '';
  const vibe = SETTING_VIBES[actualSetting] || 'professional setting';

  let prompt = `
# CHARACTER CONSISTENCY
Face: ${face_description}
Hair: ${hair_color}, ${hair_style}
Expression: ${expression}
Skin Tone: ${skin_tone}

# EYE DEFINITION
Photorealistic human eyes with warm genuine expression. Clear detailed green iris with natural iris texture and real human depth. Natural catchlight reflecting light. Moist appearance showing real eye. Warm engaging gaze, not artificial or posed.

# IDENTITY ANCHORS
${identity_anchors || face_description}

# OUTFIT
Type: ${outfit_type}
Details: ${outfit_description}

# OUTFIT CRITICAL CONSTRAINTS
EXACT MATCH TO REFERENCE IMAGE - DO NOT DEVIATE:
- Black sports crop top (MUST match reference exactly)
- Orange zip-up jacket over shoulders (unzipped, MUST match)
- Black bottoms or shorts
MUST NOT APPEAR: Sweater, hoodie, additional layers, extra clothing beyond reference

# SKIN & COMPLEXION
Tone: ${skin_tone}
Texture: natural, realistic depth, no orange cast
Color: warm peachy undertones, true-to-life complexion

# SKIN MICRODETAILS
Real human skin texture with visible natural pores and variation. Light scattered freckles from sun exposure (integrated naturally, not heavy or digital). Sun-kissed warm complexion from beach lifestyle. Natural skin imperfections showing real human texture, not poreless perfection. Fine baby hairs catching light.

# SETTING & LOCATION
Location: ${actualSetting} (natural outdoor beach/coastal setting if available)
Vibe: ${vibe} (diffused natural sunlight in afternoon/golden hour, real outdoor lighting quality with soft shadows, not studio, sun-kissed glow from active beach lifestyle, not artificial filter, warm natural daylight, realistic color temperature)

# PHOTOGRAPHY STYLE
Position: ${body_position}
Quality: Professional, 8K, high detail, photorealistic, sharp focus
Lighting: ${moodFragment}`;

  if (moodFragment.trim()) {
    prompt += `

# MOOD & ATMOSPHERE
${moodFragment}`;
  }

  const negativePrompts = negative_prompts || NEGATIVE_PROMPT;
  prompt += `

# AVOID
${negativePrompts}

# CONTENT CONSTRAINTS
${constraint}

FINAL INSTRUCTION: Generate a professional, high-quality image consistent with the character and mood described above.
`;

  return prompt.trim();
}

export { buildPrompt, BASE_APPEARANCE, ANTI_AI_MODIFIERS, NEGATIVE_PROMPT };
