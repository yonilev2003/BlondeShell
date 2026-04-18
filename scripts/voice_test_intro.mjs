import 'dotenv/config';
import { writeFileSync } from 'fs';

const INTRO_TEXT = `Hey babes! So... I'm BlondeShell. Twenty-one, living in LA, and honestly my life is just chaos in the best way possible. I'm a total gym girl—obsessed with pilates and lifting. Gamer too, you'll catch me on Valorant way too late at night. My music taste? Basically Taylor, Sabrina, Doja on repeat. I post the unfiltered version of my life because I'm tired of the fake aesthetic thing, you know? Stick around, it gets fun. Oh, and maybe hit my DMs sometime—I actually reply.`;

// Count words for verification
const wordCount = INTRO_TEXT.split(/\s+/).length;
console.log(`\nScript: ${wordCount} words, ${INTRO_TEXT.length} characters`);
console.log(`Estimated credits: ~${INTRO_TEXT.length}\n`);
console.log('─── Script ───');
console.log(INTRO_TEXT);
console.log('───────────────\n');

console.log('Generating voice... this may take 10-30 seconds.');

const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'xi-api-key': process.env.ELEVENLABS_API_KEY,
  },
  body: JSON.stringify({
    text: INTRO_TEXT,
    model_id: 'eleven_multilingual_v2',
    output_format: 'mp3_44100_128',
    voice_settings: {
      stability: 0.45,
      similarity_boost: 0.75,
      style: 0.35,
      use_speaker_boost: true,
    },
  }),
});

if (!r.ok) {
  console.error(`❌ Failed: status ${r.status}`);
  console.error(await r.text());
  process.exit(1);
}

const buf = Buffer.from(await r.arrayBuffer());
const outPath = '/tmp/blondeshell_intro.mp3';
writeFileSync(outPath, buf);

console.log(`✅ Generated: ${buf.length} bytes → ${outPath}`);
console.log(`\n▶️  Play it:  open ${outPath}\n`);
