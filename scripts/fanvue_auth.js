/**
 * scripts/fanvue_auth.js — One-time Fanvue OAuth 2.0 PKCE authorization
 *
 * Run once: npm run fanvue:auth
 * → Saves PKCE verifier to Supabase → Opens browser → You approve
 * → Railway /fanvue-callback catches the code → Saves tokens to Supabase
 */

import crypto from 'crypto';
import { exec } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const CLIENT_ID     = process.env.FANVUE_CLIENT_ID;
const REDIRECT_URI  = 'https://hopeful-freedom-production-554a.up.railway.app/fanvue-callback';
const SCOPES        = 'read:self read:media read:post read:fan read:insights write:media write:post offline_access offline';
const AUTH_URL_BASE = 'https://auth.fanvue.com/oauth2/auth';

if (!CLIENT_ID) {
  console.error('❌ FANVUE_CLIENT_ID must be set in .env');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state         = crypto.randomBytes(16).toString('hex');

  // Save verifier + state to Supabase so Railway callback can retrieve them
  const { error } = await supabase
    .from('fanvue_tokens')
    .upsert({
      id:            'singleton',
      pkce_verifier: codeVerifier,
      pkce_state:    state,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('❌ Failed to save PKCE verifier to Supabase:', error.message);
    process.exit(1);
  }

  console.log('✅ PKCE verifier saved to Supabase');

  const authUrl = new URL(AUTH_URL_BASE);
  authUrl.searchParams.set('client_id',             CLIENT_ID);
  authUrl.searchParams.set('redirect_uri',          REDIRECT_URI);
  authUrl.searchParams.set('response_type',         'code');
  authUrl.searchParams.set('scope',                 SCOPES);
  authUrl.searchParams.set('code_challenge',        codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state',                 state);

  console.log('\n[fanvue_auth] Opening browser for Fanvue authorization...');
  console.log(`[fanvue_auth] Auth URL:\n${authUrl.toString()}\n`);

  exec(`open "${authUrl.toString()}"`, (err) => {
    if (err) {
      console.log('[fanvue_auth] Could not auto-open browser. Visit this URL manually:');
      console.log(authUrl.toString());
    }
  });

  console.log('👆 Approve in the browser.');
  console.log('   Railway will catch the callback and save your tokens to Supabase.');
  console.log('   Check Railway logs or run: node scripts/fanvue_check_tokens.js\n');
}

main().catch((err) => {
  console.error(`[fanvue_auth] FATAL: ${err.message}`);
  process.exit(1);
});
