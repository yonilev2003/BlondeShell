import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const API_BASE = 'https://api.fanvue.com';
const TOKEN_URL = 'https://auth.fanvue.com/oauth2/token';

async function getTokens() {
  const { data, error } = await supabase
    .from('fanvue_tokens')
    .select('access_token, refresh_token')
    .eq('id', 'singleton')
    .single();
  if (error || !data?.access_token) throw new Error('No Fanvue tokens — run: npm run fanvue:auth');
  return data;
}

async function refreshTokens(refreshToken) {
  const basicAuth = Buffer.from(
    `${process.env.FANVUE_CLIENT_ID}:${process.env.FANVUE_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }

  const { access_token, refresh_token } = await res.json();
  await supabase.from('fanvue_tokens').upsert({
    id: 'singleton',
    access_token,
    refresh_token: refresh_token || refreshToken,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  return access_token;
}

async function tryEndpoint(path, accessToken) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

console.log('\n━━━ Fanvue API Test ━━━\n');

// Step 1: Tokens
console.log('1. Checking Fanvue tokens...');
const tokens = await getTokens();
let accessToken = tokens.access_token;
console.log(`   ✅ Token loaded (${accessToken.slice(0, 20)}...)\n`);

// Step 2: Test a known working endpoint (/posts)
console.log('2. Testing /posts endpoint...');
let result = await tryEndpoint('/posts?limit=5', accessToken);

if (result.status === 401) {
  console.log('   Token expired, refreshing...');
  try {
    accessToken = await refreshTokens(tokens.refresh_token);
    console.log('   ✅ Token refreshed');
    result = await tryEndpoint('/posts?limit=5', accessToken);
  } catch (err) {
    console.error(`   ❌ Refresh failed: ${err.message}`);
    console.error('   Run: npm run fanvue:auth');
    process.exit(1);
  }
}

if (!result.ok) {
  console.error(`   ❌ /posts returned ${result.status}:`);
  console.error(`   ${JSON.stringify(result.body).slice(0, 200)}`);
  process.exit(1);
}

const posts = result.body.data || result.body.posts || result.body || [];
const count = Array.isArray(posts) ? posts.length : (result.body.total || 0);
console.log(`   ✅ /posts works — ${count} posts visible\n`);

// Step 3: Test /media endpoint (for uploads)
console.log('3. Testing /media endpoint...');
const mediaResult = await tryEndpoint('/media?limit=3', accessToken);
if (mediaResult.ok) {
  const media = mediaResult.body.data || mediaResult.body || [];
  console.log(`   ✅ /media works — ${Array.isArray(media) ? media.length : 0} items\n`);
} else {
  console.log(`   ⚠️  /media returned ${mediaResult.status} (may need scope)\n`);
}

console.log('━━━ Summary ━━━');
console.log('✅ Fanvue API works — token valid, endpoints accessible');
console.log('ℹ️  Ready for real uploads via lib/fanvue.js\n');
