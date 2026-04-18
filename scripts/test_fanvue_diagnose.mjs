import 'dotenv/config';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { uploadMediaBuffer } from '../lib/fanvue.js';
import { convertToJpeg } from '../lib/image_convert.js';

console.log('\n━━━ Fanvue Upload Diagnostic ━━━\n');
console.log('Testing 3 variants to isolate failure:\n');

async function tryUpload(label, buffer, filename, mimeType) {
  console.log(`─── Test: ${label} ───`);
  console.log(`   Buffer: ${(buffer.length / 1024).toFixed(0)}KB`);
  console.log(`   Filename: ${filename}`);
  console.log(`   MimeType: ${mimeType}`);
  try {
    const uuid = await uploadMediaBuffer(buffer, filename, mimeType);
    console.log(`   ✅ SUCCESS — uuid: ${uuid}\n`);
    return { label, ok: true, uuid };
  } catch (err) {
    console.log(`   ❌ ${err.message.slice(0, 150)}\n`);
    return { label, ok: false, error: err.message };
  }
}

// Variant 1: raw PNG (as-is from fal.ai, 7MB)
console.log('Variant 1: Raw PNG (original fal.ai output)');
const pngBuffer = readFileSync('/tmp/blondeshell_test_3_beach_sunset_walk.png');
const r1 = await tryUpload('raw-png', pngBuffer, 'beach_raw.png', 'image/png');

// Variant 2: high-quality JPEG (95 quality, 2048px)
console.log('Variant 2: High-quality JPEG (95 quality)');
const hqJpeg = await convertToJpeg(pngBuffer, { maxWidth: 2048, quality: 95 });
const r2 = await tryUpload('hq-jpeg', hqJpeg, 'beach_hq.jpg', 'image/jpeg');

// Variant 3: lower resolution (1080px wide)
console.log('Variant 3: 1080px JPEG (IG-sized)');
const smallJpeg = await convertToJpeg(pngBuffer, { maxWidth: 1080, quality: 85 });
const r3 = await tryUpload('1080-jpeg', smallJpeg, 'beach_1080.jpg', 'image/jpeg');

console.log('\n━━━ Summary ━━━');
[r1, r2, r3].forEach(r => {
  console.log(`  ${r.ok ? '✅' : '❌'} ${r.label}: ${r.ok ? r.uuid : r.error.slice(0, 80)}`);
});

const anyOk = [r1, r2, r3].some(r => r.ok);
if (anyOk) {
  console.log('\n🎉 Found a working variant! Use that format going forward.');
} else {
  console.log('\n⚠️  All 3 variants failed. Next: ask Fanvue support about specific mediaUuids.');
}
