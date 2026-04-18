import { withRetry } from './retry.js';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import 'dotenv/config';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

const LOUDNESS_TARGETS = {
  social: { I: -14, TP: -1, LRA: 11 },
  dm: { I: -16, TP: -1, LRA: 7 },
};

const DEFAULTS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.4,
};

const DM_SETTINGS = {
  stability: 0.35,
  similarity_boost: 0.8,
  style: 0.6,
};

function getConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!voiceId) throw new Error('ELEVENLABS_VOICE_ID not set');
  return { apiKey, voiceId };
}

async function callTTS(text, voiceSettings) {
  const { apiKey, voiceId } = getConfig();

  const res = await fetch(`${ELEVENLABS_BASE}/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarity_boost,
        style: voiceSettings.style,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`ElevenLabs ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }

  return Buffer.from(await res.arrayBuffer());
}

async function normalizeLoudness(inputBuffer, target = 'social') {
  const { I, TP, LRA } = LOUDNESS_TARGETS[target];
  const inPath = join(tmpdir(), `voice_in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);
  const outPath = join(tmpdir(), `voice_out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp3`);

  writeFileSync(inPath, inputBuffer);

  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inPath,
      '-af', `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}`,
      '-codec:a', 'libmp3lame', '-b:a', '192k',
      outPath,
    ]);

    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });

    ff.on('error', (err) => {
      try { unlinkSync(inPath); } catch {}
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ff.on('close', (code) => {
      try { unlinkSync(inPath); } catch {}
      if (code !== 0) {
        return reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
      }
      const output = readFileSync(outPath);
      try { unlinkSync(outPath); } catch {}
      resolve(output);
    });
  });
}

export async function generateSpeech(text, options = {}) {
  const settings = {
    stability: options.stability ?? DEFAULTS.stability,
    similarity_boost: options.similarity_boost ?? DEFAULTS.similarity_boost,
    style: options.style ?? DEFAULTS.style,
  };

  const raw = await withRetry(() => callTTS(text, settings), {
    maxRetries: 3,
    baseDelayMs: 1000,
    label: 'generateSpeech',
  });

  if (options.normalize === false) return raw;
  return normalizeLoudness(raw, options.loudnessTarget ?? 'social');
}

export async function generateVoiceNote(text, options = {}) {
  const raw = await withRetry(() => callTTS(text, DM_SETTINGS), {
    maxRetries: 3,
    baseDelayMs: 1000,
    label: 'generateVoiceNote',
  });

  if (options.normalize === false) return raw;
  return normalizeLoudness(raw, 'dm');
}
