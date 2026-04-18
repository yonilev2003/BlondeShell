import 'dotenv/config';
import { getWorkspaceId } from '../lib/publer.js';

const workspaceId = await getWorkspaceId();
const headers = {
  'Authorization': `Bearer-API ${process.env.Publer_API}`,
  'Publer-Workspace-Id': workspaceId,
};

// Job IDs from the schedule_monday.mjs run
const JOBS = [
  { theme: 'gym', platform: 'tiktok',    jobId: '69e356229b0ea3b3576abe21' },
  { theme: 'gym', platform: 'instagram', jobId: '69e356229b0ea3b3576abe22' },
  { theme: 'home', platform: 'tiktok',    jobId: '69e35624950fe07a6e4d390d' },
  { theme: 'home', platform: 'instagram', jobId: '69e3562472f6ca265f7a9ded' },
  { theme: 'beach', platform: 'tiktok',    jobId: '69e35625018de1f4316a5861' },
  { theme: 'beach', platform: 'instagram', jobId: '69e35625950fe07a6e4d3915' },
];

console.log('\n━━━ Verify Publer Schedule Status ━━━\n');

// 1. Check each job status
console.log('Checking job statuses...');
for (const job of JOBS) {
  try {
    const res = await fetch(`https://app.publer.com/api/v1/job_status/${job.jobId}`, { headers });
    const data = await res.json();
    console.log(`  ${job.theme.padEnd(6)} ${job.platform.padEnd(10)} ${job.jobId}`);
    console.log(`    status: ${data.status || JSON.stringify(data).slice(0, 100)}`);
    if (data.payload) console.log(`    details: ${JSON.stringify(data.payload).slice(0, 200)}`);
  } catch (err) {
    console.log(`  ${job.theme}/${job.platform}: ERROR ${err.message}`);
  }
}

console.log('\n─── Listing all scheduled posts ───');
const res = await fetch(`https://app.publer.com/api/v1/posts?state=scheduled&limit=50`, { headers });
const body = await res.json();
console.log(`Status: ${res.status}`);

const posts = body.posts || body.data || body || [];
const arr = Array.isArray(posts) ? posts : [];

if (arr.length === 0) {
  console.log(`⚠️  No scheduled posts found in API response.`);
  console.log(`Raw response (first 500 chars): ${JSON.stringify(body).slice(0, 500)}`);
} else {
  console.log(`✅ ${arr.length} scheduled posts found:\n`);
  arr.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.scheduled_at || p.scheduledAt || 'no date'} | ${p.networks?.[0] || p.network || '?'} | ${(p.text || p.caption || '').slice(0, 60)}`);
  });
}
