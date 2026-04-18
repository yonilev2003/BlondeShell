import 'dotenv/config.js';
import express from 'express';
import crypto from 'crypto';
import cron from 'node-cron';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { supabase, logAgentAction } from '../lib/supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function runAgent(name) {
  const script = join(ROOT, 'agents', `${name}.js`);
  console.log(`[cron] starting ${name}`);
  const proc = spawn('node', [script], { stdio: 'inherit', cwd: ROOT });
  proc.on('error', (err) => console.error(`[cron] ${name} failed to start: ${err.message}`));
  proc.on('exit', (code) => console.log(`[cron] ${name} exited (${code})`));
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

app.use(express.json());

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'webhook', ts: new Date().toISOString() });
});

// ── Signature verification middleware (Day 3: FANVUE_WEBHOOK_SECRET) ──────────
function verifySignature(req, res, next) {
  if (!WEBHOOK_SECRET) return next(); // Secret not configured yet — pass through
  const sig = req.headers['x-fanvue-signature'] || req.headers['x-hub-signature-256'] || '';
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    console.warn('[webhook] invalid signature');
    return res.status(401).json({ error: 'invalid signature' });
  }
  next();
}

// ── Fanvue webhook endpoint ───────────────────────────────────────────────────
app.post('/fanvue', verifySignature, async (req, res) => {
  const { event, data } = req.body || {};

  if (!event || !data) {
    return res.status(400).json({ error: 'missing event or data' });
  }

  console.log(`[webhook] received event: ${event}`);

  try {
    switch (event) {
      case 'subscriber.new':
        await handleNewSubscriber(data);
        break;
      case 'subscriber.cancelled':
        await handleSubscriberCancelled(data);
        break;
      case 'message.received':
        await handleDmReceived(data);
        break;
      case 'content.flagged':
        await handleContentFlagged(data);
        break;
      default:
        console.log(`[webhook] unhandled event: ${event}`);
        await logAgentAction('webhook', event, 'partial', `unhandled event type: ${event}`);
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`[webhook] error handling ${event}:`, err.message);
    await logAgentAction('webhook', event, 'failed', err.message);
    res.status(500).json({ error: 'internal error' });
  }
});

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleNewSubscriber(data) {
  const { subscriber_id, acquisition_channel = 'unknown' } = data;

  // Duplicate check — quality gate #3
  const { data: existing } = await supabase
    .from('subscribers')
    .select('fanvue_id')
    .eq('fanvue_id', subscriber_id)
    .maybeSingle();

  if (existing) {
    console.log(`[webhook] subscriber ${subscriber_id} already exists — skipping`);
    await logAgentAction('webhook', 'subscriber.new', 'completed', `duplicate skip: ${subscriber_id}`);
    return;
  }

  await supabase.from('subscribers').insert({
    fanvue_id: subscriber_id,
    acquisition_channel,
    status: 'active',
  });

  // Queue welcome DM — R-006: within 5 min
  await supabase.from('dm_events').insert({
    subscriber_id,
    intent: 'welcome',
    script_trigger: 'S-001',
  });

  await logAgentAction('webhook', 'subscriber.new', 'completed', `new sub: ${subscriber_id} via ${acquisition_channel}`);
  console.log(`[webhook] new subscriber ${subscriber_id} — welcome DM queued`);
}

async function handleSubscriberCancelled(data) {
  const { subscriber_id } = data;

  await supabase
    .from('subscribers')
    .update({ status: 'churned' })
    .eq('fanvue_id', subscriber_id);

  await logAgentAction('webhook', 'subscriber.cancelled', 'completed', `churned: ${subscriber_id}`);
  console.log(`[webhook] subscriber ${subscriber_id} marked churned`);
}

async function handleDmReceived(data) {
  const { subscriber_id, message_text = '', intent = 'standard' } = data;

  const { data: sub } = await supabase
    .from('subscribers')
    .select('dm_count, churn_risk')
    .eq('fanvue_id', subscriber_id)
    .maybeSingle();

  const dmCount = (sub?.dm_count || 0) + 1;

  // Update subscriber DM count + last active
  await supabase
    .from('subscribers')
    .upsert({
      fanvue_id: subscriber_id,
      dm_count: dmCount,
      last_dm_opened: new Date().toISOString(),
    }, { onConflict: 'fanvue_id' });

  // Detect video keyword — R-011
  const videoKeywords = ['video', 'clip', 'vid', 'watch', 'moving'];
  const isVideoRequest = videoKeywords.some(kw => message_text.toLowerCase().includes(kw));
  const scriptTrigger = isVideoRequest ? 'S-006' : resolveScriptTrigger(intent, dmCount);

  await supabase.from('dm_events').insert({
    subscriber_id,
    intent,
    script_trigger: scriptTrigger,
    ppv_price: resolvePpvPrice(intent, isVideoRequest),
  });

  await logAgentAction('webhook', 'message.received', 'completed',
    `sub: ${subscriber_id} intent: ${intent} script: ${scriptTrigger}`);
}

async function handleContentFlagged(data) {
  const { post_id, reason } = data;

  // RED ALERT: Fanvue content flagged → pause all posts
  await supabase
    .from('posts')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', post_id);

  await logAgentAction('webhook', 'content.flagged', 'failed',
    `RED ALERT — post ${post_id} flagged: ${reason}`);

  console.error(`[webhook] RED ALERT: post ${post_id} flagged — ${reason}. Manual review required.`);
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
cron.schedule('0 3  * * *',   () => runAgent('revenue_agent'));
cron.schedule('0 4  * * *',   () => runAgent('pipeline'));
cron.schedule('0 6  * * *',   () => runAgent('learning_agent'));
cron.schedule('0 8  * * 1',   () => runAgent('inspiration_engine'));
cron.schedule('0 10 * * *',   () => runAgent('marketing_agent'));
cron.schedule('0 11 1 * *',   () => runAgent('strategy_agent'));
cron.schedule('0 12 1 * *',   () => runAgent('tool_eval_agent'));  // monthly, after strategy
cron.schedule('0 12 * * *',   () => runAgent('coo_agent'));
cron.schedule('0 13 * * *',   () => runAgent('trends_agent'));
cron.schedule('0 15 * * 1,3,5', () => runAgent('vlog_pipeline'));
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

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`[webhook] BlondeShell webhook server listening on :${PORT}`);
  await logAgentAction('webhook', 'server_start', 'completed', `listening on port ${PORT}`);
});
