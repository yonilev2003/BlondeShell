#!/usr/bin/env node
import 'dotenv/config.js';

import { supabase, logAgentAction  } from '../lib/supabase.js';

/**
 * Seed reference_images table with the initial beach/golden images
 * Run: node scripts/seed_reference_images.js
 */

const REFERENCE_SEEDS = [
  {
    image_url: 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream-4-5/021775550361822d3ceb3d471ce278cd568773b7d71d639e95d40_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=REDACTED_VOLC_KEY%2F20260407%2Fap-southeast-1%2Ftos%2Frequest&X-Tos-Date=20260407T082609Z&X-Tos-Expires=86400&X-Tos-Signature=0ac59339c8e8cf05575ef39d95cc55eb1576544e07c82c143bd3c8af40f3da36&X-Tos-SignedHeaders=host',
    setting: 'beach',
    tier: 'T1',
    mood: 'golden',
    filename: 'beach_T1_golden_1.jpg',
    alt_text: 'BlondeShell reference — beach T1 golden hour',
    face_similarity: 0.95,
  },
  {
    image_url: 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream-4-5/021775550371260d3ceb3d471ce278cd568773b7d71d6398883ed_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=REDACTED_VOLC_KEY%2F20260407%2Fap-southeast-1%2Ftos%2Frequest&X-Tos-Date=20260407T082619Z&X-Tos-Expires=86400&X-Tos-Signature=bfd67e94c7a7dc4820e8ab35df401954f65e660f00bd47122e0acce0e1f78394&X-Tos-SignedHeaders=host',
    setting: 'beach',
    tier: 'T1',
    mood: 'golden',
    filename: 'beach_T1_golden_2.jpg',
    alt_text: 'BlondeShell reference — beach T1 golden hour (variant)',
    face_similarity: 0.94,
  },
];

async function seedReferences() {
  console.log(`[seed_reference_images] Seeding ${REFERENCE_SEEDS.length} reference images...`);

  let inserted = 0;
  let failed = 0;

  for (const seed of REFERENCE_SEEDS) {
    try {
      const { data, error } = await supabase
        .from('reference_images')
        .insert(seed)
        .select();

      if (error) {
        console.warn(`[seed_reference_images] ⚠️ Failed to insert (may already exist): ${error.message}`);
        failed++;
      } else {
        console.log(`[seed_reference_images] ✅ Inserted: ${seed.setting}/${seed.tier} (${seed.setting_alt_description})`);
        inserted++;
      }
    } catch (err) {
      console.warn(`[seed_reference_images] ❌ Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n[seed_reference_images] Done. ${inserted} inserted, ${failed} failed/skipped.`);
  await logAgentAction('seed_reference_images', 'seeding', inserted > 0 ? 'completed' : 'partial',
    `${inserted}/${REFERENCE_SEEDS.length} references seeded`);
}

seedReferences().catch(err => {
  console.error('[seed_reference_images] Fatal:', err.message);
  process.exit(1);
});
