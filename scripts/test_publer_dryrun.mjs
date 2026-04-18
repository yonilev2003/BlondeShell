import 'dotenv/config';
import { getWorkspaceId, getPlatformIds, schedulePost, verifyPostLive } from '../lib/publer.js';

console.log('\n━━━ Publer Dry Run ━━━\n');

// Step 1: Verify workspace
console.log('1. Fetching workspace...');
const wsId = await getWorkspaceId();
console.log(`   ✅ Workspace: ${wsId}\n`);

// Step 2: Get connected accounts
console.log('2. Fetching connected accounts...');
const accounts = await getPlatformIds();
console.log('   Connected:');
for (const [platform, info] of Object.entries(accounts)) {
  if (info) {
    console.log(`   ✅ ${platform}: ${info.id} (${info.networkKey})`);
  } else {
    console.log(`   ⬜ ${platform}: not connected`);
  }
}

const connected = Object.entries(accounts).filter(([, v]) => v);
if (connected.length === 0) {
  console.error('\n❌ No accounts connected. Connect TikTok/IG in Publer dashboard.');
  process.exit(1);
}

// Step 3: Schedule a draft post (set to far future, then we can delete)
console.log('\n3. Scheduling test post (draft, 7 days from now)...');

const testDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const scheduledAt = testDate.toISOString();

const testImageUrl = 'https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/Hero_Dataset/beach_T1_sunset_face.jpeg';

const results = [];

for (const [platform, info] of connected) {
  if (!info) continue;
  try {
    console.log(`   Scheduling to ${platform}...`);
    const jobId = await schedulePost({
      accountId: info.id,
      networkKey: info.networkKey,
      caption: '🏖️ test post — BlondeShell dry run. Will be deleted. #test',
      scheduledAt,
      mediaUrl: testImageUrl,
    });
    console.log(`   ✅ ${platform}: job ${jobId}`);
    results.push({ platform, jobId, ok: true });
  } catch (err) {
    console.log(`   ❌ ${platform}: ${err.message}`);
    results.push({ platform, error: err.message, ok: false });
  }
}

// Summary
const ok = results.filter(r => r.ok).length;
console.log(`\n━━━ Summary ━━━`);
console.log(`${ok}/${results.length} platforms scheduled successfully`);

if (ok > 0) {
  console.log(`\n⚠️  Test posts are scheduled 7 days from now.`);
  console.log(`   Go to app.publer.com → Scheduled → DELETE the test posts.`);
  console.log(`   Or they'll auto-publish in 7 days.\n`);
}

process.exit(ok > 0 ? 0 : 1);
