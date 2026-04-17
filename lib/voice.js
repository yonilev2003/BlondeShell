import { withRetry } from './retry.js';
import 'dotenv/config';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';

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

export async function generateSpeech(text, options = {}) {
  const settings = {
    stability: options.stability ?? DEFAULTS.stability,
    similarity_boost: options.similarity_boost ?? DEFAULTS.similarity_boost,
    style: options.style ?? DEFAULTS.style,
  };

  return withRetry(() => callTTS(text, settings), {
    maxRetries: 3,
    baseDelayMs: 1000,
    label: 'generateSpeech',
  });
}

export async function generateVoiceNote(text) {
  return withRetry(() => callTTS(text, DM_SETTINGS), {
    maxRetries: 3,
    baseDelayMs: 1000,
    label: 'generateVoiceNote',
  });
}
