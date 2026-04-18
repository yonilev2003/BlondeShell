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
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
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

async function fanvueFetch(path, accessToken, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) return { needsRefresh: true };

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Fanvue ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

console.log('\n━━━ Fanvue API Test ━━━\n');

// Step 1: Check tokens
console.log('1. Checking Fanvue tokens...');
let tokens;
try {
  tokens = await getTokens();
  console.log(`   ✅ Token found (${tokens.access_token.slice(0, 20)}...)\n`);
} catch (err) {
  console.error(`   ❌ ${err.message}`);
  process.exit(1);
}

// Step 2: Test API access (try profile endpoint)
console.log('2. Testing API access...');
let accessToken = tokens.access_token;

let profile = await fanvueFetch('/v1/creators/me', accessToken);
if (profile.needsRefresh) {
  console.log('   Token expired, refreshing...');
  try {
    accessToken = await refreshTokens(tokens.refresh_token);
    console.log('   ✅ Token refreshed');
    profile = await fanvueFetch('/v1/creators/me', accessToken);
  } catch (err) {
    console.error(`   ❌ Refresh failed: ${err.message}`);
    console.error('   Run: npm run fanvue:auth');
    process.exit(1);
  }
}

if (profile.needsRefresh) {
  console.error('   ❌ Still 401 after refresh. Run: npm run fanvue:auth');
  process.exit(1);
}

console.log(`   ✅ Fanvue API accessible`);
if (profile.data?.username) console.log(`   Profile: @${profile.data.username}`);
if (profile.data?.subscriber_count !== undefined) console.log(`   Subscribers: ${profile.data.subscriber_count}`);
console.log();

// Step 3: List recent posts
console.log('3. Fetching recent posts...');
try {
  const posts = await fanvueFetch('/v1/posts?limit=5', accessToken);
  const items = posts.data || posts.posts || [];
  console.log(`   ✅ ${items.length} recent posts found\n`);
} catch (err) {
  console.log(`   ⚠️ Posts endpoint: ${err.message}\n`);
}

console.log('━━━ Summary ━━━');
console.log('✅ Fanvue API is working');
console.log('ℹ️  Upload test skipped (to avoid creating real content)');
console.log('   Use the full pipeline to upload when ready.\n');
