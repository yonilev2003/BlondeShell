import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const results = {};
const log = (icon, label, msg) => console.log(`${icon} ${label.padEnd(20)} ${msg}`);

console.log('\n━━━ BlondeShell Health Check ━━━\n');

// 1. Anthropic
try {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'ping' }]
    })
  });
  const data = await r.json();
  results.anthropic = { ok: r.ok, status: r.status };
  log(r.ok ? '✅' : '❌', 'Anthropic', r.ok ? 'responding' : `status ${r.status}`);
} catch (e) {
  results.anthropic = { ok: false, error: e.message };
  log('❌', 'Anthropic', e.message);
}

// 2. Supabase
try {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from('agent_logs').select('id').limit(1);
  results.supabase = { ok: !error, error: error?.message };
  log(!error ? '✅' : '❌', 'Supabase', error ? error.message : 'connected');
} catch (e) {
  results.supabase = { ok: false, error: e.message };
  log('❌', 'Supabase', e.message);
}

// 3. fal.ai (via API check - attempt cheap call)
try {
  const r = await fetch('https://queue.fal.run/fal-ai/any-llm', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'google/gemini-flash-1.5', prompt: 'hi' })
  });
  results.falai = { ok: r.status === 200 || r.status === 202, status: r.status };
  log(r.ok || r.status === 202 ? '✅' : '❌', 'fal.ai', `status ${r.status}`);
} catch (e) {
  results.falai = { ok: false, error: e.message };
  log('❌', 'fal.ai', e.message);
}

// 4. Publer
try {
  const r = await fetch('https://app.publer.com/api/v1/users/me', {
    headers: {
      'Authorization': `Bearer-API ${process.env.Publer_API}`,
      'Publer-Workspace-Id': process.env.PUBLER_WORKSPACE_ID,
    }
  });
  const text = await r.text();
  let data = {}; try { data = JSON.parse(text); } catch {}
  results.publer = { ok: r.ok, status: r.status, email: data.email, name: data.name, raw: r.ok ? undefined : text.slice(0,200) };
  log(r.ok ? '✅' : '❌', 'Publer', r.ok ? `${data.email || 'connected'}` : `status ${r.status}`);
} catch (e) {
  results.publer = { ok: false, error: e.message };
  log('❌', 'Publer', e.message);
}

// 5. Publer — list connected accounts
try {
  const r = await fetch('https://app.publer.com/api/v1/accounts', {
    headers: {
      'Authorization': `Bearer-API ${process.env.Publer_API}`,
      'Publer-Workspace-Id': process.env.PUBLER_WORKSPACE_ID,
    }
  });
  const data = await r.json();
  const accounts = Array.isArray(data) ? data : (data.accounts || data.data || []);
  results.publer_accounts = { ok: r.ok, count: accounts.length, accounts: accounts.map(a => ({ provider: a.provider, username: a.username || a.name, id: a.id })) };
  log(r.ok ? '✅' : '❌', 'Publer accounts', `${accounts.length} connected`);
  accounts.forEach(a => console.log(`     └─ ${a.provider}: ${a.username || a.name}`));
} catch (e) {
  results.publer_accounts = { ok: false, error: e.message };
  log('❌', 'Publer accounts', e.message);
}

// 6. ElevenLabs — user + credits
try {
  const r = await fetch('https://api.elevenlabs.io/v1/user', {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
  });
  const data = await r.json();
  const used = data.subscription?.character_count;
  const limit = data.subscription?.character_limit;
  results.elevenlabs = { ok: r.ok, tier: data.subscription?.tier, used, limit };
  log(r.ok ? '✅' : '❌', 'ElevenLabs', r.ok ? `${data.subscription?.tier} — ${used}/${limit} credits` : `status ${r.status}`);
} catch (e) {
  results.elevenlabs = { ok: false, error: e.message };
  log('❌', 'ElevenLabs', e.message);
}

// 7. ElevenLabs — verify voice ID
try {
  const r = await fetch(`https://api.elevenlabs.io/v1/voices/${process.env.ELEVENLABS_VOICE_ID}`, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
  });
  const data = await r.json();
  results.voice = { ok: r.ok, name: data.name, category: data.category };
  log(r.ok ? '✅' : '❌', 'Voice ID', r.ok ? `"${data.name}" (${data.category})` : 'not found');
} catch (e) {
  results.voice = { ok: false, error: e.message };
  log('❌', 'Voice ID', e.message);
}

// 8. ElevenLabs — TTS test (small 10-char sample)
try {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: "Hey what's up, it's Shell!",
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128',
    })
  });
  if (r.ok) {
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync('/tmp/blondeshell_voice_test.mp3', buf);
    results.tts_test = { ok: true, bytes: buf.length, saved: '/tmp/blondeshell_voice_test.mp3' };
    log('✅', 'TTS test', `${buf.length} bytes → /tmp/blondeshell_voice_test.mp3`);
  } else {
    const text = await r.text();
    results.tts_test = { ok: false, status: r.status, error: text.slice(0,200) };
    log('❌', 'TTS test', `status ${r.status}: ${text.slice(0,80)}`);
  }
} catch (e) {
  results.tts_test = { ok: false, error: e.message };
  log('❌', 'TTS test', e.message);
}

// 9. Fanvue tokens
try {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase.from('fanvue_tokens').select('updated_at, access_token').eq('id', 'singleton').maybeSingle();
  const hasToken = !!data?.access_token;
  const age = data?.updated_at ? Math.round((Date.now() - new Date(data.updated_at).getTime()) / 3600000) : null;
  results.fanvue_tokens = { ok: hasToken, last_refresh: data?.updated_at, age_hours: age };
  log(hasToken ? '✅' : '⚠️', 'Fanvue token', hasToken ? `${age}h old` : 'missing — run: npm run fanvue:auth');
} catch (e) {
  results.fanvue_tokens = { ok: false, error: e.message };
  log('❌', 'Fanvue token', e.message);
}

// 10. Resend
try {
  const r = await fetch('https://api.resend.com/domains', {
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
  });
  results.resend = { ok: r.ok, status: r.status };
  log(r.ok ? '✅' : '❌', 'Resend', r.ok ? 'connected' : `status ${r.status}`);
} catch (e) {
  results.resend = { ok: false, error: e.message };
  log('❌', 'Resend', e.message);
}

// Summary
console.log('\n━━━ Summary ━━━');
const total = Object.keys(results).length;
const passed = Object.values(results).filter(r => r.ok).length;
console.log(`${passed}/${total} checks passed\n`);

const failed = Object.entries(results).filter(([_, r]) => !r.ok);
if (failed.length > 0) {
  console.log('Failures:');
  failed.forEach(([name, r]) => console.log(`  • ${name}: ${r.error || `status ${r.status}`}`));
  console.log();
}

writeFileSync('/tmp/health_check_results.json', JSON.stringify(results, null, 2));
console.log('Full results: /tmp/health_check_results.json\n');

process.exit(failed.length > 0 ? 1 : 0);
