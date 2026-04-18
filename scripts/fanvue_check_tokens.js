/**
 * Quick verification that Fanvue OAuth completed successfully.
 * Reads tokens from Supabase and calls /creators/me to confirm they work.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('\n━━━ Fanvue Tokens Check ━━━\n');

const { data, error } = await supabase
  .from('fanvue_tokens')
  .select('*')
  .eq('id', 'singleton')
  .single();

if (error || !data) {
  console.error('❌ No tokens found in Supabase.');
  console.error(`   → Run: npm run fanvue:auth`);
  process.exit(1);
}

console.log(`✅ Row found (updated ${data.updated_at?.slice(0, 19)})`);
console.log(`   access_token : ${data.access_token?.slice(0, 20)}...`);
console.log(`   refresh_token: ${data.refresh_token?.slice(0, 20)}...`);
console.log(`   expires_at   : ${data.expires_at ?? '(not set)'}\n`);

if (!data.access_token) {
  console.error('❌ access_token missing — re-run: npm run fanvue:auth');
  process.exit(1);
}

// Call /creators/me to verify
console.log('Calling /creators/me to verify tokens work...');
try {
  const res = await fetch('https://api.fanvue.com/creators/me', {
    headers: {
      'Authorization': `Bearer ${data.access_token}`,
      'X-Fanvue-API-Version': '2025-06-26',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ /creators/me returned ${res.status}: ${body.slice(0, 200)}`);
    if (res.status === 401) console.error('   → Tokens may be expired. Re-run: npm run fanvue:auth');
    process.exit(1);
  }

  const me = await res.json();
  console.log('✅ /creators/me responded:\n');
  console.log(`   uuid    : ${me.uuid ?? me.id ?? '(not returned)'}`);
  console.log(`   handle  : ${me.handle ?? me.username ?? '(n/a)'}`);
  console.log(`   name    : ${me.name ?? me.displayName ?? '(n/a)'}\n`);

  if (me.uuid || me.id) {
    console.log('💡 Add to .env if not already there:');
    console.log(`   FANVUE_CREATOR_UUID=${me.uuid ?? me.id}\n`);
  }

  console.log('🟢 Fanvue is ready.\n');
} catch (err) {
  console.error(`❌ Network error: ${err.message}`);
  process.exit(1);
}
