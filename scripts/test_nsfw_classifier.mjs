import 'dotenv/config';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { nsfwClassifyLocal } from '../lib/nsfw_classifier.js';

const DIR = process.env.NSFW_TEST_DIR ?? '/tmp/night_session';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const files = readdirSync(DIR).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
if (files.length === 0) {
  console.error(`No images found in ${DIR}`);
  process.exit(1);
}

console.log(`\n━━━ NSFW Classifier Test ━━━\nTesting ${files.length} images from ${DIR}\n`);

const results = [];
for (const file of files) {
  const path = join(DIR, file);
  const buffer = readFileSync(path);
  const storagePath = `nsfw-test/${Date.now()}_${file}`;
  await supabase.storage.from('content').upload(storagePath, buffer, { contentType: 'image/png', upsert: true });
  const { data: { publicUrl } } = supabase.storage.from('content').getPublicUrl(storagePath);

  const start = Date.now();
  const verdict = await nsfwClassifyLocal(publicUrl);
  const ms = Date.now() - start;

  const line = `${verdict.tier.padEnd(3)} (${verdict.confidence.toFixed(2)}) ${ms}ms — ${file}`;
  console.log(`  ${line}`);
  console.log(`     ${verdict.notes}`);
  results.push({ file, ...verdict, ms });
}

console.log('\n━━━ Summary ━━━');
const byTier = results.reduce((acc, r) => ({ ...acc, [r.tier]: (acc[r.tier] ?? 0) + 1 }), {});
console.log(`Tiers: ${JSON.stringify(byTier)}`);
const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);
console.log(`Avg latency: ${avgMs}ms  (Claude vision baseline: ~1500ms)`);
