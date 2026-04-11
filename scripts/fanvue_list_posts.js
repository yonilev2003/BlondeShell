import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const API_BASE = 'https://api.fanvue.com';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getToken() {
  const { data } = await supabase.from('fanvue_tokens').select('access_token').eq('id', 'singleton').single();
  return data.access_token;
}

async function main() {
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}` };

  for (const path of ['/posts', '/users/me/posts', '/me/posts', '/creator/posts']) {
    const res = await fetch(`${API_BASE}${path}`, { headers });
    const text = await res.text();
    console.log(`\n--- GET ${path} → ${res.status} ---`);
    if (res.ok) {
      const body = JSON.parse(text);
      const posts = body.data ?? body.posts ?? (Array.isArray(body) ? body : null);
      if (posts) {
        posts.slice(0, 10).forEach(p => {
          console.log(`  uuid: ${p.uuid}  audience: ${p.audience}  created: ${p.createdAt ?? p.created_at}  text: ${(p.text ?? '').slice(0, 40)}`);
        });
      } else {
        console.log(text.slice(0, 400));
      }
    } else {
      console.log(text.slice(0, 200));
    }
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
