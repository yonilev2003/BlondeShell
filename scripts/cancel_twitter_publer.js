/**
 * scripts/cancel_twitter_publer.js
 * Cancels all scheduled Twitter posts in Publer for Apr 13–19, 2026.
 * Run once: node scripts/cancel_twitter_publer.js
 */
import 'dotenv/config';
import { getWorkspaceId } from '../lib/publer.js';

const BASE = 'https://app.publer.com/api/v1';

function headers(workspaceId) {
  return {
    'Authorization': `Bearer-API ${process.env.Publer_API}`,
    'Content-Type': 'application/json',
    'Publer-Workspace-Id': workspaceId,
  };
}

async function apiFetch(path, opts = {}, workspaceId) {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: headers(workspaceId) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Publer ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const workspaceId = await getWorkspaceId();
  console.log(`Workspace: ${workspaceId}`);

  // Fetch scheduled posts for the date range
  const from = '2026-04-13T00:00:00Z';
  const to   = '2026-04-19T23:59:59Z';

  const data = await apiFetch(
    `/posts?state=scheduled&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&per_page=100`,
    {},
    workspaceId
  );

  const posts = Array.isArray(data) ? data : (data?.posts ?? data?.data ?? []);
  console.log(`Total scheduled posts in window: ${posts.length}`);

  // Filter Twitter posts
  const twitterPosts = posts.filter(p => {
    const network = (p?.network_type ?? p?.type ?? p?.platform ?? '').toLowerCase();
    return network.includes('twitter') || network.includes('x');
  });

  console.log(`Twitter posts to cancel: ${twitterPosts.length}`);

  if (twitterPosts.length === 0) {
    console.log('Nothing to cancel.');
    return;
  }

  let cancelled = 0;
  let failed = 0;
  for (const post of twitterPosts) {
    const id = post?.id ?? post?.post_id;
    const scheduledAt = post?.scheduled_at ?? post?.publish_date ?? 'unknown';
    try {
      await apiFetch(`/posts/${id}`, { method: 'DELETE' }, workspaceId);
      console.log(`  ✓ Cancelled post ${id} scheduled ${scheduledAt}`);
      cancelled++;
    } catch (err) {
      console.error(`  ✗ Failed to cancel post ${id}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. Cancelled: ${cancelled} | Failed: ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
