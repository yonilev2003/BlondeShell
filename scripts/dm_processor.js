import 'dotenv/config.js';

import { supabase, logAgentAction  } from '../lib/supabase.js';
import { withRetry  } from '../lib/retry.js';
import { generateImage  } from './generate_image.js';
import { generateVideo  } from './generate_video.js';

const POLL_INTERVAL_MS = 30_000;
const QUALIFICATION_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

// ── 5W+H field definitions ────────────────────────────────────────────────────
const REQUIRED_FIELDS = ['who', 'what', 'where', 'when', 'why'];
const OPTIONAL_FIELDS = ['how'];

const QUESTIONS = {
  who:   "Who should appear in the content? (Just BlondeShell, or with any specific elements?)",
  what:  "What should be happening in the image/video? (e.g. posing, working out, lounging...)",
  where: "Where is the location? (beach / gym / home / travel / other — REQUIRED)",
  when:  "What time of day / lighting / season? (e.g. golden hour, night, winter...)",
  why:   "What's the vibe or mood? (flirty / athletic / cozy / bold)",
  how:   "Any specifics on camera angle or outfit? (optional — skip to auto-select)",
};

// ── Main poll loop ────────────────────────────────────────────────────────────
async function startProcessor() {
  console.log('[dm_processor] Starting — polling every 30s');
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await processPendingEvents().catch(err =>
      console.error('[dm_processor] Poll error:', err.message)
    );
    await sleep(POLL_INTERVAL_MS);
  }
}

async function processPendingEvents() {
  const { data: events, error } = await supabase
    .from('dm_events')
    .select('*')
    .eq('fulfillment_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[dm_processor] Failed to fetch pending events:', error.message);
    return;
  }
  if (!events || events.length === 0) return;

  console.log(`[dm_processor] Processing ${events.length} pending event(s)`);
  for (const event of events) {
    await processEvent(event).catch(err =>
      console.error(`[dm_processor] Event ${event.id} error:`, err.message)
    );
  }
}

async function processEvent(event) {
  // ── Check 5W+H qualification ──────────────────────────────────────────────
  const missing = getMissingFields(event);

  if (missing.length > 0) {
    const startedAt = event.qualification_started_at
      ? new Date(event.qualification_started_at)
      : null;
    const now = new Date();

    // First time we detect missing fields — record start time
    if (!startedAt) {
      await updateEvent(event.id, { qualification_started_at: now.toISOString() });
      const question = QUESTIONS[missing[0]];
      await sendQualificationQuestion(event, question, missing[0]);
      return;
    }

    // Check timeout
    const elapsed = now - startedAt;
    if (elapsed >= QUALIFICATION_TIMEOUT_MS) {
      console.log(`[dm_processor] Event ${event.id} qualification timed out — offering "surprise me"`);
      await handleSurpriseMe(event);
      return;
    }

    // Still waiting — don't re-ask unless it's been >30min since last question
    const lastUpdate = new Date(event.updated_at || event.qualification_started_at);
    if (now - lastUpdate > 30 * 60 * 1000) {
      const question = QUESTIONS[missing[0]];
      await sendQualificationQuestion(event, question, missing[0]);
    }
    return;
  }

  // ── All fields present — mark complete and generate ───────────────────────
  await updateEvent(event.id, {
    qualification_complete: true,
    qualification_completed_at: new Date().toISOString(),
  });

  await fulfillEvent(event);
}

// ── Fulfillment with fallback tree ────────────────────────────────────────────
async function fulfillEvent(event) {
  const prompt = buildPrompt(event);
  const isVideo = event.content_type === 'video';

  let attempts = event.generation_attempts || 0;

  // Attempt 1: full generation
  try {
    attempts++;
    await updateEvent(event.id, { generation_attempts: attempts });

    const result = isVideo
      ? await generateVideo({
          start_frame_url: event.start_frame_url || null,
          motion_type: event.qualification_how || 'subtle',
          setting: event.qualification_where,
          prompt,
          dm_event_id: event.id,
        })
      : await generateImage({
          prompt,
          tier: 'T3',
          setting: event.qualification_where,
          mood: event.qualification_why,
          dm_event_id: event.id,
        });

    await updateEvent(event.id, {
      fulfillment_status: 'fulfilled',
      result_url: result.video_url || result.image_url,
    });
    await logAgentAction('dm_processor', 'fulfillment', 'completed',
      `event=${event.id} url=${result.video_url || result.image_url}`);
    return;

  } catch (err) {
    const code = err.code || '';

    // Safety filter → downgrade prompt and retry once
    if (isSafetyError(err)) {
      console.warn(`[dm_processor] Event ${event.id} safety filter — downgrading prompt`);
      const softerPrompt = softenPrompt(prompt);
      try {
        attempts++;
        await updateEvent(event.id, { generation_attempts: attempts });
        const result = isVideo
          ? await generateVideo({
              start_frame_url: event.start_frame_url || null,
              motion_type: event.qualification_how || 'subtle',
              setting: event.qualification_where,
              prompt: softerPrompt,
              dm_event_id: event.id,
            })
          : await generateImage({
              prompt: softerPrompt,
              tier: 'T3',
              setting: event.qualification_where,
              mood: event.qualification_why,
              dm_event_id: event.id,
            });

        await updateEvent(event.id, {
          fulfillment_status: 'fulfilled',
          result_url: result.video_url || result.image_url,
          generation_fail_reason: 'safety_downgraded',
        });
        return;
      } catch (retryErr) {
        // Both attempts failed safety — offer library match
        console.warn(`[dm_processor] Event ${event.id} safety retry failed — offering library`);
        await offerLibraryMatch(event, 'safety_filter');
        return;
      }
    }

    // Hard block (FACE_HARD_STOP etc.) → offer library match
    if (isHardBlock(err)) {
      console.error(`[dm_processor] Event ${event.id} hard block: ${err.message}`);
      await offerLibraryMatch(event, err.message);
      return;
    }

    // Technical error → retry ×2 with backoff via lib/retry.js
    try {
      const retryFn = isVideo
        ? () => generateVideo({
            start_frame_url: event.start_frame_url || null,
            motion_type: event.qualification_how || 'subtle',
            setting: event.qualification_where,
            prompt,
            dm_event_id: event.id,
          })
        : () => generateImage({
            prompt,
            tier: 'T3',
            setting: event.qualification_where,
            mood: event.qualification_why,
            dm_event_id: event.id,
          });

      const result = await withRetry(retryFn, {
        label: `dm_fulfill_${event.id}`,
        maxRetries: 2,
        baseDelayMs: 3000,
      });

      await updateEvent(event.id, {
        fulfillment_status: 'fulfilled',
        result_url: result.video_url || result.image_url,
        generation_fail_reason: 'technical_retried',
      });
    } catch (finalErr) {
      // All retries exhausted — queue + notify
      attempts++;
      await updateEvent(event.id, {
        generation_attempts: attempts,
        fulfillment_status: 'failed_queued',
        generation_fail_reason: finalErr.message,
      });
      await logAgentAction('dm_processor', 'fulfillment', 'failed',
        `event=${event.id} queued. reason: ${finalErr.message}`);
      console.error(`[dm_processor] Event ${event.id} queued after all retries: ${finalErr.message}`);
    }
  }
}

// ── Library match fallback ────────────────────────────────────────────────────
async function offerLibraryMatch(event, reason) {
  const { data: match } = await supabase
    .from('video_library')
    .select('video_url')
    .eq('setting', event.qualification_where || 'home')
    .eq('archive_status', 'active')
    .limit(1)
    .single();

  if (match) {
    await updateEvent(event.id, {
      fulfillment_status: 'failed_substitute',
      result_url: match.video_url,
      generation_fail_reason: reason,
    });
    await logAgentAction('dm_processor', 'library_match', 'completed',
      `event=${event.id} substitute=${match.video_url}`);
  } else {
    // No library match and no generation — no charge
    await updateEvent(event.id, {
      fulfillment_status: 'failed_no_charge',
      generation_fail_reason: reason,
    });
    await logAgentAction('dm_processor', 'fulfillment', 'failed_no_charge',
      `event=${event.id} no library match. reason: ${reason}`);
  }
}

// ── Surprise me (timeout fallback) ───────────────────────────────────────────
async function handleSurpriseMe(event) {
  // Fill in defaults for missing fields and generate
  const patched = {
    ...event,
    qualification_who:   event.qualification_who   || 'BlondeShell',
    qualification_what:  event.qualification_what  || 'posing confidently',
    qualification_where: event.qualification_where || 'home',
    qualification_when:  event.qualification_when  || 'golden hour',
    qualification_why:   event.qualification_why   || 'flirty',
  };
  await updateEvent(event.id, {
    qualification_who:   patched.qualification_who,
    qualification_what:  patched.qualification_what,
    qualification_where: patched.qualification_where,
    qualification_when:  patched.qualification_when,
    qualification_why:   patched.qualification_why,
    qualification_complete: true,
    qualification_completed_at: new Date().toISOString(),
  });
  await fulfillEvent(patched);
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(event) {
  const who   = event.qualification_who   || 'BlondeShell';
  const what  = event.qualification_what  || 'posing';
  const where = event.qualification_where || 'indoors';
  const when  = event.qualification_when  || 'daytime';
  const why   = event.qualification_why   || 'confident';
  const how   = event.qualification_how   ? `, ${event.qualification_how}` : '';

  return `${who}, ${what}, at ${where}, ${when} lighting, ${why} mood${how}. High quality, photorealistic.`;
}

// ── Qualification helpers ─────────────────────────────────────────────────────
function getMissingFields(event) {
  return REQUIRED_FIELDS.filter(f => !event[`qualification_${f}`]);
}

async function sendQualificationQuestion(event, question, fieldName) {
  // In production this calls Substy API to send the DM reply.
  // For now: log the intent and update the event.
  console.log(`[dm_processor] Qualification question for event ${event.id} [${fieldName}]: ${question}`);
  await logAgentAction('dm_processor', 'qualification', 'question_sent',
    `event=${event.id} field=${fieldName}`);
  await updateEvent(event.id, { updated_at: new Date().toISOString() });
}

// ── Error classifiers ─────────────────────────────────────────────────────────
function isSafetyError(err) {
  const msg = (err.message || '').toLowerCase();
  return msg.includes('safety') || msg.includes('content_policy') || msg.includes('nsfw');
}

function isHardBlock(err) {
  return err.code === 'FACE_HARD_STOP' || err.code === 'HARD_BLOCK';
}

function softenPrompt(prompt) {
  return prompt
    .replace(/explicit|nude|topless|naked/gi, 'tasteful')
    .replace(/sensual/gi, 'confident')
    + ' SFW, tasteful, artistic.';
}

// ── DB helper ─────────────────────────────────────────────────────────────────
async function updateEvent(id, fields) {
  const { error } = await supabase
    .from('dm_events')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.warn(`[dm_processor] updateEvent ${id} failed:`, error.message);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Entry point ───────────────────────────────────────────────────────────────
if (require.main === module) {
  startProcessor().catch(err => {
    console.error('[dm_processor] Fatal:', err.message);
    process.exit(1);
  });
}

export { startProcessor, processEvent, buildPrompt, getMissingFields };
