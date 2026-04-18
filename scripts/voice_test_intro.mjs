import 'dotenv/config';
import { writeFileSync } from 'fs';
import { generateSpeech } from '../lib/voice.js';

const INTRO_TEXT = `Hey babes! So... I'm BlondeShell. Twenty-one, living in LA, and honestly my life is just chaos in the best way possible. I'm a total gym girl—obsessed with pilates and lifting. Gamer too, you'll catch me on Valorant way too late at night. My music taste? Basically Taylor, Sabrina, Doja on repeat. I post the unfiltered version of my life because I'm tired of the fake aesthetic thing, you know? Stick around, it gets fun. Oh, and maybe hit my DMs sometime—I actually reply.`;

const wordCount = INTRO_TEXT.split(/\s+/).length;
console.log(`\nScript: ${wordCount} words, ${INTRO_TEXT.length} characters`);
console.log(`Estimated credits: ~${INTRO_TEXT.length}\n`);

console.log('── Raw (no normalization) ──');
const raw = await generateSpeech(INTRO_TEXT, {
  stability: 0.45,
  similarity_boost: 0.75,
  style: 0.35,
  normalize: false,
});
writeFileSync('/tmp/blondeshell_intro_raw.mp3', raw);
console.log(`✅ Raw: ${raw.length} bytes → /tmp/blondeshell_intro_raw.mp3`);

console.log('\n── Normalized to -14 LUFS (TikTok/IG/YouTube standard) ──');
const normalized = await generateSpeech(INTRO_TEXT, {
  stability: 0.45,
  similarity_boost: 0.75,
  style: 0.35,
  loudnessTarget: 'social',
});
writeFileSync('/tmp/blondeshell_intro_loud.mp3', normalized);
console.log(`✅ Loud: ${normalized.length} bytes → /tmp/blondeshell_intro_loud.mp3`);

console.log(`\n▶️  Compare:`);
console.log(`   open /tmp/blondeshell_intro_raw.mp3`);
console.log(`   open /tmp/blondeshell_intro_loud.mp3\n`);
