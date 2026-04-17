import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SEGMENT_THRESHOLDS = {
  WHALE_PERCENTILE: 0.90,
  ACTIVE_DAYS: 7,
  NEW_DAYS: 7,
  AT_RISK_DAYS: 7,
  CHURNED_DAYS: 30,
};

const PPV_RANGES = {
  whale: { min: 35, max: 50 },
  active: { min: 10, max: 25 },
  new: { min: 5, max: 5 },
  at_risk: { min: 5, max: 15 },
  churned: { min: 0, max: 0 },
};

function segmentSubscribers(subscribers) {
  if (!subscribers?.length) return [];

  const spends = subscribers
    .map(s => s.total_spend || 0)
    .sort((a, b) => b - a);
  const whaleThreshold = spends[Math.floor(spends.length * (1 - SEGMENT_THRESHOLDS.WHALE_PERCENTILE))] || 0;

  const now = new Date();

  return subscribers.map(sub => {
    const lastActive = sub.last_dm_opened ? new Date(sub.last_dm_opened) : null;
    const createdAt = sub.created_at ? new Date(sub.created_at) : null;
    const daysSinceActive = lastActive ? Math.floor((now - lastActive) / (24 * 60 * 60 * 1000)) : Infinity;
    const daysSinceCreated = createdAt ? Math.floor((now - createdAt) / (24 * 60 * 60 * 1000)) : Infinity;
    const totalSpend = sub.total_spend || 0;

    if (totalSpend >= whaleThreshold && whaleThreshold > 0) {
      const range = PPV_RANGES.whale;
      const price = Math.min(range.max, Math.max(range.min, Math.round(totalSpend * 0.1)));
      return { ...sub, segment: 'whale', recommended_ppv_price: price };
    }

    if (daysSinceCreated <= SEGMENT_THRESHOLDS.NEW_DAYS) {
      return {
        ...sub,
        segment: 'new',
        recommended_ppv_price: PPV_RANGES.new.min,
        onboarding_step: Math.min(3, Math.floor(daysSinceCreated / 2)),
      };
    }

    if (daysSinceActive >= SEGMENT_THRESHOLDS.CHURNED_DAYS) {
      return { ...sub, segment: 'churned', recommended_ppv_price: 0 };
    }

    if (daysSinceActive >= SEGMENT_THRESHOLDS.AT_RISK_DAYS) {
      return {
        ...sub,
        segment: 'at_risk',
        recommended_ppv_price: PPV_RANGES.at_risk.min,
        win_back_attempts: sub.win_back_attempts || 0,
      };
    }

    const range = PPV_RANGES.active;
    const price = Math.min(range.max, Math.max(range.min, Math.round(10 + (sub.dm_count || 0) * 0.5)));
    return { ...sub, segment: 'active', recommended_ppv_price: price };
  });
}

async function getRecommendedPPVPrice(subscriberId) {
  const { data, error } = await supabase
    .from('subscriber_segments')
    .select('segment, recommended_ppv_price')
    .eq('fanvue_id', subscriberId)
    .single();

  if (error || !data) return PPV_RANGES.active.min;
  return data.recommended_ppv_price;
}

async function getSegmentCounts() {
  const { data, error } = await supabase
    .from('subscriber_segments')
    .select('segment');

  if (error || !data) return { whale: 0, active: 0, new: 0, at_risk: 0, churned: 0 };

  const counts = { whale: 0, active: 0, new: 0, at_risk: 0, churned: 0 };
  for (const row of data) {
    if (counts[row.segment] !== undefined) counts[row.segment]++;
  }
  return counts;
}

async function updateSegments() {
  const { data: subscribers, error } = await supabase
    .from('subscribers')
    .select('fanvue_id, dm_count, last_dm_opened, total_spend, created_at, status, win_back_attempts');

  if (error) throw new Error(`updateSegments fetch failed: ${error.message}`);
  if (!subscribers?.length) return { updated: 0, segments: {} };

  const segmented = segmentSubscribers(subscribers);
  let updated = 0;

  for (const sub of segmented) {
    const record = {
      fanvue_id: sub.fanvue_id,
      segment: sub.segment,
      recommended_ppv_price: sub.recommended_ppv_price || PPV_RANGES.active.min,
      onboarding_step: sub.onboarding_step || 0,
      win_back_attempts: sub.win_back_attempts || 0,
      last_segment_update: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('subscriber_segments')
      .upsert(record, { onConflict: 'fanvue_id' });

    if (upsertError) {
      console.error(`[crm] upsert failed for ${sub.fanvue_id}: ${upsertError.message}`);
      continue;
    }
    updated++;
  }

  const counts = { whale: 0, active: 0, new: 0, at_risk: 0, churned: 0 };
  for (const sub of segmented) {
    if (counts[sub.segment] !== undefined) counts[sub.segment]++;
  }

  console.log(`[crm] Updated ${updated}/${segmented.length} subscriber segments`);
  return { updated, segments: counts };
}

export { segmentSubscribers, getRecommendedPPVPrice, getSegmentCounts, updateSegments };
