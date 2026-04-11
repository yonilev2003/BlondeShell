import { fal } from '@fal-ai/client';
import 'dotenv/config';

fal.config({ credentials: process.env.FAL_KEY });

const BASE = 'https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/Hero_Dataset/';

export const REFERENCE_SETS = {
  beach: [
    BASE + 'beach_T1_sunset_face.jpeg',
    BASE + 'outdoor_T1_golden_medium.jpeg',
    BASE + 'studio_T1_closeup_neutral.png',
    BASE + 'closeup_T1_face_hero.png',
  ],
  gym: [
    BASE + 'gym_T1_indoor_full.png',
    BASE + 'outdoor_T1_golden_athletic.jpeg',
    BASE + 'studio_T1_closeup_neutral.png',
    BASE + 'closeup_T1_face_hero.png',
  ],
  street: [
    BASE + 'studio_T1_closeup_neutral.png',
    BASE + 'travel_T1_desert_golden_hero.png',
    BASE + 'outdoor_T1_golden_medium.jpeg',
    BASE + 'studio_T1_closeup_neutral.png',
  ],
  home: [
    BASE + 'studio_T1_closeup_neutral.png',
    BASE + 'closeup_T1_face_hero.png',
    BASE + 'outdoor_T1_golden_medium.jpeg',
    BASE + 'beach_T1_sunset_face.jpeg',
  ],
};

const T1_SUFFIX =
  'Keep her face, platinum blonde hair, green eyes, and athletic body identical. Professional photography, photorealistic, 4K, natural lighting.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function generateImage({ setting, tier = 'T1', mood, referenceUrls, promptCore, seed }) {
  const refs = referenceUrls ?? REFERENCE_SETS[setting] ?? REFERENCE_SETS.beach;
  const prompt = tier === 'T1' ? `${promptCore} ${T1_SUFFIX}` : promptCore;

  const input = {
    prompt,
    image_urls: refs,
    image_size: 'portrait_4_3',
    enable_safety_checker: false,
    num_images: 1,
    ...(seed != null ? { seed } : {}),
  };

  const delays = [8000, 16000, 32000];
  let lastErr;

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const result = await fal.subscribe('fal-ai/bytedance/seedream/v4.5/edit', {
        input,
        logs: false,
      });
      return result.data.images[0];
    } catch (err) {
      const status = err?.status ?? err?.response?.status;
      if (status === 529 && attempt < 3) {
        const wait = delays[attempt];
        console.warn(`[generate_image] 529 overloaded — retry ${attempt + 1}/3 in ${wait / 1000}s`);
        await sleep(wait);
        lastErr = err;
      } else {
        throw err;
      }
    }
  }

  throw lastErr;
}
