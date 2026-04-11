/**
 * scripts/generate_cycle2.js — Cycle 2 content generation (Apr 16–19 gap fill)
 *
 * Generates 15 T1 images + 10 T1 videos with priority themes:
 *
 * IMAGES (15):
 *   gym_selfie     (4) — crop top + high waist, mirror selfie
 *   gaming_setup   (4) — hoodie, purple/blue LED lighting
 *   beach_golden   (4) — beach golden hour, effortless
 *   workout_form   (3) — side profile, athletic form
 *
 * VIDEOS (10, sourced from generated images):
 *   squat_side     (3) — low angle camera, from gym_selfie images
 *   leg_press      (2) — POV angle, from workout_form images
 *   gaming_night   (3) — monitor glow motion, from gaming_setup images
 *   beach_slowmo   (2) — slo-mo hair + waves, from beach_golden images
 *
 * Usage:
 *   node scripts/generate_cycle2.js
 *   node scripts/generate_cycle2.js --images-only
 *   node scripts/generate_cycle2.js --videos-only
 */

import 'dotenv/config';
import { generateImage, REFERENCE_SETS } from '../lib/generate_image.js';
import { generateVideo } from '../lib/generate_video.js';
import { saveImage, saveVideo } from '../lib/supabase_content.js';
import { signAndUpload } from '../lib/c2pa_sign.js';

const BATCH_ID = `cycle2_${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const imagesOnly = process.argv.includes('--images-only');
const videosOnly = process.argv.includes('--videos-only');

function progress(current, total, label) {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r[${bar}] ${pct}% — ${label}    `);
}

// ─── Image themes ─────────────────────────────────────────────────────────────

const IMAGE_THEMES = [
  {
    key: 'gym_selfie',
    count: 4,
    setting: 'gym',
    mood: 'athletic',
    refs: REFERENCE_SETS.gym,
    prompt: 'The woman from the reference images is in a modern gym, wearing a fitted crop top and high-waist athletic leggings, taking a mirror selfie with a confident natural smile. Bright gym lighting, clean background, fitness lifestyle photography.',
  },
  {
    key: 'gaming_setup',
    count: 4,
    setting: 'home',
    mood: 'gaming',
    refs: REFERENCE_SETS.home,
    prompt: 'The woman from the reference images is sitting at a sleek gaming desk setup, wearing an oversized hoodie. Purple and blue LED lighting glows behind her, dual monitors visible in the background. She looks at camera with a relaxed playful expression. Cinematic gaming lifestyle photography.',
  },
  {
    key: 'beach_golden',
    count: 4,
    setting: 'beach',
    mood: 'golden_hour',
    refs: REFERENCE_SETS.beach,
    prompt: 'The woman from the reference images is on a sandy beach at golden hour, warm orange sunset light, wearing a casual summer outfit. Effortless natural pose, ocean waves softly blurred in background. Editorial lifestyle photography, shallow depth of field.',
  },
  {
    key: 'workout_form',
    count: 3,
    setting: 'gym',
    mood: 'athletic',
    refs: REFERENCE_SETS.gym,
    prompt: 'The woman from the reference images is in a gym captured from a clean side profile angle, demonstrating perfect athletic form. Wearing fitted gym wear, powerful athletic stance, clean gym equipment visible. Motivational sports photography, natural gym lighting.',
  },
];

// ─── Video themes ─────────────────────────────────────────────────────────────
// Each entry maps to a slice of the generated images array (by theme key + index)

const VIDEO_THEMES = [
  {
    key: 'squat_side',
    count: 3,
    sourceTheme: 'gym_selfie',  // use first 3 gym_selfie images
    sourceOffset: 0,
    setting: 'gym',
    mood: 'athletic',
    customPrompt: 'slow squat movement from low angle, powerful athletic motion, confident expression, gym lighting',
  },
  {
    key: 'leg_press',
    count: 2,
    sourceTheme: 'workout_form',  // use first 2 workout_form images
    sourceOffset: 0,
    setting: 'gym',
    mood: 'athletic',
    customPrompt: 'leg press rep motion captured from close POV angle, focused athletic expression, gym equipment visible',
  },
  {
    key: 'gaming_night',
    count: 3,
    sourceTheme: 'gaming_setup',  // use first 3 gaming_setup images
    sourceOffset: 0,
    setting: 'home',
    mood: 'gaming',
    customPrompt: 'subtle head turn toward camera, purple and blue monitor glow, gentle gaming atmosphere, playful smile forming',
  },
  {
    key: 'beach_slowmo',
    count: 2,
    sourceTheme: 'beach_golden',  // use first 2 beach_golden images
    sourceOffset: 0,
    setting: 'beach',
    mood: 'golden_hour',
    customPrompt: 'slow motion hair gently blowing in ocean breeze, golden hour light on face, soft wave movement in background',
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== CYCLE 2 CONTENT GENERATION | batch_id: ${BATCH_ID} ===`);
  console.log(`Mode: ${imagesOnly ? 'images-only' : videosOnly ? 'videos-only' : 'images + videos'}\n`);

  // Map: theme key → array of saved image records
  const generatedImages = {};

  // ── Phase 1: Images ─────────────────────────────────────────────────────────

  if (!videosOnly) {
    const totalImages = IMAGE_THEMES.reduce((s, t) => s + t.count, 0);
    console.log(`Phase 1: Generating ${totalImages} images across ${IMAGE_THEMES.length} themes...\n`);

    let globalIdx = 0;
    for (const theme of IMAGE_THEMES) {
      console.log(`\n  [${theme.key}] — ${theme.count} images`);
      generatedImages[theme.key] = [];

      for (let i = 0; i < theme.count; i++) {
        progress(globalIdx, totalImages, `${theme.key} ${i + 1}/${theme.count}`);
        try {
          const img = await generateImage({
            setting: theme.setting,
            tier: 'T1',
            mood: theme.mood,
            referenceUrls: theme.refs,
            promptCore: theme.prompt,
          });

          img.url = await signAndUpload(img.url);

          const saved = await saveImage({
            setting: theme.setting,
            tier: 'T1',
            mood: theme.mood,
            url: img.url,
            prompt: theme.prompt,
            batch_id: BATCH_ID,
          });

          generatedImages[theme.key].push(saved);
          console.log(`\n    ✓ ${theme.key} image ${i + 1}: ${saved.id.slice(0, 8)}`);
        } catch (err) {
          console.error(`\n    ✗ ${theme.key} image ${i + 1}: ${err.message}`);
        }

        globalIdx++;
        if (i < theme.count - 1) await sleep(1500);
      }
    }

    const totalSaved = Object.values(generatedImages).reduce((s, arr) => s + arr.length, 0);
    console.log(`\n\nPhase 1 complete: ${totalSaved}/${totalImages} images saved.\n`);
  }

  // ── Phase 2: Videos ─────────────────────────────────────────────────────────

  if (!imagesOnly) {
    const totalVideos = VIDEO_THEMES.reduce((s, t) => s + t.count, 0);
    console.log(`Phase 2: Generating ${totalVideos} videos across ${VIDEO_THEMES.length} themes...\n`);

    // If running videos-only, fetch recent images from Supabase as source frames
    if (videosOnly) {
      console.log('  Videos-only mode: loading recent approved images from Supabase...');
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

      for (const theme of VIDEO_THEMES) {
        const settingMap = { gym_selfie: 'gym', gaming_setup: 'home', beach_golden: 'beach', workout_form: 'gym' };
        const setting = settingMap[theme.sourceTheme] ?? theme.setting;
        const { data } = await sb.from('content_items')
          .select('id, url')
          .eq('type', 'image')
          .eq('tier', 'T1')
          .eq('setting', setting)
          .in('qa_status', ['approved', 'pending'])
          .order('created_at', { ascending: false })
          .limit(theme.count);
        generatedImages[theme.sourceTheme] = data ?? [];
        console.log(`  ${theme.sourceTheme}: ${generatedImages[theme.sourceTheme].length} source images loaded`);
      }
    }

    let globalIdx = 0;
    let totalVideosSaved = 0;

    for (const theme of VIDEO_THEMES) {
      const sourceImages = (generatedImages[theme.sourceTheme] ?? []).slice(theme.sourceOffset);
      console.log(`\n  [${theme.key}] — ${theme.count} videos | source: ${theme.sourceTheme} (${sourceImages.length} available)`);

      for (let i = 0; i < theme.count; i++) {
        const sourceImage = sourceImages[i];
        if (!sourceImage?.url) {
          console.warn(`\n    ✗ ${theme.key} video ${i + 1}: no source image available — skipping`);
          continue;
        }

        progress(globalIdx, totalVideos, `${theme.key} ${i + 1}/${theme.count}`);
        try {
          const vid = await generateVideo({
            startImageUrl: sourceImage.url,
            setting: theme.setting,
            motionIndex: i,
            duration: 5,
            customPrompt: theme.customPrompt,
          });

          vid.url = await signAndUpload(vid.url);

          await saveVideo({
            setting: theme.setting,
            tier: 'T1',
            mood: theme.mood,
            url: vid.url,
            prompt: theme.customPrompt,
            batch_id: BATCH_ID,
            source_image_id: sourceImage.id,
            duration_seconds: 5,
          });

          totalVideosSaved++;
          console.log(`\n    ✓ ${theme.key} video ${i + 1}: source ${sourceImage.id.slice(0, 8)}`);
        } catch (err) {
          console.error(`\n    ✗ ${theme.key} video ${i + 1}: ${err.message}`);
        }

        globalIdx++;
        if (i < theme.count - 1) await sleep(3000);
      }
    }

    console.log(`\n\nPhase 2 complete: ${totalVideosSaved}/${totalVideos} videos saved.\n`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  console.log('=== CYCLE 2 GENERATION SUMMARY ===');
  console.log(`batch_id: ${BATCH_ID}`);
  if (!videosOnly) {
    for (const [key, imgs] of Object.entries(generatedImages)) {
      console.log(`  ${key.padEnd(20)} ${imgs.length} images`);
    }
  }
  console.log('\nNext steps:');
  console.log('  1. npm run qa -- --auto-approve   (or manual review)');
  console.log('  2. npm run publer:fill-queue-cycle2');
  console.log('=== DONE ===\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
