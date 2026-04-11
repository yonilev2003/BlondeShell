/**
 * Debug Fanvue upload — try URL-based import (Fanvue fetches from URL)
 * and probe the PATCH complete endpoint with uploadId
 */
import { statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE  = 'https://api.fanvue.com';
const IMAGE_URL = 'https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/content/generated/images/638566a7-b245-439e-88d4-84f4899eaee5.png';
const TMP_PATH  = join(__dirname, '../tmp_fanvue_test.png');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getToken() {
  const { data } = await supabase.from('fanvue_tokens').select('access_token').eq('id','singleton').single();
  return data.access_token;
}

async function main() {
  const token    = await getToken();
  const fileSize = statSync(TMP_PATH).size;

  // 1: POST /media/uploads with url + name + filename + mediaType (URL-based import)
  console.log('--- POST /media/uploads with url + name + filename ---');
  const r1 = await fetch(`${API_BASE}/media/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url:       IMAGE_URL,
      name:      'blondeshell_beach',
      filename:  'blondeshell_beach.png',
      mediaType: 'image',
    }),
  });
  console.log('status:', r1.status, '\nbody:', (await r1.text()).slice(0, 800));

  // 2: Fresh init + PATCH complete immediately (to see what PATCH /media/uploads/{uploadId} expects)
  console.log('\n--- Fresh init + PATCH /media/uploads/{uploadId} ---');
  const initRes = await fetch(`${API_BASE}/media/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test', filename: 'test.png', mediaType: 'image', fileSize, numParts: 1 }),
  });
  const init = await initRes.json();
  console.log('init:', JSON.stringify(init));

  // PATCH with empty parts
  const r2 = await fetch(`${API_BASE}/media/uploads/${init.uploadId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts: [] }),
  });
  console.log('PATCH (empty parts) status:', r2.status, '\nbody:', (await r2.text()).slice(0, 600));

  // PATCH with no body
  const r3 = await fetch(`${API_BASE}/media/uploads/${init.uploadId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  console.log('PATCH (empty body) status:', r3.status, '\nbody:', (await r3.text()).slice(0, 600));
}

main().catch(err => { console.error(err.message); process.exit(1); });
