#!/usr/bin/env node
/**
 * E2E Fanvue multipart upload test
 *
 * Flow:
 *   1. Use /tmp image from test:fal, or fall back to public hero ref URL
 *   2. Upload via Fanvue 3-phase multipart → get mediaUuid
 *   3. Does NOT publish — just verifies upload pipeline works
 *
 * Usage: node scripts/test_fanvue_upload.mjs [path-to-image]
 */

import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { uploadMediaFromUrl, uploadMediaBuffer } from '../lib/fanvue.js';

const HERO_REF = 'https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/Hero_Dataset/closeup_T1_face_hero.png';

const imagePath = process.argv[2] ?? '/tmp/blondeshell_test_1_gym_mirror_selfie.png';

console.log('\n━━━ Fanvue Multipart Upload Test ━━━\n');

try {
  let mediaUuid;

  if (existsSync(imagePath)) {
    console.log(`Uploading local file: ${imagePath}`);
    const buffer = readFileSync(imagePath);
    console.log(`   Size: ${(buffer.length / 1024).toFixed(0)} KB`);

    const filename = imagePath.split('/').pop();
    const res = await uploadMediaBuffer(buffer, filename, 'image/png');
    mediaUuid = res?.mediaUuid ?? res?.uuid ?? res?.id ?? res;
  } else {
    console.log(`No local file at ${imagePath}, using hero ref URL`);
    console.log(`   ${HERO_REF}`);
    const res = await uploadMediaFromUrl(HERO_REF, 'test_hero_ref.png');
    mediaUuid = res?.mediaUuid ?? res?.uuid ?? res?.id ?? res;
  }

  if (!mediaUuid || typeof mediaUuid !== 'string') {
    throw new Error(`Upload returned unexpected value: ${JSON.stringify(mediaUuid).slice(0, 200)}`);
  }

  console.log('\n✅ Upload complete!');
  console.log(`   mediaUuid: ${mediaUuid}\n`);
  console.log('▶️  Verify in Fanvue Dashboard → Media tab');
  console.log('    If it appears there → multipart pipeline is fully functional.\n');

  process.exit(0);
} catch (err) {
  console.error(`\n❌ Upload failed: ${err.message}\n`);
  if (err.message.includes('401') || err.message.includes('403')) {
    console.error('   → Token may be expired. Run: npm run fanvue:auth');
  }
  process.exit(1);
}
