import { createClient } from '@supabase/supabase-js';
import { uploadMediaFromUrl, createPost } from '../lib/fanvue.js';
import 'dotenv/config';

const API_BASE  = 'https://api.fanvue.com';
const IMAGE_URL = 'https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/content/generated/images/638566a7-b245-439e-88d4-84f4899eaee5.png';
const supabase  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getToken() {
  const { data } = await supabase.from('fanvue_tokens').select('access_token').eq('id', 'singleton').single();
  return data.access_token;
}

async function main() {
  const token = await getToken();

  // Delete previous test post
  console.log('Deleting previous test post...');
  const del = await fetch(`${API_BASE}/posts/d8f9cdfc-bd26-43ed-bc38-42e0d25b474a`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`  DELETE → ${del.status}`);

  // 1. Upload + poll until ready
  console.log('\n[fanvue_test] Importing image — will poll until ready...');
  const mediaUuid = await uploadMediaFromUrl(IMAGE_URL, 'blondeshell_beach.png');

  // 2. Create post
  console.log('[fanvue_test] Creating post...');
  const post = await createPost({ mediaUuids: [mediaUuid], caption: 'golden hour 🌅', isFree: true });

  // 3. Verify via GET /posts
  console.log('[fanvue_test] Verifying via GET /posts...');
  const listRes  = await fetch(`${API_BASE}/posts?limit=1`, { headers: { Authorization: `Bearer ${token}` } });
  const listBody = await listRes.json();
  const posts    = listBody.data ?? listBody.posts ?? (Array.isArray(listBody) ? listBody : []);
  const found    = posts.find(p => p.uuid === post.uuid);

  console.log('\n✅ Post confirmed!');
  console.log(`   uuid:      ${post.uuid}`);
  console.log(`   text:      ${found?.text ?? post.text}`);
  console.log(`   audience:  ${found?.audience ?? post.audience}`);
  console.log(`   published: ${found?.publishedAt ?? post.publishedAt}`);
}

main().catch(err => { console.error(`FATAL: ${err.message}`); process.exit(1); });
