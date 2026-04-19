#!/usr/bin/env node
/**
 * scripts/test_webhook_signature.mjs
 *
 * Exercises the /fanvue webhook endpoint WITHOUT hitting Supabase.
 *
 * Cases:
 *   1) FANVUE_WEBHOOK_SECRET set + valid signature       → 200
 *   2) FANVUE_WEBHOOK_SECRET set + invalid signature     → 401
 *   3) FANVUE_WEBHOOK_SECRET unset (no secret)           → 200 (pass-through)
 *
 * Runs the server on a random port, spawned as a child process so we can
 * control env (WEBHOOK_TEST_MODE + stub Supabase creds + port=0). The server
 * prints its bound port to stdout; we parse it, fire requests, assert status.
 *
 * Exit 0 on success, 1 on any assertion failure.
 */

import { spawn } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import net from 'net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SERVER_PATH = join(ROOT, 'webhook', 'server.js');

// ── helpers ───────────────────────────────────────────────────────────────────

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function waitForHealth(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return true;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`server did not come up on port ${port} within ${timeoutMs}ms`);
}

function startServer({ port, secret }) {
  const env = {
    ...process.env,
    PORT: String(port),
    WEBHOOK_TEST_MODE: '1',
    // Stub Supabase env so lib/supabase.js import doesn't throw.
    SUPABASE_URL: 'http://stub.local',
    SUPABASE_SERVICE_ROLE_KEY: 'stub-key',
  };
  if (secret) env.FANVUE_WEBHOOK_SECRET = secret;
  else delete env.FANVUE_WEBHOOK_SECRET;

  const proc = spawn('node', [SERVER_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
  });
  proc.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[server:err] ${d}`));
  return proc;
}

async function stopServer(proc) {
  if (!proc || proc.killed) return;
  proc.kill('SIGTERM');
  // give it up to 2s to exit cleanly
  await new Promise(resolve => {
    const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 2000);
    proc.on('exit', () => { clearTimeout(t); resolve(); });
  });
}

async function post(port, body, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/fanvue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
  return res;
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`ASSERT FAIL ${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`  ✓ ${label} (got ${actual})`);
}

// ── test cases ────────────────────────────────────────────────────────────────

async function runCase({ name, secret, sendSig, expect, tweakBody = false }) {
  console.log(`\n── ${name} ───────────────────────────────────`);
  const port = await pickFreePort();
  const proc = startServer({ port, secret });
  try {
    await waitForHealth(port);

    // Unique event_id per case so idempotency never collides if test mode is bypassed.
    const payload = {
      event: 'subscriber.new',
      event_id: `test-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      data: { subscriber_id: `sub_${Math.random().toString(16).slice(2, 10)}`, acquisition_channel: 'test' },
      timestamp: new Date().toISOString(),
    };
    const rawBody = JSON.stringify(payload);
    // Optional: corrupt body AFTER signing → produces invalid-sig case cleanly.
    const bodyToSend = tweakBody ? rawBody.replace('subscriber.new', 'subscriber.new ') : rawBody;

    const headers = {};
    if (sendSig && secret) {
      headers['x-fanvue-signature'] = sign(rawBody, sendSig === 'wrong' ? `${secret}-wrong` : secret);
    }

    const res = await post(port, bodyToSend, headers);
    assertEq(res.status, expect, `${name} status`);
  } finally {
    await stopServer(proc);
  }
}

async function main() {
  let failures = 0;

  const secret = 'test-secret-' + crypto.randomBytes(8).toString('hex');

  const cases = [
    { name: 'valid-signature',  secret, sendSig: 'valid', expect: 200 },
    { name: 'invalid-signature', secret, sendSig: 'wrong', expect: 401 },
    { name: 'no-secret-configured', secret: null, sendSig: null, expect: 200 },
  ];

  for (const c of cases) {
    try {
      await runCase(c);
    } catch (err) {
      console.error(`  ✗ ${c.name}: ${err.message}`);
      failures++;
    }
  }

  console.log('\n────────────────────────────────────────');
  if (failures) {
    console.error(`FAILED: ${failures}/${cases.length} case(s)`);
    process.exit(1);
  } else {
    console.log(`PASSED: ${cases.length}/${cases.length} case(s)`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('test runner crashed:', err);
  process.exit(1);
});
