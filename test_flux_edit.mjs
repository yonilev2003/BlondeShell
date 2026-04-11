import { fal } from "@fal-ai/client";
import 'dotenv/config';

fal.config({ credentials: process.env.FAL_KEY });

const result = await fal.subscribe("fal-ai/bytedance/seedream/v4.5/edit", {
  input: {
    prompt: "The woman from image 1 is photographed from the side in a professional photo studio. She is facing away from camera at 3/4 angle showing her back. Behind her: black studio curtains, professional softbox lights and photography equipment visible. Studio floor. Keep her platinum blonde wavy hair, black bikini, and athletic body identical. Studio photography, photorealistic, 4K.",
    image_urls: [
      "https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/Hero_Dataset/travel_T1_desert_golden_hero.png",
      "https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/Hero_Dataset/studio_T1_closeup_neutral.png"
    ],
    image_size: "portrait_4_3",
    enable_safety_checker: false
  },
  logs: true
});

console.log("Image URL:", result.data.images[0].url);
