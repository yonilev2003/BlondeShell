import { fal } from '@fal-ai/client';
import 'dotenv/config';

fal.config({ credentials: process.env.FAL_KEY });

const MOTION_PROMPTS = {
  beach: [
    'hair gently blowing in the ocean breeze, soft waves in background',
    'slow turn toward camera, golden hour light on face',
    'walking barefoot along shoreline, sand between toes',
  ],
  gym: [
    'subtle shift of weight, athletic stance, gym lights',
    'reaches for water bottle, turns slightly to camera',
    'stretches arms overhead, confident athletic pose',
  ],
  street: [
    'slight head turn toward camera, hair moving gently, standing still, urban background',
    'breathing naturally, soft smile forming, minimal body movement',
    'eyes moving slowly toward camera, subtle expression change',
  ],
  home: [
    'slow head turn toward camera, cozy interior lighting',
    'reaches for coffee cup, relaxed natural movement',
    'looks up from book, soft smile, window light',
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function generateVideo({ startImageUrl, setting, motionIndex = 0, duration = 5, customPrompt = null }) {
  const prompts = MOTION_PROMPTS[setting] ?? MOTION_PROMPTS.beach;
  const prompt = customPrompt ?? prompts[motionIndex % prompts.length];

  const input = {
    image_url: startImageUrl,
    prompt,
    aspect_ratio: '9:16',
    duration: duration === 10 ? 10 : 5,
  };

  const delays = [8000, 16000, 32000];
  let lastErr;

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const result = await fal.subscribe('fal-ai/kling-video/v3/standard/image-to-video', {
        input,
        logs: false,
      });
      return result.data.video;
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      if (status === 529 && attempt < 3) {
        const wait = delays[attempt];
        console.warn(`[generate_video] 529 overloaded — retry ${attempt + 1}/3 in ${wait / 1000}s`);
        await sleep(wait);
        lastErr = err;
      } else {
        throw err;
      }
    }
  }

  throw lastErr;
}
