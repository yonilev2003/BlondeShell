import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { schedulePost, verifyPostLive, getPlatformIds } from '../lib/publer.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getApprovedT1Image() {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, url, setting, mood')
    .eq('qa_status', 'approved')
    .eq('type', 'image')
    .eq('tier', 'T1')
    .limit(1)
    .single();

  if (error) throw new Error(`Failed to fetch image: ${error.message}`);
  return data;
}

async function main() {
  console.log('=== PUBLER DRY RUN ===\n');

  // Step 1: Get connected platform IDs
  console.log('Fetching connected Publer accounts...');
  const platforms = await getPlatformIds();
  console.log('Connected accounts:');
  console.log(`  instagram : ${platforms.instagram ?? '(not connected)'}`);
  console.log(`  tiktok    : ${platforms.tiktok ?? '(not connected)'}`);
  console.log(`  twitter   : ${platforms.twitter ?? '(not connected)'}`);

  const connected = Object.entries(platforms).filter(([, id]) => id !== null);
  if (!connected.length) {
    console.error('\nNo connected platforms found. Exiting.');
    process.exit(1);
  }

  // Step 2: Pick one approved T1 image
  console.log('\nFetching approved T1 image from Supabase...');
  const image = await getApprovedT1Image();
  console.log(`  id      : ${image.id}`);
  console.log(`  setting : ${image.setting}`);
  console.log(`  url     : ${image.url}`);

  // Step 3: Schedule to each connected platform for 5 min from now
  const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  console.log(`\nScheduling to ${connected.length} platform(s) at ${scheduledAt}...`);

  const caption = `✨ Golden hour vibes. #lifestyle #aesthetic #blonde`;
  const postIds = {};

  for (const [platform, platformId] of connected) {
    try {
      const postId = await schedulePost({
        platform,
        platformId,
        mediaUrl: image.url,
        caption,
        scheduledAt,
        isVideo: false,
      });
      postIds[platform] = postId;
      console.log(`  ✓ ${platform}: post_id = ${postId}`);
    } catch (err) {
      console.error(`  ✗ ${platform}: ${err.message}`);
    }
  }

  const scheduledCount = Object.keys(postIds).length;
  if (!scheduledCount) {
    console.error('\nNo posts scheduled. Exiting.');
    process.exit(1);
  }

  // Step 4: Wait 6 minutes
  console.log(`\nWaiting 6 minutes for posts to go live...`);
  for (let i = 6; i > 0; i--) {
    process.stdout.write(`\r  ${i} minute(s) remaining...   `);
    await sleep(60 * 1000);
  }
  console.log('\r  Done waiting.                ');

  // Step 5: Verify each post is live
  console.log('\nVerifying posts...');
  for (const [platform, postId] of Object.entries(postIds)) {
    try {
      const live = await verifyPostLive(postId);
      console.log(`  ${platform} (${postId}): ${live ? '✓ LIVE' : '✗ not live yet'}`);
    } catch (err) {
      console.error(`  ${platform} (${postId}): ✗ error — ${err.message}`);
    }
  }

  console.log('\n=== DRY RUN COMPLETE ===\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
