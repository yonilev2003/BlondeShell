#!/usr/bin/env node
// Run from YOUR terminal: node scripts/check_fanvue_media.mjs
import 'dotenv/config';

const BASE = 'https://api.fanvue.com';
const HEADERS = {
  'Authorization': `Bearer ${process.env.FANVUE_ACCESS_TOKEN}`,
  'X-Fanvue-API-Version': '2025-06-26',
};

const MEDIA_UUID = 'f6e188a0-bb9a-4491-b44c-528ba96f6b0d';

async function main() {
  console.log('\n━━━ Fanvue Media Diagnostic ━━━\n');
  console.log(`Token: ${process.env.FANVUE_ACCESS_TOKEN?.slice(0, 12)}...`);

  // 1. Check specific media UUID
  console.log(`\n1. Checking media UUID: ${MEDIA_UUID}`);
  const mediaRes = await fetch(`${BASE}/media/${MEDIA_UUID}`, { headers: HEADERS });
  console.log(`   Status: ${mediaRes.status}`);
  const mediaBody = await mediaRes.json().catch(() => ({}));
  console.log(`   Body: ${JSON.stringify(mediaBody).slice(0, 300)}`);

  // 2. List recent uploads
  console.log('\n2. Listing media library (last 10)');
  const listRes = await fetch(`${BASE}/media?limit=10&sort=createdAt:desc`, { headers: HEADERS });
  console.log(`   Status: ${listRes.status}`);
  const listBody = await listRes.json().catch(() => ({}));
  const items = listBody?.data ?? listBody?.media ?? listBody ?? [];
  if (Array.isArray(items)) {
    items.forEach(m => console.log(`   - ${m.uuid} | status: ${m.status} | type: ${m.mediaType} | created: ${m.createdAt?.slice(0,10)}`));
  } else {
    console.log(`   Body: ${JSON.stringify(listBody).slice(0, 300)}`);
  }

  // 3. List recent posts
  console.log('\n3. Listing posts (last 5)');
  const postsRes = await fetch(`${BASE}/posts?limit=5&sort=createdAt:desc`, { headers: HEADERS });
  console.log(`   Status: ${postsRes.status}`);
  const postsBody = await postsRes.json().catch(() => ({}));
  const posts = postsBody?.data ?? postsBody?.posts ?? [];
  if (Array.isArray(posts)) {
    posts.forEach(p => console.log(`   - ${p.uuid} | status: ${p.status} | audience: ${p.audience} | text: "${(p.text ?? '').slice(0,50)}"`));
  } else {
    console.log(`   Body: ${JSON.stringify(postsBody).slice(0, 300)}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
