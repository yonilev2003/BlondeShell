/**
 * Debug Fanvue video — try URL-import again + probe signed URL pattern from uploadId
 */
import { createWriteStream, readFileSync, statSync } from 'fs';
import { unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE   = 'https://api.fanvue.com';
const CHUNK_SIZE = 10 * 1024 * 1024;
const supabase   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function getToken() {
  const { data } = await supabase.from('fanvue_tokens').select('access_token').eq('id', 'singleton').single();
  return data.access_token;
}

async function main() {
  const token = await getToken();

  const { data: video } = await supabase
    .from('content_items').select('id, url').eq('type', 'video').eq('qa_status', 'approved').limit(1).single();

  console.log(`Video URL: ${video.url}`);

  // === Try 1: URL-import with video ===
  console.log('\n=== Try 1: URL-import (video) ===');
  const initUrl = await fetch(`${API_BASE}/media/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: video.url, name: 'blondeshell_beach', filename: 'blondeshell_beach.mp4', mediaType: 'video' }),
  });
  const initUrlBody = await initUrl.json();
  console.log(`status: ${initUrl.status} body:`, JSON.stringify(initUrlBody).slice(0, 150));

  if (initUrl.ok) {
    const patchRes = await fetch(`${API_BASE}/media/uploads/${initUrlBody.uploadId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: [] }),
    });
    const patchBody = await patchRes.json();
    console.log(`PATCH status: ${patchRes.status} body:`, JSON.stringify(patchBody));

    if (patchRes.ok) {
      console.log('Polling 10s...');
      await new Promise(r => setTimeout(r, 10000));
      const poll = await fetch(`${API_BASE}/media/${initUrlBody.mediaUuid}`, { headers: { Authorization: `Bearer ${token}` } });
      console.log('Poll:', await poll.json());
    }
  }

  // === Try 2: Binary upload — decode uploadId to find S3 presigned URL pattern ===
  console.log('\n=== Try 2: Binary — init + try PascalCase parts ===');
  const tmpPath = join(__dirname, '../tmp_fanvue_video.mp4');
  const dlRes = await fetch(video.url);
  await pipeline(dlRes.body, createWriteStream(tmpPath));
  const fileSize = statSync(tmpPath).size;
  const fileBuffer = readFileSync(tmpPath);

  const initBin = await fetch(`${API_BASE}/media/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'blondeshell_beach', filename: 'blondeshell_beach.mp4', mediaType: 'video', fileSize, numParts: 1 }),
  });
  const initBinBody = await initBin.json();
  console.log('Init:', JSON.stringify(initBinBody).slice(0, 150));

  // The uploadId token after the uuid_ prefix — try as S3 presigned upload key
  const { uploadId, mediaUuid } = initBinBody;
  const token_part = uploadId?.split('_').slice(1).join('_'); // everything after first uuid_

  // Try: PUT directly to Fanvue with uploadId as query param
  console.log('\nTry PUT /media/uploads with uploadId query param...');
  const r1 = await fetch(`${API_BASE}/media/uploads?uploadId=${encodeURIComponent(uploadId)}&partNumber=1`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4' },
    body: fileBuffer,
  });
  console.log(`status: ${r1.status} body: ${(await r1.text()).slice(0, 200)}`);

  // Try: PATCH with PascalCase PartNumber (S3 convention)
  console.log('\nTry PATCH complete with PascalCase PartNumber (no actual upload)...');
  const r2 = await fetch(`${API_BASE}/media/uploads/${uploadId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts: [{ PartNumber: 1, ETag: 'dummy' }] }),
  });
  console.log(`status: ${r2.status} body: ${(await r2.json().then(JSON.stringify).catch(r2.text.bind(r2))).slice(0, 200)}`);

  await unlink(tmpPath).catch(() => {});
}

main().catch(err => { console.error(`FATAL: ${err.message}`); process.exit(1); });
