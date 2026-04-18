#!/usr/bin/env node
/**
 * ElevenLabs voice test
 *
 * Generates 3 short test clips:
 *   1. Social post narration (-14 LUFS) → /tmp/voice_social.mp3
 *   2. DM voice note (-16 LUFS) → /tmp/voice_dm.mp3
 *   3. Vlog narration (30s, social loudness) → /tmp/voice_vlog.mp3
 *
 * Usage: node scripts/test_voice.mjs
 */

import 'dotenv/config';
import { writeFileSync, statSync } from 'fs';
import { generateSpeech, generateVoiceNote } from '../lib/voice.js';

const SOCIAL_SAMPLE = "hey, it's me! just finished pilates and i'm literally dying. anyway, check out what i'm up to today.";
const DM_SAMPLE = "heyyy thanks for following. i was just thinking about you. what are you up to tonight?";
const VLOG_SAMPLE = "okay so today was honestly one of those days where everything just clicked. morning pilates hit different, then matcha at this cute cafe on melrose, and now i'm manifesting my dream apartment. la life is actually insane.";

console.log('\n━━━ ElevenLabs Voice Test ━━━\n');

if (!process.env.ELEVENLABS_VOICE_ID) {
  console.error('❌ ELEVENLABS_VOICE_ID not set in .env');
  console.error('   Add: ELEVENLABS_VOICE_ID=briGJOLAce4pTnmxMbbi');
  process.exit(1);
}

console.log(`Voice ID: ${process.env.ELEVENLABS_VOICE_ID}\n`);

const tests = [
  { label: 'social', text: SOCIAL_SAMPLE, path: '/tmp/voice_social.mp3', fn: () => generateSpeech(SOCIAL_SAMPLE, { loudness: 'social' }) },
  { label: 'dm',     text: DM_SAMPLE,     path: '/tmp/voice_dm.mp3',     fn: () => generateVoiceNote(DM_SAMPLE) },
  { label: 'vlog',   text: VLOG_SAMPLE,   path: '/tmp/voice_vlog.mp3',   fn: () => generateSpeech(VLOG_SAMPLE, { loudness: 'social' }) },
];

let allOk = true;

for (const t of tests) {
  console.log(`─── ${t.label} ───`);
  console.log(`   text: "${t.text.slice(0, 60)}..."`);
  const start = Date.now();
  try {
    const buffer = await t.fn();
    writeFileSync(t.path, buffer);
    const sizeKB = (statSync(t.path).size / 1024).toFixed(0);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`   ✅ ${sizeKB} KB in ${elapsed}s → ${t.path}\n`);
  } catch (err) {
    console.error(`   ❌ ${err.message}\n`);
    allOk = false;
  }
}

console.log('━━━ Summary ━━━');
if (allOk) {
  console.log('✅ All 3 voice clips generated.\n');
  console.log('▶️  Listen with: afplay /tmp/voice_social.mp3 /tmp/voice_dm.mp3 /tmp/voice_vlog.mp3\n');
  process.exit(0);
} else {
  console.log('❌ Some clips failed. Check ELEVENLABS_API_KEY + credits.\n');
  process.exit(1);
}
