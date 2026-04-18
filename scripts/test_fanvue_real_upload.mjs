import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { uploadMediaFromUrl } from '../lib/fanvue.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('\n━━━ Fanvue Real Upload Test ━━━\n');
console.log('This uploads 1 image to Fanvue media vault.');
console.log('NO post will be created — vault upload only.');
console.log('You can delete it later from app.fanvue.com → Media.\n');

// Use the beach image (same as Monday's post 3)
const supabaseUrl = 'https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/content/monday-launch/post_3_beach.png';

console.log(`Source: ${supabaseUrl}\n`);
console.log('Uploading to Fanvue vault...');

try {
  const mediaUuid = await uploadMediaFromUrl(supabaseUrl, 'fanvue_test_beach.png');
  console.log(`\n✅ Success!`);
  console.log(`   Media UUID: ${mediaUuid}`);
  console.log(`\n   The image is now in Fanvue's media vault.`);
  console.log(`   Check: app.fanvue.com → Media`);
  console.log(`   Next: we can use this uuid to create posts, mass messages, PPV offers.\n`);
} catch (err) {
  console.error(`\n❌ Upload failed: ${err.message}`);
  process.exit(1);
}
