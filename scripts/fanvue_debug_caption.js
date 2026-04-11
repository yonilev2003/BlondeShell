/**
 * Probe which field name Fanvue accepts for post caption/text
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const API_BASE  = 'https://api.fanvue.com';
const MEDIA_UUID = '72c82380-dc90-4f70-bcaf-47a6b85be07f'; // already uploaded
const supabase   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getToken() {
  const { data } = await supabase.from('fanvue_tokens').select('access_token').eq('id', 'singleton').single();
  return data.access_token;
}

async function tryField(token, fieldName) {
  const body = {
    mediaUuids: [MEDIA_UUID],
    audience:   'followers-and-subscribers',
    isFree:     true,
    [fieldName]: `probe_${fieldName}`,
  };
  const res = await fetch(`${API_BASE}/posts`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const json = await res.json();
  const uuid = json.uuid ?? json.id;
  const textBack = json.text ?? json.description ?? json.body ?? json.content ?? '(none)';
  console.log(`  field="${fieldName}" → status:${res.status} uuid:${uuid} text_back:${textBack}`);

  // Delete right away if created
  if (uuid) {
    const del = await fetch(`${API_BASE}/posts/${uuid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`    deleted → ${del.status}`);
  }
  return { uuid, textBack, ok: res.ok };
}

async function main() {
  const token = await getToken();

  // 1. First delete the existing test post
  console.log('Deleting old test post...');
  const del = await fetch(`${API_BASE}/posts/4cf48537-e444-43d3-b1f7-a90f36b2291d`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`  DELETE old post → ${del.status}`);

  // 2. Probe each caption field name
  console.log('\nProbing caption field names:');
  for (const field of ['text', 'description', 'body', 'content', 'caption']) {
    await tryField(token, field);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
