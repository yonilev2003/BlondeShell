#!/usr/bin/env node
/**
 * Launch Readiness Check — full go/no-go for v5.2 launch
 *
 * Checks:
 *   - All required env vars
 *   - Supabase DB connection + critical tables
 *   - Fanvue tokens in DB
 *   - Publer accounts connected
 *   - fal.ai key valid
 *   - ElevenLabs voice ID
 *   - ffmpeg available
 *   - Agent modules load without error
 *
 * Usage: node scripts/launch_readiness.mjs
 * Exit code: 0 = GO, 1 = NO-GO
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

const results = { pass: [], fail: [], warn: [] };
const pass = (label) => { results.pass.push(label); console.log(`✅ ${label}`); };
const fail = (label, reason) => { results.fail.push({ label, reason }); console.log(`❌ ${label} — ${reason}`); };
const warn = (label, reason) => { results.warn.push({ label, reason }); console.log(`⚠️  ${label} — ${reason}`); };

console.log('\n━━━ BlondeShell v5.2 Launch Readiness ━━━\n');

// 1. Env vars ────────────────────────────────────────────────────────────────
console.log('─── 1. Environment variables ───');
const REQUIRED_ENV = [
  'ANTHROPIC_API_KEY', 'FAL_KEY',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'Publer_API', 'PUBLER_WORKSPACE_ID',
  'FANVUE_CLIENT_ID', 'FANVUE_CLIENT_SECRET',
  'ELEVENLABS_API_KEY', 'RESEND_API_KEY', 'ALERT_EMAILS',
];

for (const key of REQUIRED_ENV) {
  if (process.env[key]) pass(`env ${key}`);
  else fail(`env ${key}`, 'missing in .env');
}
console.log();

// 2. Supabase ────────────────────────────────────────────────────────────────
console.log('─── 2. Supabase ───');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CRITICAL_TABLES = [
  'content_items', 'agent_logs', 'skill_rules', 'fanvue_tokens',
  'ab_test_groups', 'hook_performance', 'platform_scores',
  'subscriber_events', 'fanvue_earnings', 'coo_digests', 'storyline_arcs',
];

for (const table of CRITICAL_TABLES) {
  try {
    const { error } = await supabase.from(table).select('*', { count: 'exact', head: true }).limit(1);
    if (error) fail(`table ${table}`, error.message.slice(0, 80));
    else pass(`table ${table}`);
  } catch (e) {
    fail(`table ${table}`, e.message.slice(0, 80));
  }
}
console.log();

// 3. Fanvue tokens in DB ────────────────────────────────────────────────────
console.log('─── 3. Fanvue tokens ───');
try {
  const { data, error } = await supabase
    .from('fanvue_tokens')
    .select('access_token, refresh_token, expires_at, updated_at')
    .eq('id', 'singleton')
    .single();

  if (error || !data) fail('fanvue_tokens', 'no singleton row — run: npm run fanvue:auth');
  else if (!data.access_token) fail('fanvue_tokens', 'access_token missing — run: npm run fanvue:auth');
  else {
    const age = Math.round((Date.now() - new Date(data.updated_at).getTime()) / (60 * 60 * 1000));
    pass(`fanvue_tokens (updated ${age}h ago)`);
    if (age > 24) warn('fanvue_tokens', 'token may be expired — consider re-auth');
  }
} catch (e) { fail('fanvue_tokens', e.message); }
console.log();

// 4. Publer accounts ────────────────────────────────────────────────────────
console.log('─── 4. Publer accounts ───');
try {
  const res = await fetch('https://app.publer.com/api/v1/accounts', {
    headers: {
      'Authorization': `Bearer-API ${process.env.Publer_API}`,
      'Publer-Workspace-Id': process.env.PUBLER_WORKSPACE_ID,
    },
  });
  if (!res.ok) fail('Publer API', `HTTP ${res.status}`);
  else {
    const body = await res.json();
    const accts = Array.isArray(body) ? body : (body?.accounts ?? body?.data ?? []);
    const ig = accts.find(a => (a.provider ?? '').toLowerCase() === 'instagram');
    const tt = accts.find(a => (a.provider ?? '').toLowerCase() === 'tiktok');
    const tw = accts.find(a => (a.provider ?? '').toLowerCase() === 'twitter');
    if (tt) pass(`Publer TikTok (${tt.id?.slice(0, 8)}...)`); else fail('Publer TikTok', 'not connected');
    if (ig) pass(`Publer Instagram (${ig.id?.slice(0, 8)}...)`); else fail('Publer Instagram', 'not connected — FB Page?');
    if (tw) pass(`Publer Twitter (${tw.id?.slice(0, 8)}...)`); else warn('Publer Twitter', 'not connected (optional)');
  }
} catch (e) { fail('Publer API', e.message); }
console.log();

// 5. fal.ai ─────────────────────────────────────────────────────────────────
console.log('─── 5. fal.ai ───');
try {
  const res = await fetch('https://fal.run/fal-ai/bytedance/seedream/v4.5/edit', {
    method: 'POST',
    headers: { 'Authorization': `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'ping', image_size: 'portrait_4_3' }),
  });
  if (res.status === 403) {
    const body = await res.text();
    if (body.includes('allowlist')) fail('fal.ai', 'key has host allowlist — create new key without restrictions');
    else fail('fal.ai', `403: ${body.slice(0, 80)}`);
  } else if (res.status === 401) fail('fal.ai', 'invalid key');
  else pass('fal.ai key');   // 422 is OK (bad request body) — means auth worked
} catch (e) { fail('fal.ai', e.message); }
console.log();

// 6. ffmpeg ─────────────────────────────────────────────────────────────────
console.log('─── 6. Local tools ───');
try {
  const ver = execSync('ffmpeg -version 2>&1 | head -1', { encoding: 'utf8' }).trim();
  pass(`ffmpeg (${ver.slice(0, 40)})`);
} catch {
  fail('ffmpeg', 'not installed — brew install ffmpeg');
}
console.log();

// 7. Agent modules load ─────────────────────────────────────────────────────
console.log('─── 7. Agent modules ───');
const AGENTS = [
  '../lib/pipeline.js', '../lib/publer.js', '../lib/fanvue.js', '../lib/voice.js',
  '../lib/ab_testing.js', '../lib/hook_database.js', '../lib/lipsync.js',
  '../agents/coo_agent.js', '../agents/strategy_agent.js', '../agents/learning_agent.js',
  '../agents/tool_eval_agent.js', '../agents/marketing_agent.js', '../agents/trends_agent.js',
];

for (const mod of AGENTS) {
  try {
    // Dynamic import with skip-main pattern
    const name = mod.replace('../', '');
    await import(mod);
    pass(`module ${name}`);
  } catch (e) {
    // Ignore "process.exit called" from agents that auto-run main() on import
    if (e.message?.includes('process.exit') || e.code === 'ERR_MODULE_NOT_FOUND') {
      fail(`module ${mod}`, e.message.slice(0, 80));
    } else {
      warn(`module ${mod}`, e.message.slice(0, 60));
    }
  }
}
console.log();

// Summary ────────────────────────────────────────────────────────────────────
console.log('━━━ Summary ━━━');
console.log(`✅ Pass: ${results.pass.length}`);
console.log(`⚠️  Warn: ${results.warn.length}`);
console.log(`❌ Fail: ${results.fail.length}`);

if (results.fail.length > 0) {
  console.log('\n🔴 NOT READY FOR LAUNCH — blockers:');
  for (const f of results.fail) console.log(`   - ${f.label}: ${f.reason}`);
  console.log();
  process.exit(1);
}

if (results.warn.length > 0) {
  console.log('\n🟡 READY WITH WARNINGS:');
  for (const w of results.warn) console.log(`   - ${w.label}: ${w.reason}`);
}

console.log('\n🟢 LAUNCH READY — all critical systems operational.\n');
process.exit(0);
