/**
 * scripts/sign_c2pa.js — standalone smoke-test for C2PA signing
 *
 * Usage:
 *   npm run c2pa:test
 *   node scripts/sign_c2pa.js [url]
 *
 * With no args: pulls one approved image from content_items and signs it.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { signAndUpload } from '../lib/c2pa_sign.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const manualUrl = process.argv[2] ?? null;

  let sourceUrl = manualUrl;

  if (!sourceUrl) {
    console.log('Fetching one approved image from content_items...');
    const { data, error } = await supabase
      .from('content_items')
      .select('id, url')
      .eq('type', 'image')
      .eq('qa_status', 'approved')
      .limit(1)
      .single();

    if (error || !data) {
      console.error('No approved image found:', error?.message ?? 'empty');
      process.exit(1);
    }
    sourceUrl = data.url;
    console.log(`Source content_id: ${data.id}`);
  }

  console.log(`Source URL: ${sourceUrl}\n`);

  const signedUrl = await signAndUpload(sourceUrl);

  console.log(`\nSigned URL: ${signedUrl}`);
  console.log('\n✓ C2PA smoke-test passed');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
