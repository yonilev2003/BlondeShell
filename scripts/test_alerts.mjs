#!/usr/bin/env node
/**
 * test_alerts.mjs — dry-run smoke test for lib/alerts.js.
 *
 * Fires one info, one warn, one red, and one daily digest to the console.
 * Requires ALERT_DRY_RUN=true so no real emails are sent and no Resend key
 * is required. Run via: npm run test:alerts
 */
import 'dotenv/config.js';

// Hard-enforce dry-run regardless of caller env, to guarantee no real sends.
process.env.ALERT_DRY_RUN = 'true';

// Provide stub Supabase env if missing so lib/supabase.js import doesn't throw.
// Dry-run never performs a real insert; failures are already try/caught.
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'http://localhost:54321';
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-key-for-dry-run';

const { sendAlert, sendRedAlert, sendDailyDigest } = await import('../lib/alerts.js');

const divider = () => console.log('\n' + '-'.repeat(72) + '\n');

console.log('[test_alerts] dry-run mode — no emails will be sent.\n');

divider();
console.log('[test_alerts] 1/4 info alert');
await sendAlert({
  level: 'info',
  title: 'Test info alert',
  body: 'This is a routine informational message. Nothing is on fire.',
  metadata: { sample: true, source: 'test_alerts.mjs' },
});

divider();
console.log('[test_alerts] 2/4 warn alert');
await sendAlert({
  level: 'warn',
  title: 'Test warning alert',
  body: 'Face similarity dipped below 0.85 on one recent item.',
  metadata: { count: 1, threshold: 0.85 },
});

divider();
console.log('[test_alerts] 3/4 red alert');
await sendRedAlert(
  'Test RED alert — simulated Fanvue flag',
  'Simulated: a Fanvue post was flagged. In production this would pause all publishing.',
  { simulated: true, post_ids: ['test-1', 'test-2'] }
);

divider();
console.log('[test_alerts] 4/4 daily digest');
await sendDailyDigest({
  to: 'owner@example.com',
  summary: 'Sample digest: pipeline healthy, 12 posts scheduled, 3 DMs converted.',
  metrics: {
    posts_scheduled: 12,
    dms_converted: 3,
    fanvue_subs: 47,
    estimated_daily_spend_usd: 4.82,
  },
  issues: [
    { level: 'warn', message: 'Substy health check latency elevated (avg 1.8s).' },
    { level: 'info', message: 'Brand Arc rotation due in 2 days.' },
  ],
});

divider();
console.log('[test_alerts] done. All four channels exercised in dry-run.');
