import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import { fal } from '@fal-ai/client';
import { supabase, logAgentAction } from '../lib/supabase.js';
import { withRetry } from '../lib/retry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REF_DIR = path.join(__dirname, '../assets/reference/hero');
const LORA_CONFIG_PATH = path.join(__dirname, '../lora_config.json');

const TRIGGER_WORD = 'blondeshell_v1';
const TRAINING_STEPS = 1000;

// ── fal.ai client config ──────────────────────────────────────────────────────
fal.config({ credentials: process.env.FAL_KEY });

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[train_lora] BlondeShell LoRA training — fal-ai/flux-lora-portrait-trainer');

  // 1. Verify reference images exist
  const refImages = getRefImages(REF_DIR);
  if (refImages.length < 4) {
    console.error(`[train_lora] Need ≥4 reference images in ${REF_DIR}, found: ${refImages.length}`);
    console.error('[train_lora] Add ref_001.jpg through ref_005.jpg and retry.');
    await logAgentAction('train_lora', 'lora_training', 'failed',
      `insufficient ref images: ${refImages.length}/4 required`);
    process.exit(1);
  }
  console.log(`[train_lora] Found ${refImages.length} reference images`);

  // 2. Zip reference images
  console.log('[train_lora] Zipping reference images...');
  const zipPath = path.join(__dirname, '../assets/reference/training_images.zip');
  await zipImages(refImages, zipPath);
  console.log(`[train_lora] Zip created: ${zipPath}`);

  // 3. Upload zip to fal.ai storage
  console.log('[train_lora] Uploading to fal.ai storage...');
  const imagesDataUrl = await withRetry(
    () => fal.storage.upload(fs.createReadStream(zipPath), { filename: 'training_images.zip' }),
    { label: 'fal_upload', maxRetries: 3, baseDelayMs: 1000 }
  );
  console.log(`[train_lora] Uploaded: ${imagesDataUrl}`);

  // 4. Start training
  console.log('[train_lora] Starting LoRA training (this takes ~5-10 min)...');
  const result = await withRetry(
    () => fal.run('fal-ai/flux-lora-portrait-trainer', {
      input: {
        images_data_url: imagesDataUrl,
        trigger_word: TRIGGER_WORD,
        steps: TRAINING_STEPS,
        is_style: false,
        create_masks: true,
      },
    }),
    { label: 'fal_training', maxRetries: 2, baseDelayMs: 5000 }
  );

  const loraUrl = result?.diffusers_lora_file?.url;
  const configUrl = result?.config_file?.url;

  if (!loraUrl) {
    throw new Error('Training completed but no diffusers_lora_file.url in response');
  }

  console.log(`[train_lora] LoRA weights: ${loraUrl}`);

  // 5. Save lora_config.json locally
  const loraConfig = {
    trigger_word: TRIGGER_WORD,
    lora_url: loraUrl,
    config_url: configUrl || null,
    trained_at: new Date().toISOString(),
    ref_image_count: refImages.length,
    steps: TRAINING_STEPS,
    endpoint: 'fal-ai/flux-lora-portrait-trainer',
  };
  fs.writeFileSync(LORA_CONFIG_PATH, JSON.stringify(loraConfig, null, 2));
  console.log(`[train_lora] Config saved: ${LORA_CONFIG_PATH}`);

  // 6. Log to Supabase context_snapshots
  await supabase.from('context_snapshots').insert({
    agent: 'train_lora',
    task: 'lora_training',
    snapshot_json: loraConfig,
  });

  await logAgentAction('train_lora', 'lora_training', 'completed',
    `LoRA trained. trigger: ${TRIGGER_WORD} url: ${loraUrl}`);

  // Cleanup zip
  fs.unlinkSync(zipPath);

  console.log('\n[train_lora] Training complete.');
  console.log(`  Trigger word : ${TRIGGER_WORD}`);
  console.log(`  LoRA URL     : ${loraUrl}`);
  console.log(`  Config saved : ${LORA_CONFIG_PATH}`);
  console.log('\nNext: add lora_url to .env as LORA_MODEL_URL, then run content agent.');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRefImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map(f => path.join(dir, f));
}

function zipImages(imagePaths, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    for (const imgPath of imagePaths) {
      archive.file(imgPath, { name: path.basename(imgPath) });
    }
    archive.finalize();
  });
}

main().catch(async (err) => {
  console.error('[train_lora] Fatal error:', err.message);
  await logAgentAction('train_lora', 'lora_training', 'failed', err.message).catch(() => {});
  process.exit(1);
});
