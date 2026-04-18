import { generateCreativeBrief, buildDynamicPrompt } from './inspiration_engine.js';
import { generateImage, REFERENCE_SETS } from './generate_image.js';
import { generateVideo } from './generate_video.js';
import { runFullQA } from './qa_gate.js';
import { routeContent } from './content_router.js';
import { saveImage, saveVideo, updateQAStatus } from './supabase_content.js';
import { uploadMediaFromUrl as publerUploadMedia, schedulePost, getPlatformIds } from './publer.js';
import { uploadMediaFromUrl, createPost as fanvueCreatePost, scheduleFanvuePost } from './fanvue.js';
import { runABTest } from './ab_testing.js';
import { logAgentAction } from './supabase.js';
import 'dotenv/config';

// T1 items on these platforms get A/B tested (5 caption variations, 30min stagger)
const AB_TEST_PLATFORMS = ['tiktok', 'instagram'];

const MAX_RETRIES = 2;

async function uploadToStorage(supabaseClient, url, id, type) {
  const ext = type === 'video' ? 'mp4' : 'png';
  const storagePath = `generated/${type}s/${id}.${ext}`;
  const contentType = type === 'video' ? 'video/mp4' : 'image/png';

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const { error } = await supabaseClient.storage
    .from('content')
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabaseClient.storage
    .from('content')
    .getPublicUrl(storagePath);

  return publicUrl;
}

async function generateWithRetries(generateFn, qa, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await generateFn();
    const qaResult = await qa(result);

    if (qaResult.approved) {
      return { result, qaResult, attempts: attempt + 1 };
    }

    console.warn(`[pipeline] QA failed (attempt ${attempt + 1}/${retries + 1}): ${qaResult.reason}`);
    if (attempt === retries) {
      return { result: null, qaResult, attempts: attempt + 1 };
    }
  }
}

export async function runDailyPipeline(arcContext, options = {}) {
  const {
    imageCount = 3,
    videoCount = 1,
    tiers = ['T1'],
    supabaseClient = null,
  } = options;

  const report = {
    startedAt: new Date().toISOString(),
    brief: null,
    generated: 0,
    qa_passed: 0,
    qa_failed: 0,
    scheduled: 0,
    schedule_failed: 0,
    items: [],
    errors: [],
  };

  try {
    // 1. Generate creative brief
    console.log('[pipeline] Generating creative brief...');
    const brief = await generateCreativeBrief(arcContext);
    report.brief = brief;

    // 2. Build prompts for each tier
    const prompts = tiers.map(tier => buildDynamicPrompt(brief, tier));

    // 3. Resolve reference images
    const primarySetting = brief.settings?.[0]?.toLowerCase() ?? 'beach';
    const settingKey = Object.keys(REFERENCE_SETS).find(k => primarySetting.includes(k)) ?? 'beach';
    const refs = REFERENCE_SETS[settingKey];

    const batchId = `pipeline_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
    const approvedItems = [];

    // 4. Generate images with QA gate
    console.log(`[pipeline] Generating ${imageCount} images...`);
    for (let i = 0; i < imageCount; i++) {
      const tierIndex = i % prompts.length;
      const { prompt, tier, setting, mood } = prompts[tierIndex];

      try {
        const genResult = await generateWithRetries(
          () => generateImage({
            setting: settingKey,
            tier,
            mood,
            referenceUrls: refs,
            promptCore: prompt,
          }),
          (img) => runFullQA({ url: img.url, tier }),
        );

        report.generated += genResult.attempts;

        if (!genResult.result) {
          report.qa_failed++;
          report.errors.push(`image_${i + 1}: QA failed after ${genResult.attempts} attempts — ${genResult.qaResult.reason}`);
          console.warn(`[pipeline] Image ${i + 1} rejected after ${genResult.attempts} attempts`);
          continue;
        }

        report.qa_passed++;
        const img = genResult.result;

        const saved = await saveImage({
          setting: settingKey,
          tier,
          mood,
          url: img.url,
          prompt,
          batch_id: batchId,
          platforms: [],
        });

        let permanentUrl = img.url;
        if (supabaseClient) {
          try {
            permanentUrl = await uploadToStorage(supabaseClient, img.url, saved.id, 'image');
            await supabaseClient.from('content_items').update({ url: permanentUrl }).eq('id', saved.id);
          } catch (uploadErr) {
            console.warn(`[pipeline] Storage upload failed: ${uploadErr.message}`);
          }
        }

        await updateQAStatus(saved.id, 'approved');
        approvedItems.push({
          ...saved,
          url: permanentUrl,
          mediaType: 'image',
          tier,
          classifiedTier: genResult.qaResult.classifiedTier ?? tier,
        });
        console.log(`[pipeline] Image ${i + 1} approved — id: ${saved.id}`);
      } catch (err) {
        report.errors.push(`image_${i + 1}: ${err.message}`);
        console.error(`[pipeline] Image ${i + 1} error: ${err.message}`);
      }
    }

    // 5. Generate videos from approved images
    console.log(`[pipeline] Generating ${videoCount} videos...`);
    for (let i = 0; i < Math.min(videoCount, approvedItems.length); i++) {
      const source = approvedItems[i];
      try {
        const vid = await generateVideo({
          startImageUrl: source.url,
          setting: settingKey,
          motionIndex: i,
          duration: 5,
        });

        report.generated++;
        const savedVid = await saveVideo({
          setting: settingKey,
          tier: source.tier,
          mood: source.mood,
          url: vid.url,
          prompt: source.prompt,
          batch_id: batchId,
          source_image_id: source.id,
          duration_seconds: 5,
          platforms: [],
        });

        let permanentUrl = vid.url;
        if (supabaseClient) {
          try {
            permanentUrl = await uploadToStorage(supabaseClient, vid.url, savedVid.id, 'video');
            await supabaseClient.from('content_items').update({ url: permanentUrl }).eq('id', savedVid.id);
          } catch (uploadErr) {
            console.warn(`[pipeline] Video storage upload failed: ${uploadErr.message}`);
          }
        }

        await updateQAStatus(savedVid.id, 'approved');
        approvedItems.push({
          ...savedVid,
          url: permanentUrl,
          mediaType: 'video',
          tier: source.tier,
          classifiedTier: source.classifiedTier,
        });
        report.qa_passed++;
        console.log(`[pipeline] Video ${i + 1} saved — id: ${savedVid.id}`);
      } catch (err) {
        report.errors.push(`video_${i + 1}: ${err.message}`);
        console.error(`[pipeline] Video ${i + 1} error: ${err.message}`);
      }
    }

    // 6. Route approved content to platforms
    if (approvedItems.length > 0) {
      console.log(`[pipeline] Routing ${approvedItems.length} items to platforms...`);

      let platformIds;
      try {
        platformIds = await getPlatformIds();
      } catch (err) {
        console.warn(`[pipeline] Failed to get platform IDs: ${err.message}`);
        platformIds = { instagram: null, tiktok: null, twitter: null };
      }

      for (const item of approvedItems) {
        const routes = routeContent(item, item.classifiedTier ?? item.tier);

        for (const route of routes) {
          try {
            if (route.platform === 'fanvue') {
              // 7. Schedule via Fanvue API
              const mediaUuid = await uploadMediaFromUrl(item.url, `${item.id}.png`);
              if (route.isPPV) {
                await fanvueCreatePost({
                  mediaUuids: [mediaUuid],
                  caption: `Exclusive content`,
                  isFree: false,
                  price: route.ppvPrice,
                  audience: 'subscribers',
                });
              } else {
                await scheduleFanvuePost({
                  mediaUuids: [mediaUuid],
                  caption: 'New content dropping',
                  scheduledAt: route.scheduledAt,
                  isFree: true,
                });
              }
              report.scheduled++;
              console.log(`[pipeline] Fanvue ${route.isPPV ? 'PPV' : 'free'} post created — item: ${item.id}`);
            } else if (route.isTeaser) {
              console.log(`[pipeline] Teaser route for ${route.platform} — item: ${item.id} (skipped, requires teaser image)`);
            } else {
              // 7. Schedule via Publer (SFW platforms)
              const account = platformIds[route.platform];
              if (!account?.id) {
                report.schedule_failed++;
                console.warn(`[pipeline] No account for ${route.platform}`);
                continue;
              }

              // Upload to Publer media library first (required before scheduling)
              let publerMedia;
              try {
                publerMedia = await publerUploadMedia(item.url, { name: `${item.id}.${item.mediaType === 'video' ? 'mp4' : 'jpg'}` });
              } catch (uploadErr) {
                report.schedule_failed++;
                report.errors.push(`publer_upload_${route.platform}: ${uploadErr.message}`);
                console.warn(`[pipeline] Publer media upload failed [${route.platform}]: ${uploadErr.message}`);
                continue;
              }

              const baseCaption = item.prompt?.slice(0, 200) ?? 'New content';

              // A/B test T1 content on TikTok + Instagram
              if (item.tier === 'T1' && AB_TEST_PLATFORMS.includes(route.platform) && !item.mediaType === 'video') {
                try {
                  const { groupId, scheduled } = await runABTest({
                    contentItemId: item.id,
                    baseCaption,
                    mediaId: publerMedia.id,
                    platform: route.platform,
                    startTime: route.scheduledAt,
                    count: 5,
                    intervalMinutes: 30,
                  });
                  const ok = scheduled.filter(s => s.ok).length;
                  report.scheduled += ok;
                  report.schedule_failed += scheduled.length - ok;
                  console.log(`[pipeline] A/B test ${groupId}: ${ok}/5 variations scheduled on ${route.platform}`);
                } catch (abErr) {
                  // Fall back to single post on A/B failure
                  console.warn(`[pipeline] A/B test failed, falling back to single post: ${abErr.message}`);
                  const jobId = await schedulePost({
                    accountId: account.id,
                    networkKey: account.networkKey ?? route.platform,
                    caption: baseCaption,
                    scheduledAt: route.scheduledAt,
                    mediaId: publerMedia.id,
                    mediaType: item.mediaType === 'video' ? 'video' : 'photo',
                    postType: route.postType,
                  });
                  report.scheduled++;
                  console.log(`[pipeline] Fallback scheduled ${route.platform} @ ${route.scheduledAt} — job: ${jobId}`);
                }
              } else {
                const jobId = await schedulePost({
                  accountId: account.id,
                  networkKey: account.networkKey ?? route.platform,
                  caption: baseCaption,
                  scheduledAt: route.scheduledAt,
                  mediaId: publerMedia.id,
                  mediaType: item.mediaType === 'video' ? 'video' : 'photo',
                  postType: route.postType,
                });
                report.scheduled++;
                console.log(`[pipeline] Scheduled ${route.platform} @ ${route.scheduledAt} — job: ${jobId}`);
              }
            }
          } catch (err) {
            report.schedule_failed++;
            report.errors.push(`schedule_${route.platform}: ${err.message}`);
            console.warn(`[pipeline] Schedule failed [${route.platform}]: ${err.message}`);
          }
        }
      }
    }

    // 8. Log to Supabase
    report.completedAt = new Date().toISOString();
    const status = report.errors.length === 0 ? 'completed' : 'partial';
    await logAgentAction('pipeline', 'daily_content_pipeline', status, JSON.stringify(report));

    // 9. Return report
    console.log(`[pipeline] Done — generated: ${report.generated}, approved: ${report.qa_passed}, scheduled: ${report.scheduled}`);
    return report;

  } catch (err) {
    report.errors.push(`fatal: ${err.message}`);
    report.completedAt = new Date().toISOString();
    await logAgentAction('pipeline', 'daily_content_pipeline', 'failed', err.message).catch(() => {});
    console.error(`[pipeline] FATAL: ${err.message}`);
    throw err;
  }
}
