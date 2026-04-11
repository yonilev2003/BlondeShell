import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const BASE = 'https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/Hero_Dataset/';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function saveImage({ type = 'image', setting, tier, mood, url, prompt, batch_id, platforms = [] }) {
  const { data, error } = await supabase
    .from('content_items')
    .insert({
      type,
      setting,
      tier,
      mood,
      url,
      prompt,
      batch_id,
      qa_status: 'pending',
      platforms,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`saveImage failed: ${error.message}`);
  return data;
}

export async function saveVideo({
  setting,
  tier,
  mood,
  url,
  prompt,
  batch_id,
  source_image_id,
  duration_seconds = 5,
  platforms = [],
}) {
  const { data, error } = await supabase
    .from('content_items')
    .insert({
      type: 'video',
      setting,
      tier,
      mood,
      url,
      prompt,
      batch_id,
      source_image_id,
      duration_seconds,
      qa_status: 'pending',
      platforms,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`saveVideo failed: ${error.message}`);
  return data;
}

export async function updateQAStatus(id, qa_status) {
  const validStatuses = ['pending', 'approved', 'rejected', 'regenerate', 'superseded', 'platform_rejected'];
  if (!validStatuses.includes(qa_status)) {
    throw new Error(`Invalid qa_status: ${qa_status}`);
  }

  const { error } = await supabase
    .from('content_items')
    .update({ qa_status })
    .eq('id', id);

  if (error) throw new Error(`updateQAStatus failed: ${error.message}`);
}

export async function getReferenceUrls(filenames) {
  return filenames.map((f) => BASE + f);
}

export async function getPendingQA({ batch_id } = {}) {
  let query = supabase
    .from('content_items')
    .select('*')
    .eq('qa_status', 'pending')
    .order('created_at', { ascending: true });

  if (batch_id) query = query.eq('batch_id', batch_id);

  const { data, error } = await query;
  if (error) throw new Error(`getPendingQA failed: ${error.message}`);
  return data;
}
