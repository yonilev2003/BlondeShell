import 'dotenv/config';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { uploadMediaFromUrl } from '../lib/fanvue.js';
import { convertToJpeg } from '../lib/image_convert.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('\n━━━ Fanvue Real Upload Test ━━━\n');
console.log('Uploads 1 image to Fanvue media vault.');
console.log('Converts PNG → optimized JPEG first (Fanvue prefers JPEG <5MB).\n');

const localPng = '/tmp/blondeshell_test_3_beach_sunset_walk.png';

// Step 1: Convert to JPEG
console.log('1. Converting PNG → JPEG (max 2048px, quality 85)...');
const pngSize = (statSync(localPng).size / 1024 / 1024).toFixed(2);
const pngBuf = readFileSync(localPng);
const jpgBuf = await convertToJpeg(pngBuf, { maxWidth: 2048, quality: 85 });
const jpgPath = '/tmp/blondeshell_fanvue_test.jpg';
writeFileSync(jpgPath, jpgBuf);
const jpgSize = (jpgBuf.length / 1024 / 1024).toFixed(2);
console.log(`   ✅ ${pngSize}MB PNG → ${jpgSize}MB JPEG`);

// Step 2: Upload JPEG to Supabase (Fanvue needs a public URL)
console.log('\n2. Uploading JPEG to Supabase storage...');
const storagePath = `fanvue-tests/beach_${Date.now()}.jpg`;
const { error: upErr } = await supabase.storage
  .from('content')
  .upload(storagePath, jpgBuf, { contentType: 'image/jpeg', upsert: true });
if (upErr) {
  console.error(`   ❌ Supabase upload failed: ${upErr.message}`);
  process.exit(1);
}
const { data: { publicUrl } } = supabase.storage.from('content').getPublicUrl(storagePath);
console.log(`   ✅ ${publicUrl}`);

// Step 3: Upload to Fanvue
console.log('\n3. Uploading to Fanvue vault...');
try {
  const mediaUuid = await uploadMediaFromUrl(publicUrl, 'fanvue_test_beach.jpg');
  console.log(`\n✅ Success!`);
  console.log(`   Media UUID: ${mediaUuid}`);
  console.log(`\n   Image is in Fanvue vault. Check: app.fanvue.com → Media\n`);

  // Cleanup Supabase test file
  await supabase.storage.from('content').remove([storagePath]);
  console.log(`   Cleaned up Supabase temp file.\n`);
} catch (err) {
  console.error(`\n❌ Fanvue upload failed: ${err.message}`);
  process.exit(1);
}
