import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { generateImage, REFERENCE_SETS } from '../lib/generate_image.js';
import { generateVideo } from '../lib/generate_video.js';
import { saveImage, saveVideo, updateQAStatus } from '../lib/supabase_content.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getRegenItems() {
  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('qa_status', 'regenerate')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch regen items: ${error.message}`);
  return data;
}

async function getApprovedSourceImage(batch_id) {
  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('batch_id', batch_id)
    .eq('type', 'image')
    .eq('qa_status', 'approved')
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

async function main() {
  const items = await getRegenItems();

  if (!items.length) {
    console.log('No items flagged for regeneration.');
    return;
  }

  console.log(`Found ${items.length} item(s) to regenerate.\n`);

  let success = 0;
  let failed = 0;

  for (const item of items) {
    console.log(`Regenerating ${item.type} | ${item.setting} | batch: ${item.batch_id} | id: ${item.id}`);

    try {
      if (item.type === 'image') {
        const img = await generateImage({
          setting: item.setting,
          tier: item.tier,
          mood: item.mood,
          referenceUrls: REFERENCE_SETS[item.setting],
          promptCore: item.prompt,
        });

        await saveImage({
          setting: item.setting,
          tier: item.tier,
          mood: item.mood,
          url: img.url,
          prompt: item.prompt,
          batch_id: item.batch_id,
        });

      } else if (item.type === 'video') {
        const sourceImage = await getApprovedSourceImage(item.batch_id);

        if (!sourceImage) {
          console.warn(`  [SKIP] No approved source image found for batch ${item.batch_id}`);
          failed++;
          continue;
        }

        const vid = await generateVideo({
          startImageUrl: sourceImage.url,
          setting: item.setting,
          motionIndex: Math.floor(Math.random() * 3),
          duration: item.duration_seconds ?? 5,
        });

        await saveVideo({
          setting: item.setting,
          tier: item.tier,
          mood: item.mood,
          url: vid.url,
          prompt: item.prompt,
          batch_id: item.batch_id,
          source_image_id: sourceImage.id,
          duration_seconds: item.duration_seconds ?? 5,
        });
      }

      await updateQAStatus(item.id, 'superseded');
      console.log(`  ✓ regenerated — original marked superseded`);
      success++;

    } catch (err) {
      console.error(`  ✗ failed: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== REGEN SUMMARY ===`);
  console.log(`  Success: ${success}`);
  console.log(`  Failed:  ${failed}`);
  console.log('Done.\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
