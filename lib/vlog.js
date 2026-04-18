import { runAgent } from './agent_runner.js';
import { generateSpeech } from './voice.js';
import { generateImage, REFERENCE_SETS } from './generate_image.js';
import { generateVideo } from './generate_video.js';
import { generateTalkingHead } from './lipsync.js';
import { saveVideo } from './supabase_content.js';
import { supabase } from './supabase.js';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STITCH_SCRIPT = join(ROOT, 'scripts', 'stitch_vlog.sh');

const HERO_REF_BASE = 'https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/Hero_Dataset/';
const HERO_FACE_REF = HERO_REF_BASE + 'closeup_T1_face_hero.png';

const SCRIPT_SYSTEM_PROMPT = `You are a vlog scriptwriter for BlondeShell, a fitness/lifestyle AI influencer.
Write short, punchy vlog scripts for vertical video (9:16).
Output ONLY valid JSON with this structure:
{
  "narration": "Full narration text spoken by BlondeShell in first person",
  "scenes": [
    {
      "description": "Visual description for AI image generation",
      "setting": "beach|gym|street|home|studio|travel",
      "duration": 5,
      "type": "broll|talking_head"
    }
  ]
}
Rules:
- Total narration: 100-180 words (30-60 seconds spoken)
- 3-5 scenes total
- At least 1 scene must be type "talking_head" (usually scene 1 or last)
- Scene durations: 5 or 10 seconds each
- Narration should feel authentic, energetic, and on-brand
- Settings must match the arc context provided
- Descriptions should be specific enough for Seedream image generation`;

async function generateScript(arcContext) {
  const raw = await runAgent({
    systemPrompt: SCRIPT_SYSTEM_PROMPT,
    userMessage: `Write a vlog script for this Brand Arc context:\n\n${JSON.stringify(arcContext, null, 2)}`,
    model: 'claude-haiku-4-20250414',
    maxTokens: 1024,
  });

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Script generation returned no JSON');
  return JSON.parse(jsonMatch[0]);
}

async function uploadBufferToStorage(buffer, filename, contentType) {
  const bucket = 'vlog_assets';
  const path = `${new Date().toISOString().slice(0, 10)}/${filename}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function downloadToFile(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(filePath, buffer);
  return filePath;
}

export async function generateVlog(arcContext, options = {}) {
  const batchId = options.batchId || `vlog_${randomUUID().slice(0, 8)}`;
  const tier = options.tier || 'T1';
  const tmpDir = join(ROOT, 'tmp', batchId);
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  console.log(`[vlog] Starting pipeline — batch=${batchId}`);

  // 1. Script generation
  console.log('[vlog] Step 1: Generating script...');
  const script = await generateScript(arcContext);
  console.log(`[vlog] Script: ${script.scenes.length} scenes, narration: ${script.narration.length} chars`);

  // 2. Audio generation (narration)
  console.log('[vlog] Step 2: Generating narration audio...');
  const audioBuffer = await generateSpeech(script.narration);
  const narrationPath = join(tmpDir, 'narration.mp3');
  writeFileSync(narrationPath, audioBuffer);
  const audioUrl = await uploadBufferToStorage(audioBuffer, `${batchId}_narration.mp3`, 'audio/mpeg');
  console.log(`[vlog] Narration uploaded: ${audioUrl}`);

  // 3 + 4. Generate start frames and video clips per scene (parallel per scene)
  console.log('[vlog] Steps 3-4: Generating scenes...');
  const sceneResults = await Promise.all(
    script.scenes.map(async (scene, i) => {
      const setting = scene.setting || 'beach';
      const refs = REFERENCE_SETS[setting] || REFERENCE_SETS.beach;

      // 3. Start frame
      console.log(`[vlog]   Scene ${i + 1}: Generating start frame (${setting})...`);
      const image = await generateImage({
        setting,
        tier,
        promptCore: scene.description,
        referenceUrls: refs,
      });
      const imageUrl = image.url;

      if (scene.type === 'talking_head') {
        // 5. Talking head via Kling v3 Lipsync (A2V)
        console.log(`[vlog]   Scene ${i + 1}: Generating talking head (Kling lipsync)...`);
        const talkingHeadVideo = await generateTalkingHead({
          startImageUrl: imageUrl,
          audioUrl,
          prompt: scene.description,
          duration: scene.duration === 10 ? 10 : 5,
        });
        const talkingHeadUrl = talkingHeadVideo.url;
        const clipPath = join(tmpDir, `scene_${i}.mp4`);
        await downloadToFile(talkingHeadUrl, clipPath);
        return { ...scene, index: i, imageUrl, videoUrl: talkingHeadUrl, clipPath, method: 'kling_lipsync' };
      }

      // 4. B-roll via Kling
      console.log(`[vlog]   Scene ${i + 1}: Generating b-roll video...`);
      const video = await generateVideo({
        startImageUrl: imageUrl,
        setting,
        duration: scene.duration || 5,
        customPrompt: scene.description,
      });
      const videoUrl = video.url;
      const clipPath = join(tmpDir, `scene_${i}.mp4`);
      await downloadToFile(videoUrl, clipPath);
      return { ...scene, index: i, imageUrl, videoUrl, clipPath, method: 'kling' };
    }),
  );

  // 6. Stitch with ffmpeg
  console.log('[vlog] Step 6: Stitching final video...');
  const manifest = {
    clips: sceneResults.map((s) => s.clipPath),
    narration: narrationPath,
    background_music: options.backgroundMusicPath || '',
    music_volume: options.musicVolume ?? 0.1,
  };
  const manifestPath = join(tmpDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const outputPath = join(tmpDir, 'final.mp4');
  execFileSync('bash', [STITCH_SCRIPT, manifestPath, outputPath], {
    timeout: 120000,
    stdio: 'pipe',
  });

  if (!existsSync(outputPath)) throw new Error('ffmpeg stitch produced no output');
  console.log(`[vlog] Stitched: ${outputPath}`);

  // 7. Upload final video to Supabase
  console.log('[vlog] Step 7: Uploading final video...');
  const { readFileSync } = await import('fs');
  const finalBuffer = readFileSync(outputPath);
  const finalUrl = await uploadBufferToStorage(finalBuffer, `${batchId}_final.mp4`, 'video/mp4');

  const totalDuration = sceneResults.reduce((sum, s) => sum + (s.duration || 5), 0);

  const record = await saveVideo({
    setting: arcContext.setting || sceneResults[0]?.setting || 'mixed',
    tier,
    mood: arcContext.mood || 'energetic',
    url: finalUrl,
    prompt: script.narration.slice(0, 500),
    batch_id: batchId,
    duration_seconds: totalDuration,
    platforms: options.platforms || ['tiktok', 'youtube_shorts', 'instagram_reels'],
  });

  console.log(`[vlog] Pipeline complete — ${finalUrl}`);

  return {
    videoUrl: finalUrl,
    duration: totalDuration,
    script,
    scenes: sceneResults.map(({ clipPath, ...rest }) => rest),
    batchId,
    contentItemId: record.id,
  };
}
