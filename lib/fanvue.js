/**
 * lib/fanvue.js — Fanvue API client (v2025)
 * Tokens live in Supabase fanvue_tokens (id='singleton').
 * Run npm run fanvue:auth once to populate them.
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const API_BASE   = 'https://api.fanvue.com';
const TOKEN_URL  = 'https://auth.fanvue.com/oauth2/token';
const API_VERSION = '2025-06-26';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TIER_AUDIENCE = {
  T1: 'followers-and-subscribers',
  T2: 'subscribers',
  T3: 'subscribers',
};

// ─── Token management ─────────────────────────────────────────────────────────

async function getStoredTokens() {
  const { data, error } = await supabase
    .from('fanvue_tokens')
    .select('access_token, refresh_token')
    .eq('id', 'singleton')
    .single();

  if (error || !data?.refresh_token) {
    throw new Error('No Fanvue tokens found — run: npm run fanvue:auth');
  }
  return data;
}

async function saveTokens(access_token, refresh_token) {
  const updates = { id: 'singleton', access_token, updated_at: new Date().toISOString() };
  if (refresh_token) updates.refresh_token = refresh_token;

  const { error } = await supabase
    .from('fanvue_tokens')
    .upsert(updates, { onConflict: 'id' });

  if (error) console.warn('[fanvue] Failed to persist refreshed token:', error.message);
}

export async function getAccessToken() {
  const { refresh_token } = await getStoredTokens();

  const basicAuth = Buffer.from(
    `${process.env.FANVUE_CLIENT_ID}:${process.env.FANVUE_CLIENT_SECRET}`
  ).toString('base64');

  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token,
  });

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`,
    },
    body: params.toString(),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${body.error_description ?? body.error ?? res.statusText}`);

  await saveTokens(body.access_token, body.refresh_token);
  return body.access_token;
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}, retryAuth = true) {
  const { access_token } = await getStoredTokens();

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'X-Fanvue-API-Version': API_VERSION,
      'Content-Type':  'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401 && retryAuth) {
    await getAccessToken();
    return apiFetch(path, options, false);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Fanvue API ${res.status} ${path}: ${JSON.stringify(body)}`);
  return body;
}

// ─── Media upload ─────────────────────────────────────────────────────────────

async function pollMediaReady(mediaUuid, accessToken, timeoutMs = 2 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  let errorCount = 0;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes  = await fetch(`${API_BASE}/media/${mediaUuid}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Fanvue-API-Version': API_VERSION,
      },
    });
    const pollBody = await pollRes.json();
    console.log(`[fanvue] Media status: ${pollBody.status}${pollBody.error ? ' — ' + pollBody.error : ''}`);
    if (pollBody.status === 'ready') return pollBody;
    if (pollBody.status === 'failed') throw new Error(`Media processing failed: ${JSON.stringify(pollBody)}`);
    if (pollBody.status === 'error') {
      errorCount++;
      if (errorCount >= 3) {
        throw new Error(`Media processing returned 'error' 3x — full response: ${JSON.stringify(pollBody)}`);
      }
    }
  }
  throw new Error(`Media processing timed out after ${timeoutMs}ms — uuid: ${mediaUuid}`);
}

// Phase 2 helper: get signed URL for a chunk, PUT the bytes to S3
async function uploadChunk(uploadId, partNumber, chunkBytes, accessToken, contentType) {
  const urlRes = await fetch(`${API_BASE}/media/uploads/${uploadId}/parts/${partNumber}/url`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Fanvue-API-Version': API_VERSION,
    },
  });

  if (!urlRes.ok) {
    const errBody = await urlRes.text();
    throw new Error(`Get signed URL failed (part ${partNumber}) ${urlRes.status}: ${errBody}`);
  }

  const responseText = await urlRes.text();
  let signedUrl;
  try {
    const parsed = JSON.parse(responseText);
    signedUrl = typeof parsed === 'string' ? parsed : (parsed.url ?? parsed.signedUrl);
  } catch {
    signedUrl = responseText.trim().replace(/^"|"$/g, '');
  }

  if (!signedUrl || !signedUrl.startsWith('http')) {
    throw new Error(`Invalid signed URL response for part ${partNumber}: ${responseText.slice(0, 200)}`);
  }

  // Debug: log the signed URL structure (query params reveal S3 requirements)
  if (process.env.FANVUE_DEBUG === '1') {
    const urlObj = new URL(signedUrl);
    console.log(`[fanvue:debug] S3 host: ${urlObj.host}`);
    console.log(`[fanvue:debug] S3 path: ${urlObj.pathname}`);
    console.log(`[fanvue:debug] Signed headers: ${urlObj.searchParams.get('X-Amz-SignedHeaders') || '(none)'}`);
  }

  // S3 signed URLs embed the expected Content-Type in the signature
  // If we send a different one, S3 rejects. Try WITHOUT Content-Type first (S3 will apply default).
  const putRes = await fetch(signedUrl, {
    method: 'PUT',
    body: chunkBytes,
  });

  const putResponseText = await putRes.text().catch(() => '');

  if (process.env.FANVUE_DEBUG === '1') {
    console.log(`[fanvue:debug] S3 PUT status: ${putRes.status}`);
    console.log(`[fanvue:debug] S3 PUT headers: ETag=${putRes.headers.get('etag')}, x-amz-request-id=${putRes.headers.get('x-amz-request-id')}`);
    if (putResponseText) console.log(`[fanvue:debug] S3 PUT body: ${putResponseText.slice(0, 500)}`);
  }

  if (!putRes.ok) {
    throw new Error(`S3 chunk upload failed (part ${partNumber}) ${putRes.status}: ${putResponseText.slice(0, 300)}`);
  }
}

// Proper multipart upload: Phase 1 (init) → Phase 2 (chunks) → Phase 3 (complete)
export async function uploadMediaBuffer(buffer, filename, mimeType) {
  const mediaType = mimeType.startsWith('video/') ? 'video' : 'image';
  const baseName = filename.replace(/\.[^.]+$/, '');
  const { access_token } = await getStoredTokens();

  console.log(`[fanvue] Multipart upload: ${filename} (${(buffer.length / 1024).toFixed(0)}KB, ${mediaType})`);

  // Phase 1: create upload session (only name, filename, mediaType per docs)
  const initRes = await fetch(`${API_BASE}/media/uploads`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'X-Fanvue-API-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: baseName,
      filename,
      mediaType,
    }),
  });
  const initBody = await initRes.json();
  if (!initRes.ok) throw new Error(`Phase 1 failed: ${JSON.stringify(initBody)}`);

  const uploadId  = initBody.uploadId;
  const mediaUuid = initBody.mediaUuid;
  if (!uploadId || !mediaUuid) throw new Error(`Missing uploadId/mediaUuid in init: ${JSON.stringify(initBody)}`);

  console.log(`[fanvue] Session created — uploadId: ${uploadId.slice(0, 20)}...`);

  // Phase 2: upload chunks via S3 signed URLs
  const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, buffer.length);
    const chunk = buffer.subarray(start, end);
    const partNumber = i + 1;

    console.log(`[fanvue] Uploading chunk ${partNumber}/${totalChunks} (${(chunk.length / 1024).toFixed(0)}KB)`);
    await uploadChunk(uploadId, partNumber, chunk, access_token, mimeType);
  }

  // Phase 3: complete — empty body per docs
  const completeRes = await fetch(`${API_BASE}/media/uploads/${uploadId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'X-Fanvue-API-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  const completeBody = await completeRes.json();
  if (!completeRes.ok) throw new Error(`Phase 3 failed: ${JSON.stringify(completeBody)}`);

  console.log(`[fanvue] Processing — uuid: ${mediaUuid} status: ${completeBody.status}`);
  await pollMediaReady(mediaUuid, access_token);

  console.log(`[fanvue] Media ready — uuid: ${mediaUuid}`);
  return mediaUuid;
}

// Backward-compatible: download URL then multipart upload
export async function uploadMediaFromUrl(publicUrl, name) {
  const fileName = name ?? publicUrl.split('/').pop().split('?')[0];
  const mimeType = fileName.endsWith('.mp4')  ? 'video/mp4'
                 : fileName.endsWith('.jpg')  ? 'image/jpeg'
                 : fileName.endsWith('.jpeg') ? 'image/jpeg'
                 : fileName.endsWith('.png')  ? 'image/png'
                 :                              'application/octet-stream';

  console.log(`[fanvue] Downloading from URL: ${fileName}`);
  const res = await fetch(publicUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.status} from ${publicUrl}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  return uploadMediaBuffer(buffer, fileName, mimeType);
}

export async function uploadMedia(localFilePath, supabaseClient) {
  if (!supabaseClient) throw new Error('uploadMedia requires supabaseClient — or use uploadMediaFromUrl(url) for Supabase-hosted files');

  const sb = supabaseClient;

  const fileName    = localFilePath.split('/').pop();
  const fileBuffer  = readFileSync(localFilePath);
  const contentType = fileName.endsWith('.mp4') ? 'video/mp4' : 'image/png';
  const storagePath = `fanvue_upload/${Date.now()}_${fileName}`;

  console.log(`[fanvue] Uploading ${fileName} to Supabase storage...`);
  const { error: uploadErr } = await sb.storage
    .from('content')
    .upload(storagePath, fileBuffer, { contentType, upsert: true });
  if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`);

  const { data: { publicUrl } } = sb.storage.from('content').getPublicUrl(storagePath);
  return uploadMediaFromUrl(publicUrl, fileName);
}

// ─── Vault upload (images + videos) ──────────────────────────────────────────

export async function vaultUpload(mediaUrl, mediaType = 'image') {
  const fileName = mediaUrl.split('/').pop().split('?')[0];
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const resolvedType = mediaType === 'video' || fileName.endsWith('.mp4') ? 'video' : 'image';

  console.log(`[fanvue] Vault upload: ${fileName} (${resolvedType})`);

  const { access_token } = await getStoredTokens();

  const initRes = await fetch(`${API_BASE}/vault/media`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url: mediaUrl, name: baseName, filename: fileName, mediaType: resolvedType }),
  });

  const initBody = await initRes.json();
  if (!initRes.ok) throw new Error(`Vault upload init failed: ${JSON.stringify(initBody)}`);

  const mediaUuid = initBody.mediaUuid ?? initBody.uuid ?? initBody.id;
  if (!mediaUuid) throw new Error(`Missing vault mediaUuid: ${JSON.stringify(initBody)}`);

  // Videos need longer processing time
  const timeoutMs = resolvedType === 'video' ? 5 * 60 * 1000 : 2 * 60 * 1000;
  await pollMediaReady(mediaUuid, access_token, timeoutMs);

  console.log(`[fanvue] Vault media ready — uuid: ${mediaUuid} type: ${resolvedType}`);
  return mediaUuid;
}

// ─── Mass messaging (PPV) ────────────────────────────────────────────────────

export async function massMessage(subscriberIds, message, mediaUrl = null, ppvPrice = null) {
  if (!subscriberIds?.length) throw new Error('massMessage requires at least one subscriberId');

  let mediaUuids = [];
  if (mediaUrl) {
    const uuid = await vaultUpload(mediaUrl, mediaUrl.endsWith('.mp4') ? 'video' : 'image');
    mediaUuids = [uuid];
  }

  const payload = {
    recipientIds: subscriberIds,
    text: message,
    mediaUuids,
  };

  if (ppvPrice != null) {
    payload.isPPV = true;
    payload.price = Math.round(ppvPrice * 100); // dollars → cents
  }

  console.log(`[fanvue] Mass message to ${subscriberIds.length} subscribers, PPV: ${ppvPrice != null ? `$${ppvPrice}` : 'free'}`);

  const result = await apiFetch('/messages/mass', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });

  console.log(`[fanvue] Mass message sent — id: ${result.id ?? result.messageId ?? 'ok'}`);
  return result;
}

// ─── Post creation ───────────────────────────────────────────────────────────

export async function createPost({ mediaUuids, caption, isFree = true, price = null, audience = 'followers-and-subscribers' }) {
  const payload = { text: caption, mediaUuids, isFree, audience };
  if (!isFree && price != null) payload.price = Math.round(price * 100);
  const post = await apiFetch('/posts', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
  console.log(`[fanvue] Post created — id: ${post.id ?? post.uuid}`);
  return post;
}

export async function scheduleFanvuePost({ mediaUuids, caption, scheduledAt, isFree = true, audience = 'followers-and-subscribers' }) {
  const post = await apiFetch('/posts', {
    method: 'POST',
    body:   JSON.stringify({ text: caption, mediaUuids, isFree, scheduledAt, audience }),
  });
  console.log(`[fanvue] Post scheduled — id: ${post.id ?? post.uuid} @ ${scheduledAt}`);
  return post;
}

export async function createScheduledPost(mediaUrl, caption, scheduledAt, tier = 'T3', isPPV = false, ppvPrice = null) {
  const mediaType = mediaUrl.endsWith('.mp4') ? 'video' : 'image';
  const mediaUuid = await vaultUpload(mediaUrl, mediaType);

  const audience = TIER_AUDIENCE[tier] ?? 'subscribers';
  const isFree = !isPPV;

  const payload = {
    text: caption,
    mediaUuids: [mediaUuid],
    isFree,
    audience,
  };

  if (scheduledAt) payload.scheduledAt = scheduledAt;
  if (isPPV && ppvPrice != null) payload.price = Math.round(ppvPrice * 100);

  const post = await apiFetch('/posts', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });

  const postId = post.id ?? post.uuid;
  console.log(`[fanvue] ${scheduledAt ? 'Scheduled' : 'Created'} ${tier} post — id: ${postId}, PPV: ${isPPV ? `$${ppvPrice}` : 'free'}`);
  return post;
}
