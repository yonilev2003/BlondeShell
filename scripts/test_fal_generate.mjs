import 'dotenv/config';
import { writeFileSync } from 'fs';
import { generateImage } from '../lib/generate_image.js';

const TESTS = [
  {
    name: 'gym_mirror_selfie',
    setting: 'gym',
    prompt: 'BlondeShell taking a mirror selfie in a modern LA gym, wearing a matching pastel pink sports bra and high-waisted leggings, phone in one hand covering part of her face. Bright morning light, post-workout glow, slightly sweaty skin. Gen Z aesthetic, soft shadows.',
  },
  {
    name: 'home_bedroom_casual',
    setting: 'home',
    prompt: 'BlondeShell lying on her bed in an aesthetic LA apartment, wearing an oversized white t-shirt and boy shorts, scrolling on her phone. Soft golden afternoon light through sheer curtains. Cozy, intimate, casual. Plants and fairy lights in background.',
  },
  {
    name: 'beach_sunset_walk',
    setting: 'beach',
    prompt: 'BlondeShell walking on Santa Monica beach at golden hour, wearing a white crochet bikini with denim shorts, hair flowing in the wind. Warm sunset lighting, ocean in background. Natural, candid energy, slight motion blur.',
  },
];

console.log(`\n━━━ fal.ai Image Generation Test ━━━\n`);
console.log(`Generating ${TESTS.length} images via Seedream v4.5...`);
console.log(`Expected cost: ~$0.06 (3 × $0.02)\n`);

const results = [];

for (let i = 0; i < TESTS.length; i++) {
  const t = TESTS[i];
  console.log(`[${i + 1}/${TESTS.length}] ${t.name}`);
  console.log(`   setting: ${t.setting}`);
  console.log(`   prompt: ${t.prompt.slice(0, 80)}...`);

  const start = Date.now();
  try {
    const img = await generateImage({
      setting: t.setting,
      tier: 'T1',
      mood: 'casual',
      promptCore: t.prompt,
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    // Download the image
    const imgRes = await fetch(img.url);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const localPath = `/tmp/blondeshell_test_${i + 1}_${t.name}.png`;
    writeFileSync(localPath, buf);

    console.log(`   ✅ Generated in ${elapsed}s`);
    console.log(`   URL: ${img.url}`);
    console.log(`   Saved: ${localPath}`);
    console.log(`   Size: ${(buf.length / 1024).toFixed(0)} KB\n`);

    results.push({ ...t, url: img.url, localPath, elapsed, ok: true });
  } catch (err) {
    console.error(`   ❌ Failed: ${err.message}\n`);
    results.push({ ...t, error: err.message, ok: false });
  }
}

console.log('━━━ Summary ━━━');
const ok = results.filter(r => r.ok).length;
console.log(`${ok}/${TESTS.length} images generated\n`);

if (ok > 0) {
  console.log('▶️  View all:');
  console.log(`   open /tmp/blondeshell_test_*.png\n`);
  console.log('Or individually:');
  results.filter(r => r.ok).forEach(r => console.log(`   open ${r.localPath}`));
  console.log();
}

writeFileSync('/tmp/fal_test_results.json', JSON.stringify(results, null, 2));
console.log('Full results: /tmp/fal_test_results.json\n');

process.exit(ok === TESTS.length ? 0 : 1);
