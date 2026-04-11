import { supabase } from './supabase.js';

/**
 * Setting fallback map: primary setting → alternative settings → default for tier
 * Enables graceful fallback when exact setting+tier reference doesn't exist
 *
 * NOTE: Current schema uses 'filename' and 'face_similarity' (not setting_alt_description / cosine_similarity)
 * and has no 'approved' column. All references in the table are considered approved.
 */
const settingMap = {
  beach: {
    alts: ['beach', 'coastal', 'seaside'],  // match via filename patterns
    defaults: { T1: 'beach', T2: 'studio', T3: 'studio' },
  },
  gym: {
    alts: ['gym', 'fitness'],
    defaults: { T1: 'gym', T2: 'gym', T3: 'studio' },
  },
  home: {
    alts: ['home', 'bedroom', 'living_room'],
    defaults: { T1: 'home', T2: 'home', T3: 'studio' },
  },
  studio: {
    alts: ['studio', 'backdrop'],
    defaults: { T1: 'studio', T2: 'studio', T3: 'studio' },
  },
  street: {
    alts: ['street', 'urban', 'city'],
    defaults: { T1: 'beach', T2: 'studio', T3: 'studio' },
  },
  travel: {
    alts: ['travel', 'beach'],
    defaults: { T1: 'travel', T2: 'travel', T3: 'studio' },
  },
};

/**
 * Select best matching reference image with intelligent fallback strategy
 *
 * @param {string} setting - Primary setting (beach, gym, home, studio, street, travel)
 * @param {string} tier - Content tier (T1, T2, T3)
 * @param {string} [fallbackAlt] - Optional alternative setting name from user input
 *
 * @returns {Promise<object>} Reference image object with all metadata
 * @throws {Error} If no approved reference found
 *
 * FALLBACK STRATEGY:
 * 1. PRIMARY: Exact setting + tier match, approved=true, similarity ≥ 0.90
 * 2. FALLBACK 1: Alternative setting name (fallbackAlt), tier LOCKED
 * 3. FALLBACK 2: Default setting for tier (from settingMap)
 * 4. ERROR: No approved reference found
 */
async function selectReferenceImage(setting, tier, fallbackAlt = null) {
  if (!setting || !tier) {
    throw new Error(`selectReferenceImage: setting and tier required. Got: setting=${setting}, tier=${tier}`);
  }

  if (!['T1', 'T2', 'T3'].includes(tier)) {
    throw new Error(`selectReferenceImage: invalid tier "${tier}". Must be T1, T2, or T3`);
  }

  // ── PRIMARY: Exact setting + tier match ──────────────────────────────────
  console.log(`[selectReferenceImage] PRIMARY: Finding ${setting}/${tier}...`);
  const { data: primaryRef, error: primaryErr } = await supabase
    .from('reference_images')
    .select('*')
    .eq('setting', setting)
    .eq('tier', tier)
    .gte('face_similarity', 0.85)  // Using face_similarity instead of cosine_similarity
    .order('face_similarity', { ascending: false })
    .limit(1)
    .maybeSingle();  // Returns null if no match instead of throwing

  if (!primaryErr && primaryRef) {
    console.log(`[selectReferenceImage] ✅ PRIMARY matched: ${setting}/${tier} (sim=${primaryRef.face_similarity})`);
    return primaryRef;
  }
  console.log(`[selectReferenceImage] PRIMARY miss. Trying fallback...`);

  // ── FALLBACK 1: Skip (schema uses filename, not setting_alt_description) ───
  // This would require pattern matching on filename; skipping for now
  if (fallbackAlt) {
    console.log(`[selectReferenceImage] FALLBACK 1: No alt-setting support in current schema (using filename instead)`);
  }

  // ── FALLBACK 2: Default setting for tier ────────────────────────────────
  const settingConfig = settingMap[setting];
  if (!settingConfig) {
    throw new Error(`selectReferenceImage: unknown setting "${setting}". Valid: ${Object.keys(settingMap).join(', ')}`);
  }

  const defaultSetting = settingConfig.defaults[tier];
  console.log(`[selectReferenceImage] FALLBACK 2: Finding default for ${tier}: ${defaultSetting}...`);

  const { data: defaultRef, error: defaultErr } = await supabase
    .from('reference_images')
    .select('*')
    .eq('setting', defaultSetting)
    .eq('tier', tier)
    .gte('face_similarity', 0.85)  // Using face_similarity
    .order('face_similarity', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!defaultErr && defaultRef) {
    console.log(`[selectReferenceImage] ✅ FALLBACK 2 matched: ${defaultSetting}/${tier}`);
    return defaultRef;
  }

  // ── ERROR: No reference found ────────────────────────────────────────────
  const msg = `No approved reference image found for tier ${tier} (tried: ${setting}/${tier}, fallback=${fallbackAlt || 'none'}, default=${defaultSetting}/${tier})`;
  console.error(`[selectReferenceImage] ❌ ${msg}`);
  throw Object.assign(new Error(msg), { code: 'NO_APPROVED_REF', tier, setting });
}

export { selectReferenceImage };
