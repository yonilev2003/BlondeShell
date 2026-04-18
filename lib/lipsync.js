import { fal } from '@fal-ai/client';
import 'dotenv/config';

fal.config({ credentials: process.env.FAL_KEY });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Kling v3 Lipsync — Audio-to-Video
 * Takes an existing video + audio file → returns lip-synced video
 *
 * Constraints:
 *   - Video: .mp4/.mov, ≤100MB, 2–10s, 720p/1080p, width/height 720–1920px
 *   - Audio: ≤5MB, 2–60s duration
 */
export async function generateLipsync({ videoUrl, audioUrl }) {
  if (!videoUrl) throw new Error('generateLipsync: videoUrl required');
  if (!audioUrl) throw new Error('generateLipsync: audioUrl required');

  const input = { video_url: videoUrl, audio_url: audioUrl };

  const delays = [10000, 20000, 40000];
  let lastErr;

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const result = await fal.subscribe('fal-ai/kling-video/lipsync/audio-to-video', {
        input,
        logs: false,
      });
      return result.data.video;
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      if (status === 529 && attempt < 3) {
        const wait = delays[attempt];
        console.warn(`[lipsync] 529 overloaded — retry ${attempt + 1}/3 in ${wait / 1000}s`);
        await sleep(wait);
        lastErr = err;
      } else {
        throw err;
      }
    }
  }

  throw lastErr;
}

/**
 * One-shot talking head: start from an image, add narration, get lip-synced video.
 * Pipeline: image → Kling v3 i2v (silent) → Kling v3 lipsync (adds lip-sync from audio)
 */
export async function generateTalkingHead({ startImageUrl, audioUrl, prompt = 'Subject speaks naturally, gentle facial movement, soft expression', duration = 5 }) {
  // Step 1: image-to-video (no audio — we add it via lipsync)
  const videoInput = {
    image_url: startImageUrl,
    prompt,
    aspect_ratio: '9:16',
    duration: duration === 10 ? 10 : 5,
    generate_audio: false,
  };

  const videoResult = await fal.subscribe('fal-ai/kling-video/v3/standard/image-to-video', {
    input: videoInput,
    logs: false,
  });
  const baseVideoUrl = videoResult.data.video?.url;
  if (!baseVideoUrl) throw new Error('talking head: base video generation returned no URL');

  // Step 2: lipsync with ElevenLabs audio
  const finalVideo = await generateLipsync({ videoUrl: baseVideoUrl, audioUrl });
  return finalVideo;
}
