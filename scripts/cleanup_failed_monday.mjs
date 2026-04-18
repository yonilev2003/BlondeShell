import 'dotenv/config';

const BASE = 'https://app.publer.com/api/v1';
const headers = {
  'Authorization': `Bearer-API ${process.env.Publer_API}`,
  'Publer-Workspace-Id': process.env.PUBLER_WORKSPACE_ID,
};

console.log('\n━━━ Cleanup failed/unwanted posts ━━━\n');

// List scheduled + failed + draft posts to see what's cluttering
for (const state of ['scheduled', 'failed', 'draft']) {
  const res = await fetch(`${BASE}/posts?state=${state}&limit=50`, { headers });
  const body = await res.json();
  const posts = body.posts || [];
  console.log(`─── State: ${state} (${posts.length}) ───`);
  posts.forEach(p => {
    const text = (p.text || '').slice(0, 60);
    console.log(`  id=${p.id} | ${p.network || p.account_id} | ${p.scheduled_at || 'no date'} | ${text}`);
  });
  console.log();
}

console.log('To delete: DELETE /posts?post_ids[]=<id>&post_ids[]=<id>');
console.log('Or manually via Publer dashboard.\n');
