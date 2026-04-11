import 'dotenv/config.js';

import { fal  } from '@fal-ai/client';
import { supabase, logAgentAction  } from '../lib/supabase.js';
import { withRetry  } from '../lib/retry.js';

fal.config({ credentials: process.env.FAL_KEY });

const MODEL = 'fal-ai/kling-video/v2/standard/image-to-video';
const DEFAULT_DURATION = 6;

/**
 * Generate a video via Kling 2.0 image-to-video.
 *
 * @param {object} opts
 * @param {string}  opts.start_frame_url   - URL of the starting frame image
 * @param {string}  opts.motion_type       - e.g. 'subtle', 'dynamic', 'loop'
 * @param {string}  opts.setting           - e.g. 'beach', 'gym', 'home', 'travel'
 * @param {number}  [opts.duration_seconds] - Default 6
 * @param {string}  [opts.prompt]          - Optional motion guidance prompt
 * @param {string}  [opts.dm_event_id]     - dm_events row id for logging
 *
 * @returns {{ video_url, loop_ratio_estimate }}
 */
async function generateVideo({
  start_frame_url,
  motion_type,
  setting,
  duration_seconds = DEFAULT_DURATION,
  prompt = '',
  dm_event_id,
}) {
  if (!start_frame_url) throw new Error('generateVideo: start_frame_url is required');
  if (!motion_type)     throw new Error('generateVideo: motion_type is required');

  // ── 1. Save start_frame as reference image ────────────────────────────────
  await supabase.from('reference_images').upsert(
    {
      image_url: start_frame_url,
      setting: setting || 'unknown',
      tier: 'T3',
      mood: motion_type,
      face_similarity: null,
      used_as_start_frame: true,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'image_url' }
  );

  // ── 2. Build fal.ai input ─────────────────────────────────────────────────
  const input = {
    image_url: start_frame_url,
    duration: String(duration_seconds),
    ...(prompt && { prompt }),
  };

  // ── 3. Run generation with retry ──────────────────────────────────────────
  let result;
  try {
    result = await withRetry(
      () => fal.run(MODEL, { input }),
      { label: 'kling_generate', maxRetries: 3, baseDelayMs: 2000 }
    );
  } catch (err) {
    await logAgentAction('generate_video', 'generation', 'failed', err.message);
    throw err;
  }

  const video_url = result?.video?.url || result?.video_url;
  if (!video_url) throw new Error('generate_video: no video_url in fal.ai response');

  // ── 4. Estimate loop ratio (heuristic: loop motions score higher) ─────────
  const loop_ratio_estimate = motion_type === 'loop' ? 0.85 : 0.5;

  // ── 5. Log to Supabase video_library ─────────────────────────────────────
  const { error: insertErr } = await supabase.from('video_library').upsert(
    {
      video_url,
      start_frame_url,
      motion_type,
      setting: setting || 'unknown',
      duration_seconds,
      loop_ratio_estimate,
      model: MODEL,
      dm_event_id: dm_event_id || null,
      archive_status: 'active',
      created_at: new Date().toISOString(),
    },
    { onConflict: 'video_url' }
  );
  if (insertErr) console.warn('[generate_video] video_library upsert failed:', insertErr.message);

  await logAgentAction('generate_video', 'generation', 'completed',
    `video_url=${video_url} motion=${motion_type} duration=${duration_seconds}s`);

  return { video_url, loop_ratio_estimate };
}

export { generateVideo };
