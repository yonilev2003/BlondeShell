import 'dotenv/config';
import { generateImage, REFERENCE_SETS } from '../lib/generate_image.js';
import { generateVideo } from '../lib/generate_video.js';
import { saveImage, saveVideo } from '../lib/supabase_content.js';
import { signAndUpload } from '../lib/c2pa_sign.js';

const BATCHES = {
  beach: {
    images: 10,
    videos: 5,
    prompt: 'The woman from the reference images is sitting on a sandy beach at golden hour, wearing a white linen sundress, looking at camera with a soft smile. Warm sunset light, gentle ocean waves in background. Editorial lifestyle photography, 85mm lens, shallow depth of field.',
    setting: 'beach',
    tier: 'T1',
    mood: 'golden_hour',
  },
  gym: {
    images: 6,
    videos: 3,
    prompt: 'The woman from the reference images is in an athletic gym setting, wearing a matching sports bra and leggings, morning light streaming through windows. Confident athletic pose, professional fitness photography.',
    setting: 'gym',
    tier: 'T1',
    mood: 'athletic',
  },
  street: {
    images: 6,
    videos: 3,
    prompt: 'The woman from the reference images is standing on a city street in late afternoon golden light, wearing a casual chic outfit. She has a relaxed, natural posture — not walking. Soft genuine smile, effortless and calm expression. Candid lifestyle photography, urban background, natural light.',
    setting: 'street',
    tier: 'T1',
    mood: 'urban',
  },
  home: {
    images: 4,
    videos: 2,
    prompt: 'The woman from the reference images is in a cozy minimal home interior, soft window light, wearing a comfortable outfit. Relaxed lifestyle photography, warm interior tones.',
    setting: 'home',
    tier: 'T1',
    mood: 'cozy',
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs() {
  const args = process.argv.slice(2);
  const batch = args.find((a) => a.startsWith('--batch='))?.split('=')[1] ?? null;
  const imagesOnly = args.includes('--images-only');
  const videosOnly = args.includes('--videos-only');
  const imagesCount = args.find((a) => a.startsWith('--images=')) ? parseInt(args.find((a) => a.startsWith('--images=')).split('=')[1]) : null;
  const videosCount = args.find((a) => a.startsWith('--videos=')) ? parseInt(args.find((a) => a.startsWith('--videos=')).split('=')[1]) : null;
  return { batch, imagesOnly, videosOnly, imagesCount, videosCount };
}

function progress(current, total, label) {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r[${bar}] ${pct}% — ${label}    `);
}

async function runBatch(name, config, { imagesOnly, videosOnly, imagesCount, videosCount }) {
  const batch_id = `${name}_${Date.now()}`;
  const refs = REFERENCE_SETS[config.setting];
  const savedImages = [];
  const totalImages = imagesCount ?? config.images;
  const totalVideos = videosCount ?? config.videos;

  console.log(`\n\n=== Batch: ${name.toUpperCase()} | id: ${batch_id} ===`);

  if (!videosOnly) {
    console.log(`\nGenerating ${totalImages} images...`);
    for (let i = 0; i < totalImages; i++) {
      progress(i, totalImages, `image ${i + 1}/${totalImages}`);
      try {
        const img = await generateImage({
          setting: config.setting,
          tier: config.tier,
          mood: config.mood,
          referenceUrls: refs,
          promptCore: config.prompt,
        });

        img.url = await signAndUpload(img.url);

        const saved = await saveImage({
          setting: config.setting,
          tier: config.tier,
          mood: config.mood,
          url: img.url,
          prompt: config.prompt,
          batch_id,
        });
        savedImages.push(saved);
      } catch (err) {
        console.error(`\n[ERROR] image ${i + 1}: ${err.message}`);
      }

      if (i < totalImages - 1) await sleep(1500);
    }
    progress(totalImages, totalImages, `images done`);
    console.log(`\n✓ ${savedImages.length}/${totalImages} images saved`);
  }

  if (!imagesOnly) {
    const startFrames = savedImages.slice(0, totalVideos);
    console.log(`\nGenerating ${totalVideos} videos...`);
    let videoCount = 0;

    for (let i = 0; i < totalVideos; i++) {
      progress(i, totalVideos, `video ${i + 1}/${totalVideos}`);
      const sourceImage = startFrames[i];
      if (!sourceImage?.url) {
        console.warn(`\n[SKIP] video ${i + 1}: no source image`);
        continue;
      }

      try {
        const vid = await generateVideo({
          startImageUrl: sourceImage.url,
          setting: config.setting,
          motionIndex: i,
          duration: 5,
        });

        vid.url = await signAndUpload(vid.url);

        await saveVideo({
          setting: config.setting,
          tier: config.tier,
          mood: config.mood,
          url: vid.url,
          prompt: vid.prompt ?? config.prompt,
          batch_id,
          source_image_id: sourceImage.id,
          duration_seconds: 5,
        });
        videoCount++;
      } catch (err) {
        console.error(`\n[ERROR] video ${i + 1}: ${err.message}`);
      }

      if (i < totalVideos - 1) await sleep(3000);
    }
    progress(totalVideos, totalVideos, `videos done`);
    console.log(`\n✓ ${videoCount}/${totalVideos} videos saved`);
  }

  return { batch_id, images: savedImages.length };
}

async function main() {
  const { batch, imagesOnly, videosOnly, imagesCount, videosCount } = parseArgs();

  const targets = batch
    ? { [batch]: BATCHES[batch] }
    : BATCHES;

  if (batch && !BATCHES[batch]) {
    console.error(`Unknown batch: "${batch}". Valid: ${Object.keys(BATCHES).join(', ')}`);
    process.exit(1);
  }

  const results = [];
  for (const [name, config] of Object.entries(targets)) {
    const r = await runBatch(name, config, { imagesOnly, videosOnly, imagesCount, videosCount });
    results.push({ name, ...r });
  }

  console.log('\n\n=== SUMMARY ===');
  for (const r of results) {
    console.log(`  ${r.name}: batch_id=${r.batch_id} | images=${r.images}`);
  }
  console.log('Done.\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
