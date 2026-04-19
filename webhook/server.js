import 'dotenv/config.js';
import express from 'express';
import crypto from 'crypto';
import cron from 'node-cron';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { supabase, logAgentAction } from '../lib/supabase.js';
import { withRetry } from '../lib/retry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Test mode — skip DB operations when running signature/unit tests without network.
const TEST_MODE = process.env.WEBHOOK_TEST_MODE === '1';

function runAgent(name) {
  const script = join(ROOT, 'agents', `${name}.js`);
  console.log(`[cron] starting ${name}`);
  const proc = spawn('node', [script], { stdio: 'inherit', cwd: ROOT });
  proc.on('error', (err) => console.error(`[cron] ${name} failed to start: ${err.message}`));
  proc.on('exit', (code) => console.log(`[cron] ${name} exited (${code})`));
}

function runLib(libFile, fnName, argsJson = '{}') {
  const expr = `import('./lib/${libFile}').then(m => m.${fnName}(${argsJson})).catch(e => { console.error(e); process.exit(1); })`;
  console.log(`[cron] starting lib/${libFile}#${fnName}`);
  const proc = spawn('node', ['-e', expr], { stdio: 'inherit', cwd: ROOT });
  proc.on('error', (err) => console.error(`[cron] lib/${libFile} failed to start: ${err.message}`));
  proc.on('exit', (code) => console.log(`[cron] lib/${libFile} exited (${code})`));
}

function runScript(name) {
  const script = join(ROOT, 'scripts', `${name}.py`);
  console.log(`[cron] starting script ${name}`);
  const proc = spawn('python3', [script], { stdio: 'inherit', cwd: ROOT, env: process.env });
  proc.on('error', (err) => console.error(`[cron] script ${name} failed to start: ${err.message}`));
  proc.on('exit', (code) => console.log(`[cron] script ${name} exited (${code})`));
}

const app = express();
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.FANVUE_WEBHOOK_SECRET || null;

// Preserve raw body for signature verification (JSON.stringify order can drift).
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// ── Retry helper for Supabase ops ─────────────────────────────────────────────
// Wraps a Supabase thenable so .error rejects and triggers the retry backoff.
function sbRetry(thunk, label, reqId) {
  if (TEST_MODE) return Promise.resolve({ data: null, error: null });
  return withRetry(async () => {
    const result = await thunk();
    if (result?.error) throw new Error(result.error.message || 'supabase error');
    return result;
  }, { maxRetries: 3, baseDelayMs: 500, label: `${label}${reqId ? ` req=${reqId}` : ''}` });
}

// ── Rate limiter: 10 message.received per 60s per subscriber_id ───────────────
const DM_RATE_WINDOW_MS = 60_000;
const DM_RATE_MAX = 10;
const dmRateMap = new Map(); // subscriber_id -> number[] of timestamps

function checkDmRateLimit(subscriberId) {
  const now = Date.now();
  const cutoff = now - DM_RATE_WINDOW_MS;
  const arr = (dmRateMap.get(subscriberId) || []).filter(ts => ts > cutoff);
  if (arr.length >= DM_RATE_MAX) {
    dmRateMap.set(subscriberId, arr);
    return false;
  }
  arr.push(now);
  dmRateMap.set(subscriberId, arr);
  return true;
}

// Periodic cleanup of stale rate-limit entries (skip in test mode).
if (!TEST_MODE) {
  setInterval(() => {
    const cutoff = Date.now() - DM_RATE_WINDOW_MS;
    for (const [k, arr] of dmRateMap) {
      const pruned = arr.filter(ts => ts > cutoff);
      if (pruned.length === 0) dmRateMap.delete(k);
      else dmRateMap.set(k, pruned);
    }
  }, DM_RATE_WINDOW_MS).unref();
}

// ── Idempotency key derivation ────────────────────────────────────────────────
function deriveIdempotencyKey(body) {
  if (body?.event_id) return String(body.event_id);
  const { event = '', data = {}, timestamp = '' } = body || {};
  const payload = `${event}|${data.subscriber_id || ''}|${timestamp}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// TODO migration: create table `webhook_events` (
//   idempotency_key text primary key,
//   event text not null,
//   received_at timestamptz default now()
// );
async function claimIdempotency(key, event, reqId) {
  if (TEST_MODE) return true;
  try {
    // insert-ignore: relies on PK conflict. duplicate → not-inserted → skip.
    const { data, error } = await supabase
      .from('webhook_events')
      .insert({ idempotency_key: key, event, received_at: new Date().toISOString() })
      .select('idempotency_key');
    if (error) {
      // 23505 = unique_violation → duplicate delivery
      if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
        console.log(`[webhook req=${reqId}] duplicate idempotency key ${key.slice(0, 12)}… — skipping`);
        return false;
      }
      // Do not fail the webhook because idempotency tracking misfired — log and proceed.
      console.warn(`[webhook req=${reqId}] idempotency insert failed: ${error.message}`);
      return true;
    }
    return !!data;
  } catch (err) {
    console.warn(`[webhook req=${reqId}] idempotency check error: ${err.message}`);
    return true; // fail-open to avoid dropping real events
  }
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'webhook', ts: new Date().toISOString() });
});

// ── Signature verification middleware (Day 3: FANVUE_WEBHOOK_SECRET) ──────────
function verifySignature(req, res, next) {
  if (!WEBHOOK_SECRET) return next(); // Secret not configured yet — pass through
  const sig = req.headers['x-fanvue-signature'] || req.headers['x-hub-signature-256'] || '';
  const bodyBuf = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(bodyBuf)
    .digest('hex');
  const sigBuf = Buffer.from(String(sig));
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn(`[webhook req=${req.reqId}] invalid signature`);
    return res.status(401).json({ error: 'invalid signature' });
  }
  next();
}

// ── Per-request ID middleware ─────────────────────────────────────────────────
app.use((req, _res, next) => {
  req.reqId = crypto.randomUUID().slice(0, 8);
  next();
});

// ── Fanvue webhook endpoint ───────────────────────────────────────────────────
app.post('/fanvue', verifySignature, async (req, res) => {
  const reqId = req.reqId;
  const { event, data } = req.body || {};

  if (!event || !data) {
    console.warn(`[webhook req=${reqId}] missing event or data`);
    return res.status(400).json({ error: 'missing event or data' });
  }

  console.log(`[webhook req=${reqId}] received event: ${event}`);

  // Rate limit message.received per subscriber before any DB work.
  if (event === 'message.received' && data.subscriber_id) {
    if (!checkDmRateLimit(data.subscriber_id)) {
      console.warn(`[webhook req=${reqId}] rate-limit exceeded for subscriber ${data.subscriber_id}`);
      return res.status(429).json({ error: 'rate limit exceeded', subscriber_id: data.subscriber_id });
    }
  }

  // Idempotency guard — drop silent duplicates with 200.
  const idemKey = deriveIdempotencyKey(req.body);
  const fresh = await claimIdempotency(idemKey, event, reqId);
  if (!fresh) {
    return res.json({ received: true, duplicate: true });
  }

  try {
    switch (event) {
      case 'subscriber.new':
        await handleNewSubscriber(data, reqId);
        break;
      case 'subscriber.cancelled':
        await handleSubscriberCancelled(data, reqId);
        break;
      case 'message.received':
        await handleDmReceived(data, reqId);
        break;
      case 'content.flagged':
        await handleContentFlagged(data, reqId);
        break;
      default:
        console.log(`[webhook req=${reqId}] unhandled event: ${event}`);
        if (!TEST_MODE) {
          await logAgentAction('webhook', event, 'partial', `unhandled event type: ${event}`);
        }
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`[webhook req=${reqId}] error handling ${event}: ${err.message}`);
    if (!TEST_MODE) {
      await logAgentAction('webhook', event, 'failed', err.message).catch(() => {});
    }
    res.status(500).json({ error: 'internal error' });
  }
});

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleNewSubscriber(data, reqId) {
  const { subscriber_id, acquisition_channel = 'unknown' } = data;

  // Duplicate check — quality gate #3
  const { data: existing } = await sbRetry(
    () => supabase.from('subscribers').select('fanvue_id').eq('fanvue_id', subscriber_id).maybeSingle(),
    'subscribers.select', reqId,
  );

  if (existing) {
    console.log(`[webhook req=${reqId}] subscriber ${subscriber_id} already exists — skipping`);
    if (!TEST_MODE) {
      await logAgentAction('webhook', 'subscriber.new', 'completed', `duplicate skip: ${subscriber_id}`);
    }
    return;
  }

  await sbRetry(
    () => supabase.from('subscribers').insert({
      fanvue_id: subscriber_id,
      acquisition_channel,
      status: 'active',
    }),
    'subscribers.insert', reqId,
  );

  // Queue welcome DM — R-006: within 5 min
  await sbRetry(
    () => supabase.from('dm_events').insert({
      subscriber_id,
      intent: 'welcome',
      script_trigger: 'S-001',
    }),
    'dm_events.insert.welcome', reqId,
  );

  if (!TEST_MODE) {
    await logAgentAction('webhook', 'subscriber.new', 'completed', `new sub: ${subscriber_id} via ${acquisition_channel}`);
  }
  console.log(`[webhook req=${reqId}] new subscriber ${subscriber_id} — welcome DM queued`);
}

async function handleSubscriberCancelled(data, reqId) {
  const { subscriber_id } = data;

  await sbRetry(
    () => supabase.from('subscribers').update({ status: 'churned' }).eq('fanvue_id', subscriber_id),
    'subscribers.update.churned', reqId,
  );

  if (!TEST_MODE) {
    await logAgentAction('webhook', 'subscriber.cancelled', 'completed', `churned: ${subscriber_id}`);
  }
  console.log(`[webhook req=${reqId}] subscriber ${subscriber_id} marked churned`);
}

async function handleDmReceived(data, reqId) {
  const { subscriber_id, message_text = '', intent = 'standard' } = data;

  const { data: sub } = await sbRetry(
    () => supabase.from('subscribers').select('dm_count, churn_risk').eq('fanvue_id', subscriber_id).maybeSingle(),
    'subscribers.select.dm', reqId,
  );

  const dmCount = (sub?.dm_count || 0) + 1;

  // Update subscriber DM count + last active
  await sbRetry(
    () => supabase.from('subscribers').upsert({
      fanvue_id: subscriber_id,
      dm_count: dmCount,
      last_dm_opened: new Date().toISOString(),
    }, { onConflict: 'fanvue_id' }),
    'subscribers.upsert.dm', reqId,
  );

  // Detect video keyword — R-011
  const videoKeywords = ['video', 'clip', 'vid', 'watch', 'moving'];
  const isVideoRequest = videoKeywords.some(kw => message_text.toLowerCase().includes(kw));
  const scriptTrigger = isVideoRequest ? 'S-006' : resolveScriptTrigger(intent, dmCount);

  await sbRetry(
    () => supabase.from('dm_events').insert({
      subscriber_id,
      intent,
      script_trigger: scriptTrigger,
      ppv_price: resolvePpvPrice(intent, isVideoRequest),
    }),
    'dm_events.insert.received', reqId,
  );

  if (!TEST_MODE) {
    await logAgentAction('webhook', 'message.received', 'completed',
      `sub: ${subscriber_id} intent: ${intent} script: ${scriptTrigger}`);
  }
  console.log(`[webhook req=${reqId}] DM recorded sub=${subscriber_id} script=${scriptTrigger}`);
}

async function handleContentFlagged(data, reqId) {
  const { post_id, reason } = data;

  // RED ALERT: Fanvue content flagged → pause all posts
  await sbRetry(
    () => supabase.from('posts').update({ status: 'rejected', rejection_reason: reason }).eq('id', post_id),
    'posts.update.flagged', reqId,
  );

  if (!TEST_MODE) {
    await logAgentAction('webhook', 'content.flagged', 'failed',
      `RED ALERT — post ${post_id} flagged: ${reason}`);
  }

  console.error(`[webhook req=${reqId}] RED ALERT: post ${post_id} flagged — ${reason}. Manual review required.`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveScriptTrigger(intent, dmCount) {
  if (dmCount >= 3 && intent === 'standard') return 'S-002'; // R-007: warmup after 3
  switch (intent) {
    case 'bold':    return 'S-005';
    case 'warm':    return 'S-004';
    default:        return 'S-003';
  }
}

function resolvePpvPrice(intent, isVideo) {
  if (isVideo) return 20;
  switch (intent) {
    case 'bold': return 25;
    case 'warm': return 15;
    default:     return 10;
  }
}

// ── Fanvue OAuth callback ─────────────────────────────────────────────────────
app.get('/fanvue-callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.error(`[fanvue-callback] OAuth error: ${error}`);
    return res.send(`<h2>❌ Auth error: ${error}</h2>`);
  }

  if (!code) {
    return res.send('<h2>❌ No code received.</h2>');
  }

  try {
    // Retrieve stored PKCE verifier and state from Supabase
    const { data: stored, error: fetchErr } = await supabase
      .from('fanvue_tokens')
      .select('pkce_verifier, pkce_state')
      .eq('id', 'singleton')
      .single();

    if (fetchErr || !stored?.pkce_verifier) {
      throw new Error('No PKCE verifier found — run npm run fanvue:auth first');
    }

    if (state && stored.pkce_state && state !== stored.pkce_state) {
      throw new Error('State mismatch — possible CSRF. Run fanvue:auth again.');
    }

    // Exchange code for tokens — Basic Auth required by Fanvue
    const basicAuth = Buffer.from(
      `${process.env.FANVUE_CLIENT_ID}:${process.env.FANVUE_CLIENT_SECRET}`
    ).toString('base64');

    const params = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri: 'https://hopeful-freedom-production-554a.up.railway.app/fanvue-callback',
      code_verifier: stored.pkce_verifier,
    });

    const tokenRes = await fetch('https://auth.fanvue.com/oauth2/token', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: params.toString(),
    });

    const body = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed (${tokenRes.status}): ${body.error_description ?? body.error ?? JSON.stringify(body)}`);
    }

    const { access_token, refresh_token } = body;

    // Save tokens to Supabase fanvue_tokens table
    const { error: saveErr } = await supabase
      .from('fanvue_tokens')
      .upsert({
        id:            'singleton',
        access_token,
        refresh_token,
        pkce_verifier: null,
        pkce_state:    null,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'id' });

    if (saveErr) throw new Error(`Failed to save tokens: ${saveErr.message}`);

    console.log('[fanvue-callback] ✅ Tokens saved to Supabase');
    console.log(`  access_token:  ${access_token?.slice(0, 30)}...`);
    console.log(`  refresh_token: ${refresh_token?.slice(0, 30)}...`);

    res.send(`
      <h2>✅ Fanvue Authorization Complete!</h2>
      <p>Tokens saved to Supabase. You can close this tab.</p>
      <pre>access_token:  ${access_token?.slice(0, 20)}...
refresh_token: ${refresh_token?.slice(0, 20)}...</pre>
    `);
  } catch (err) {
    console.error(`[fanvue-callback] ERROR: ${err.message}`);
    res.status(500).send(`<h2>❌ Error</h2><pre>${err.message}</pre>`);
  }
});

// ── Agent cron schedule v5.2 (all times UTC) ────────────────────────────────
// Skip cron registration in test mode — we only want HTTP behaviour under test.
if (!TEST_MODE) {
  cron.schedule('0 3  * * *',   () => runAgent('revenue_agent'));
  cron.schedule('0 4  * * *',   () => runLib('pipeline.js', 'runDailyPipeline', '{}, { imageCount: 3, videoCount: 1 }'));
  cron.schedule('0 6  * * *',   () => runAgent('learning_agent'));
  cron.schedule('0 8  * * 1',   () => runLib('inspiration_engine.js', 'generateCreativeBrief', "{ arcId: 'arc_001' }"));
  cron.schedule('0 10 * * *',   () => runAgent('marketing_agent'));
  cron.schedule('0 11 1 * *',   () => runAgent('strategy_agent'));
  cron.schedule('0 12 1 * *',   () => runAgent('tool_eval_agent'));  // monthly, after strategy
  cron.schedule('0 12 * * *',   () => runAgent('coo_agent'));
  cron.schedule('0 13 * * *',   () => runAgent('trends_agent'));
  cron.schedule('0 15 * * 1,3,5', () => runLib('vlog.js', 'generateVlog', "{ arcId: 'arc_001' }, { duration: 30 }"));
  cron.schedule('0 19 * * *',   () => runAgent('learning_agent'));
  cron.schedule('0 2  * * 1',   () => runAgent('plan_update_agent'));

  // Every 30min for first 6h after posting — viral post checker
  // Thresholds: 5K/2h = warming up, 10K/2h = viral, 50K/2h = breakout
  cron.schedule('*/30 * * * *', async () => {
    try {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: posts, error } = await supabase
        .from('post_analytics')
        .select('id, post_id, platform, impressions, posted_at')
        .eq('viral_flagged', false)
        .gte('impressions', 5000)
        .gte('posted_at', sixHoursAgo);

      if (error) { console.error('[viral_check] query error:', error.message); return; }
      if (!posts?.length) return;

      for (const post of posts) {
        const level = post.impressions >= 50000 ? 'breakout' : post.impressions >= 10000 ? 'viral' : 'warming';
        console.log(`[viral_check] 🔥 ${level.toUpperCase()}: ${post.post_id} — ${post.impressions} impressions`);

        await supabase.from('post_analytics').update({ viral_flagged: true }).eq('id', post.id);
        await logAgentAction('viral_check', 'viral_post_detected', 'completed',
          `${level}: ${post.post_id} hit ${post.impressions} impressions. Platform: ${post.platform}`);

        process.env.VIRAL_CONTEXT = level;
        process.env.VIRAL_POST_ID = post.post_id;

        runAgent('marketing_agent');
        runAgent('trends_agent');

        if (level === 'breakout') {
          // Breakout: fire ab_testing spin-offs + alert
          console.log(`[viral_check] 🚀 BREAKOUT detected — escalating to ab_testing`);
          process.env.VIRAL_SPINOFFS = '5';
          runAgent('marketing_agent');
        }
      }
    } catch (err) {
      console.error('[viral_check] unexpected error:', err.message);
    }
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
// Allow tests to import server without auto-listening.
const shouldListen = process.env.WEBHOOK_NO_LISTEN !== '1';
let server = null;
if (shouldListen) {
  server = app.listen(PORT, async () => {
    console.log(`[webhook] BlondeShell webhook server listening on :${PORT}`);
    if (!TEST_MODE) {
      await logAgentAction('webhook', 'server_start', 'completed', `listening on port ${PORT}`);
    }
  });
}

export { app, server };
