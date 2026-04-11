/**
 * setup_reference_dataset.js — replaces train_lora.js (v8→v9)
 *
 * Uploads 30 reference images from ../hero_dataset/ to Supabase
 * reference_images table. No LoRA training. seedream v4.5 uses IP-Adapter
 * FaceID with the reference image pool directly.
 *
 * Filename convention: {setting}_{tier}_{mood}.jpg
 *   e.g. beach_T1_golden.jpg, gym_T3_athletic.jpg, home_T2_cozy.jpg
 *
 * Run: node scripts/setup_reference_dataset.js
 */
import 'dotenv/config.js';

import fs from 'fs';
import path from 'path';
import { fal  } from '@fal-ai/client';
import { supabase, logAgentAction  } from '../lib/supabase.js';
import { withRetry  } from '../lib/retry.js';

fal.config({ credentials: process.env.FAL_KEY });

const REF_DIR     = path.join(__dirname, '../../hero_dataset');
const VALID_EXTS  = /\.(jpg|jpeg|png|webp)$/i;
const FILENAME_RE = /^([a-z]+)_(T[123])_([a-z_]+)\.(jpg|jpeg|png|webp)$/i;

async function main() {
  console.log('[setup_reference_dataset] BlondeShell v9 — uploading reference images to Supabase');
  console.log(`[setup_reference_dataset] Source directory: ${REF_DIR}`);

  if (!fs.existsSync(REF_DIR)) {
    console.error(`[setup_reference_dataset] Directory not found: ${REF_DIR}`);
    console.error('Create ../hero_dataset/ and add reference images.');
    process.exit(1);
  }

  const files = fs.readdirSync(REF_DIR).filter(f => VALID_EXTS.test(f));
  if (files.length === 0) {
    console.error('[setup_reference_dataset] No image files found in', REF_DIR);
    process.exit(1);
  }
  console.log(`[setup_reference_dataset] Found ${files.length} image(s)`);

  let uploaded = 0;
  let skipped  = 0;
  let failed   = 0;

  for (const filename of files) {
    const filePath = path.join(REF_DIR, filename);
    const meta = parseFilename(filename);

    // ── Upload to fal.ai storage (acts as CDN for reference URLs) ────────────
    let image_url;
    try {
      // Node.js v18+ native fetch requires duplex:'half' for ReadStream bodies.
      // Pass a Blob (buffered) instead — avoids the restriction entirely.
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
      const blob = new Blob([buffer], { type: mimeMap[ext] || 'image/jpeg' });
      image_url = await withRetry(
        () => fal.storage.upload(blob, { filename }),
        { label: `upload_${filename}`, maxRetries: 3, baseDelayMs: 1000 }
      );
      console.log(`[setup_reference_dataset] Uploaded: ${filename} → ${image_url}`);
    } catch (err) {
      console.error(`[setup_reference_dataset] Upload failed for ${filename}: ${err.message}`);
      failed++;
      continue;
    }

    // ── Upsert into reference_images ─────────────────────────────────────────
    const { error } = await supabase.from('reference_images').upsert(
      {
        image_url,
        filename,
        setting:          meta.setting,
        tier:             meta.tier,
        mood:             meta.mood,
        alt_text:         `BlondeShell reference — ${meta.setting}, ${meta.tier}, ${meta.mood}`,
        face_similarity:  1.0,   // hero images treated as ground truth
        used_as_start_frame: false,
        created_at:       new Date().toISOString(),
      },
      { onConflict: 'image_url' }
    );

    if (error) {
      console.warn(`[setup_reference_dataset] DB upsert failed for ${filename}: ${error.message}`);
      skipped++;
    } else {
      uploaded++;
    }
  }

  console.log(`\n[setup_reference_dataset] Complete.`);
  console.log(`  Uploaded : ${uploaded}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Failed   : ${failed}`);
  console.log('\nNext: run dm_processor.js or generate_image.js to use the reference dataset.');

  await logAgentAction('setup_reference_dataset', 'upload_references', 'completed',
    `uploaded=${uploaded} skipped=${skipped} failed=${failed} total=${files.length}`);
}

// ── Filename parser ───────────────────────────────────────────────────────────
function parseFilename(filename) {
  const match = filename.match(FILENAME_RE);
  if (match) {
    return { setting: match[1].toLowerCase(), tier: match[2].toUpperCase(), mood: match[3].toLowerCase() };
  }
  // Fallback: unknown metadata
  console.warn(`[setup_reference_dataset] Filename doesn't match convention: ${filename}`);
  return { setting: 'unknown', tier: 'T1', mood: 'neutral' };
}

main().catch(err => {
  console.error('[setup_reference_dataset] Fatal:', err.message);
  logAgentAction('setup_reference_dataset', 'upload_references', 'failed', err.message).catch(() => {});
  process.exit(1);
});
