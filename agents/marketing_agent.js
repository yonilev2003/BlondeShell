/**
 * Marketing Agent — runs daily at 6am ET
 * Reads weekly plan → generates content → QA → schedule via Publer → report
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { generateImage, REFERENCE_SETS } from '../lib/generate_image.js';
import { generateVideo } from '../lib/generate_video.js';
import { saveImage, saveVideo, updateQAStatus } from '../lib/supabase_content.js';
import { schedulePost, getPlatformIds } from '../lib/publer.js';
import { uploadMediaFromUrl, createPost as fanvueCreatePost } from '../lib/fanvue.js';
import { checkPlatformQA } from './qa_platform_agent.js';
import { logMistake } from '../lib/agent_runner.js';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODEL = 'claude-haiku-4-5-20251001';
const QA_THRESHOLD = 0.8;

// Posting schedule (ET → UTC offset: ET is UTC-4 in April)
// ET + 4h = UTC
const PLATFORM_TIMES = {
  instagram: ['23:00'],          // 7pm ET = 23:00 UTC
  tiktok:    ['15:00', '23:00'], // 11am + 7pm ET
  twitter:   ['13:00', '16:00', '22:00', '01:00'], // 9am, 12pm, 6pm, 9pm ET
};

// ─── Weekly plan ─────────────────────────────────────────────────────────────

async function getTodayPlan() {
  const today = new Date().toISOString().slice(0, 10);

  // Find the week_of monday for today
  const d = new Date(today);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  const weekOf = monday.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('week_of', weekOf)
    .single();

  if (error || !data) {
    console.warn(`[marketing_agent] No weekly plan found for week_of=${weekOf}`);
    return null;
  }

  const dayPlan = data.days?.[today];
  if (!dayPlan) {
    console.warn(`[marketing_agent] No day plan for ${today} in week ${weekOf}`);
    return null;
  }

  return { weekId: data.id, weekOf, today, ...dayPlan };
}

// ─── QA via Claude vision ─────────────────────────────────────────────────────

async function qaCheck(imageUrl) {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: imageUrl },
          },
          {
            type: 'text',
            text: `Score this AI-generated image for character consistency. BlondeShell has: platinum blonde hair, green eyes, athletic build, fair skin.
Return ONLY valid JSON (no markdown):
{"score": 0.0-1.0, "hair": "pass|fail", "eyes": "pass|fail", "build": "pass|fail", "reason": "brief note"}
Score 1.0 = perfect match. Score < 0.8 = reject.`,
          },
        ],
      }],
    });

    const text = response.content[0]?.text ?? '';
    const json = text
      .replace(/^```(?:json)?\n?/m, '')
      .replace(/\n?```$/m, '')
      .replace(/,(\s*[}\]])/g, '$1')
      .trim();
    return JSON.parse(json);
  } catch (err) {
    console.warn(`[marketing_agent] QA check failed: ${err.message}`);
    return { score: 0, reason: `QA error: ${err.message}` };
  }
}

// ─── Upload to Supabase Storage ───────────────────────────────────────────────

async function uploadToStorage(url, id, type) {
  const ext = type === 'video' ? 'mp4' : 'png';
  const storagePath = `generated/${type}s/${id}.${ext}`;

  // Fetch the file from fal.ai
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = type === 'video' ? 'video/mp4' : 'image/png';

  const { error } = await supabase.storage
    .from('content')
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('content')
    .getPublicUrl(storagePath);

  return publicUrl;
}

// ─── Caption generation ───────────────────────────────────────────────────────

async function generateCaption(platform, theme, captionVibe) {
  const platformRules = {
    instagram: 'Instagram caption: 1-2 lines, 3-5 hashtags, aesthetic tone. Max 80 chars + tags.',
    tiktok: 'TikTok caption: punchy 1-liner, 3 trending hashtags. Very short. Max 60 chars + tags.',
    twitter: 'Twitter/X post: 1 sentence, no hashtags unless natural, conversational. Max 120 chars.',
  };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 128,
    messages: [{
      role: 'user',
      content: `Write a social media caption.\nPlatform: ${platform}\nTheme: ${theme}\nVibe: ${captionVibe}\nRule: ${platformRules[platform] ?? 'Keep it short and relevant.'}\nReturn ONLY the caption text, nothing else.`,
    }],
  });

  return response.content[0]?.text?.trim() ?? '';
}

// ─── Publer scheduling ────────────────────────────────────────────────────────

function buildScheduleTimes(platforms, date) {
  const slots = [];
  for (const platform of platforms) {
    const times = PLATFORM_TIMES[platform] ?? [];
    for (const time of times) {
      slots.push({ platform, scheduledAt: `${date}T${time}:00Z` });
    }
  }
  return slots;
}

async function scheduleWithPubler(platformIds, mediaUrl, caption, slot, isVideo) {
  const account = platformIds[slot.platform];
  if (!account?.id) {
    return { ok: false, reason: `No account connected for ${slot.platform}` };
  }

  try {
    const jobId = await schedulePost({
      accountId: account.id,
      networkKey: account.networkKey,
      caption,
      scheduledAt: slot.scheduledAt,
      mediaUrl,
      isVideo,
    });
    return { ok: true, jobId, platform: slot.platform, scheduledAt: slot.scheduledAt };
  } catch (err) {
    return { ok: false, reason: err.message, platform: slot.platform };
  }
}

// ─── Agent log ────────────────────────────────────────────────────────────────

async function logReport(status, report) {
  const { error } = await supabase.from('agent_logs').insert({
    agent: 'marketing_agent',
    task: 'daily_content_and_scheduling',
    status,
    notes: typeof report === 'string' ? report : JSON.stringify(report),
    created_at: new Date().toISOString(),
  });
  if (error) console.error(`[marketing_agent] logReport failed: ${error.message}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[marketing_agent] Starting — ${new Date().toISOString()}`);

  const results = {
    generated: 0,
    qa_passed: 0,
    qa_failed: 0,
    uploaded: 0,
    scheduled: 0,
    schedule_failed: 0,
    errors: [],
  };

  try {
    // 1. Get today's plan
    const plan = await getTodayPlan();
    if (!plan) {
      await logReport('completed', 'No plan for today — skipped');
      console.log('[marketing_agent] No plan for today — skipping.');
      return;
    }

    console.log(`[marketing_agent] Plan: ${plan.today} | theme: ${plan.theme} | batch: ${plan.batch}`);
    console.log(`  Content: ${JSON.stringify(plan.content)}`);
    console.log(`  Platforms: ${plan.platforms.join(', ')}`);

    const refs = REFERENCE_SETS[plan.batch] ?? REFERENCE_SETS.beach;
    const batchId = `marketing_${plan.today}_${Date.now()}`;
    const approvedItems = [];

    // 2. Generate images
    const imageSpec = plan.content.find(c => c.type === 'image');
    const imageCount = imageSpec?.count ?? 2;

    console.log(`\n[marketing_agent] Generating ${imageCount} images...`);
    for (let i = 0; i < imageCount; i++) {
      try {
        const img = await generateImage({
          setting: plan.batch,
          tier: 'T1',
          mood: plan.mood,
          referenceUrls: refs,
          promptCore: `The woman from the reference images at ${plan.theme}. ${plan.caption_vibe}.`,
        });
        results.generated++;

        // 3. QA check
        console.log(`  Image ${i + 1}: QA checking ${img.url}`);
        const qa = await qaCheck(img.url);
        console.log(`  QA score: ${qa.score} | ${qa.reason}`);

        if (qa.score >= QA_THRESHOLD) {
          results.qa_passed++;

          // Save to DB
          const saved = await saveImage({
            setting: plan.batch,
            tier: 'T1',
            mood: plan.mood,
            url: img.url,
            prompt: plan.theme,
            batch_id: batchId,
            platforms: plan.platforms,
          });

          // Upload to Supabase Storage
          let permanentUrl = img.url;
          try {
            permanentUrl = await uploadToStorage(img.url, saved.id, 'image');
            await supabase.from('content_items').update({ url: permanentUrl }).eq('id', saved.id);
            results.uploaded++;
          } catch (uploadErr) {
            console.warn(`  Storage upload failed: ${uploadErr.message} — using fal.ai URL`);
          }

          await updateQAStatus(saved.id, 'approved');
          approvedItems.push({ ...saved, url: permanentUrl, mediaType: 'image' });
          console.log(`  ✓ Image ${i + 1} approved — id: ${saved.id}`);
        } else {
          results.qa_failed++;
          console.log(`  ✗ Image ${i + 1} rejected (score ${qa.score}): ${qa.reason}`);
        }
      } catch (err) {
        results.errors.push(`image_${i + 1}: ${err.message}`);
        console.error(`  [ERROR] image ${i + 1}: ${err.message}`);
      }
    }

    // 4. Generate videos (using approved images as start frames)
    const videoSpec = plan.content.find(c => c.type === 'video');
    const videoCount = videoSpec?.count ?? 1;

    console.log(`\n[marketing_agent] Generating ${videoCount} videos...`);
    for (let i = 0; i < Math.min(videoCount, approvedItems.length); i++) {
      try {
        const sourceImage = approvedItems[i];
        const vid = await generateVideo({
          startImageUrl: sourceImage.url,
          setting: plan.batch,
          motionIndex: i,
          duration: 5,
        });
        results.generated++;

        const savedVid = await saveVideo({
          setting: plan.batch,
          tier: 'T1',
          mood: plan.mood,
          url: vid.url,
          prompt: plan.theme,
          batch_id: batchId,
          source_image_id: sourceImage.id,
          duration_seconds: 5,
          platforms: plan.platforms,
        });

        let permanentUrl = vid.url;
        try {
          permanentUrl = await uploadToStorage(vid.url, savedVid.id, 'video');
          await supabase.from('content_items').update({ url: permanentUrl }).eq('id', savedVid.id);
          results.uploaded++;
        } catch (uploadErr) {
          console.warn(`  Video storage upload failed: ${uploadErr.message}`);
        }

        await updateQAStatus(savedVid.id, 'approved');
        approvedItems.push({ ...savedVid, url: permanentUrl, mediaType: 'video' });
        results.qa_passed++;
        console.log(`  ✓ Video ${i + 1} saved — id: ${savedVid.id}`);
      } catch (err) {
        results.errors.push(`video_${i + 1}: ${err.message}`);
        console.error(`  [ERROR] video ${i + 1}: ${err.message}`);
      }
    }

    // 5. Schedule approved items via Publer
    if (approvedItems.length > 0) {
      console.log(`\n[marketing_agent] Scheduling ${approvedItems.length} items via Publer...`);

      let platformIds;
      try {
        platformIds = await getPlatformIds();
        console.log(`  Platform IDs: ${JSON.stringify(platformIds)}`);
      } catch (err) {
        console.warn(`  Failed to get platform IDs: ${err.message}`);
        platformIds = { instagram: null, tiktok: null, twitter: null };
      }

      const slots = buildScheduleTimes(plan.platforms, plan.today);

      for (const item of approvedItems.slice(0, slots.length)) {
        const slot = slots[approvedItems.indexOf(item) % slots.length];
        // Platform QA check before scheduling
        const platformQA = await checkPlatformQA(item.url, slot.platform, item.tier ?? 'T1');
        if (!platformQA.approved) {
          results.schedule_failed++;
          console.warn(`  ✗ Platform QA rejected [${slot.platform}]: ${platformQA.reason}`);
          try {
            await supabase.from('content_items').update({ qa_status: 'platform_rejected' }).eq('id', item.id);
          } catch {}
          continue;
        }

        const caption = await generateCaption(slot.platform, plan.theme, plan.caption_vibe).catch(() => plan.theme);
        const result = await scheduleWithPubler(platformIds, item.url, caption, slot, item.mediaType === 'video');

        if (result.ok) {
          results.scheduled++;
          console.log(`  ✓ Scheduled ${slot.platform} @ ${slot.scheduledAt} — job: ${result.jobId}`);
        } else {
          results.schedule_failed++;
          console.warn(`  ✗ Schedule failed [${slot.platform}]: ${result.reason}`);
        }
      }
    }

    // 6. Post to Fanvue async (T1 free, T2 subscribers-only) — fire and forget, don't block
    if (approvedItems.length > 0) {
      console.log(`\n[marketing_agent] Posting ${approvedItems.length} items to Fanvue (async)...`);
      const fanvueCaption = await generateCaption('fanvue', plan.theme, plan.caption_vibe).catch(() => plan.theme);

      // Fanvue only supports image URL-import (video upload returns 500 — skip videos)
      const fanvueImages = approvedItems.filter(item => item.mediaType !== 'video');
      Promise.all(fanvueImages.map(async (item) => {
        try {
          const audience  = 'subscribers';
          const isFree    = false;
          const mediaUuid = await uploadMediaFromUrl(item.url, `${item.id}.png`);
          await fanvueCreatePost({ mediaUuids: [mediaUuid], caption: fanvueCaption, isFree, audience });
          console.log(`  ✓ Fanvue post created — item: ${item.id} tier: ${item.tier ?? 'T1'}`);
        } catch (err) {
          console.warn(`  ✗ Fanvue post failed — item: ${item.id}: ${err.message}`);
        }
      })).catch(() => {});
    }

    // 7. Report
    const summary = `${plan.today} | theme: ${plan.theme} | generated: ${results.generated} | qa_passed: ${results.qa_passed} | qa_failed: ${results.qa_failed} | uploaded: ${results.uploaded} | scheduled: ${results.scheduled} | schedule_failed: ${results.schedule_failed}${results.errors.length ? ` | errors: ${results.errors.join('; ')}` : ''}`;

    console.log('\n' + '─'.repeat(60));
    console.log('[marketing_agent] SUMMARY');
    console.log(summary);
    console.log('─'.repeat(60));

    await logReport(results.errors.length === 0 ? 'completed' : 'partial', summary);
    console.log('[marketing_agent] Done. (Fanvue posts running in background)\n');

  } catch (err) {
    console.error(`[marketing_agent] FATAL: ${err.message}`);
    await logMistake('marketing_agent', err);
    await logReport('failed', err.message);
    process.exit(1);
  }
}

main();
