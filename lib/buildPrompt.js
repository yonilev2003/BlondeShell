/**
 * Build a multi-section prompt for image generation using reference image metadata
 *
 * @param {object} referenceImage - Reference image metadata
 * @param {string} referenceImage.face_description - e.g., "oval face, blue eyes, subtle makeup"
 * @param {string} referenceImage.hair_color - e.g., "blonde"
 * @param {string} referenceImage.hair_style - e.g., "long wavy"
 * @param {string} referenceImage.expression - e.g., "confident, eyes to camera"
 * @param {string} referenceImage.skin_tone - e.g., "fair"
 * @param {string} referenceImage.outfit_type - e.g., "bikini, athletic"
 * @param {string} referenceImage.outfit_description - detailed outfit notes
 * @param {string} referenceImage.body_position - e.g., "standing, profile view"
 * @param {string} referenceImage.setting - beach, gym, home, studio, street
 * @param {string} mood - golden, flirty, athletic, cozy, bold
 * @param {string} tier - T1, T2, T3
 * @param {string} [customSetting] - Optional override for setting in prompt
 *
 * @returns {string} Multi-section prompt string
 */
function buildPrompt(referenceImage, mood, tier, customSetting = null) {
  if (!referenceImage) throw new Error('buildPrompt: referenceImage is required');
  if (!mood) throw new Error('buildPrompt: mood is required');
  if (!tier || !['T1', 'T2', 'T3'].includes(tier)) throw new Error('buildPrompt: tier must be T1, T2, or T3');

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
  } = referenceImage;

  const actualSetting = customSetting || setting;

  // Mood prompt fragments — 9 variants for quality refinement (A–D baseline, E–I new)
  const moodMap = {
    // Baseline variants A–D
    'golden-aggressive': 'Warm golden hour lighting, soft glow, dreamy ambiance, ethereal quality, glowing skin',
    'golden-soft': 'Warm soft lighting without oversaturation, natural skin tone, gentle glow, relaxed atmosphere',
    'neutral-skin-focus': 'Natural daylight, bright and clear, professional lighting with realistic skin tones',
    'skin-only': 'Professional lighting, natural skin texture, realistic depth, accurate colors',
    // NEW Variant E: Remove mood section entirely (empty string)
    'no-mood': '',
    // NEW Variant F: Lower IP-Adapter to 0.60 + add color grading constraint
    'color-graded': 'Professional color-graded lighting, cinematic tone, warm skin tones with cool highlights, color science-accurate',
    // NEW Variant G: Specific camera params (Canon 85mm f/1.4) + no mood
    'canon-85mm': 'Shot on Canon EOS R6 with 85mm f/1.4 lens, natural bokeh, shallow depth of field',
    // NEW Variant H: Film photography + skin detail focus
    'film-photography': 'Portra 400 film stock aesthetic, fine grain texture, vintage color palette, organic skin texture with character',
    // NEW Variant I: Combine best of E/F/G into one
    'combined-best': 'Professional cinema color grading, 85mm lens aesthetic, natural skin with film-like texture, warm cinematic tones',
    // NEW Variants J, K, L: Seedream 4.5 API optimization
    'optimized-j': 'Professional lighting, cinematic color grading, studio quality, natural skin tones',
    'optimized-k': 'Professional lighting, cinematic color grading, studio quality, natural skin tones, exact outfit matching',
    'optimized-l': 'Professional cinema lighting, ultra-high definition color grading, studio quality, flawless skin tones',
    // NEW Variants M, N, O: Microdetails + eye enhancement + production-ready
    'microdetail-m': 'Studio lighting with soft directional fill, ultra-detailed skin texture visible, freckles and pores rendered naturally, photorealistic skin with microdetails',
    'eye-enhanced-n': 'Cinematic side lighting with eye catch light, glowing green eyes with refractive iris, sharp eyelash detail visible, subsurface scattering in skin',
    'production-ready-o': 'Professional cinema color grading, ultra-detailed skin with freckles visible, glowing green eyes with iris detail, subsurface scattering, studio lighting, magazine-ready quality',
    // NEW Variants P, Q, R: Simplification + outfit consistency
    'natural-p': 'Natural outdoor late afternoon lighting, realistic skin and eyes, detailed but natural appearance',
    'outfit-consistent-q': 'Natural outdoor lighting, exact outfit matching from reference image, no extra layers, no sweater',
    'production-v2-r': 'Natural outdoor late afternoon lighting, outfit consistent with reference, realistic freckles, natural eyes, magazine-quality',
    // V3 Variants S3, T3, U3: Scene description ONLY (no character description — it causes drift with hard_identity mode)
    'photorealistic-s3': 'Beach photoshoot. Natural sunlight, golden hour. Confident athletic pose.',
    'authentic-t3': 'Beach photoshoot. Warm afternoon light. Natural playful energy.',
    'natural-professional-u3': 'Beach photoshoot. Professional portrait lighting. Confident relaxed pose.',
    // Original moods (for backward compatibility)
    golden: 'Warm golden hour lighting, soft glow, dreamy ambiance, glowing skin',
    flirty: 'Playful, confident, alluring expression, teasing smile, engaging eyes',
    athletic: 'Fit, toned body, athletic pose, dynamic energy, intense gaze, powerful stance',
    cozy: 'Warm, comfortable, relaxed, soft window lighting, homey atmosphere',
    bold: 'Strong statement pose, commanding presence, confident attitude, eye-catching',
  };

  // Tier constraints
  const tierConstraints = {
    T1: 'Safe for YouTube, Instagram, TikTok. No nudity. Covered or tasteful suggestive.',
    T2: 'Twitter/Reddit suitable. Suggestive but not explicit. Partial coverage allowed.',
    T3: 'Fanvue only. Artistic full-body. Intimate context, artistic intent.',
  };

  // Setting lighting/vibe
  const settingVibes = {
    beach: 'ocean breeze, sand texture, seaside atmosphere, 3-point beach setup',
    gym: 'bright studio lights, equipment visible, athletic energy, high contrast',
    home: 'soft window light, intimate bedroom/living room, warm and cozy, natural light',
    studio: '3-point studio lighting, clean backdrop, professional setup, shadowless',
    street: 'daylight, urban environment, natural shadows, candid street photography',
    travel: 'scenic background, travel vibe, wanderlust atmosphere, diverse settings',
  };

  const moodFragment = moodMap[mood] || mood;
  const constraint = tierConstraints[tier] || '';
  const vibe = settingVibes[actualSetting] || 'professional setting';

  // Build multi-section prompt
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

  // Conditionally add MOOD & ATMOSPHERE section (skip if moodFragment is empty)
  if (moodFragment.trim()) {
    prompt += `

# MOOD & ATMOSPHERE
${moodFragment}`;
  }

  // Add AVOID section with negative prompts
  const negativePrompts = negative_prompts || 'watermark, text, signature, ai-label, generated-tag, letters, numbers, blurry, low quality, distorted, anime, illustration, cartoon, stylized, CGI, 3D render, digital art, painting, plastic skin, doll-like, synthetic, smoothed skin, filter, airbrush, photoshop, overly glossy, unrealistic perfection, too symmetrical, dead eyes, fake smile, artificial glow, heavy makeup, Instagram filter, smooth poreless skin, painted, drawn';
  prompt += `

# AVOID
${negativePrompts}

# CONTENT CONSTRAINTS
${constraint}

FINAL INSTRUCTION: Generate a professional, high-quality image consistent with the character and mood described above.
`;

  return prompt.trim();
}

export { buildPrompt };
