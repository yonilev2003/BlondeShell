/**
 * lib/fanvue.js — Fanvue API client
 * Tokens live in Supabase fanvue_tokens (id='singleton').
 * Run npm run fanvue:auth once to populate them.
 */

import { statSync, readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const API_BASE  = 'https://api.fanvue.com';
const TOKEN_URL = 'https://auth.fanvue.com/oauth2/token';
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

/**
 * Get a fresh access token using the stored refresh token.
 * @returns {Promise<string>} access_token
 */
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
      'Content-Type':  'application/json',
      ...(options.headers ?? {}),
    },
  });

  // Auto-refresh on 401
  if (res.status === 401 && retryAuth) {
    await getAccessToken();
    return apiFetch(path, options, false);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Fanvue API ${res.status} ${path}: ${JSON.stringify(body)}`);
  return body;
}

// ─── Media upload ─────────────────────────────────────────────────────────────

/**
 * Import a media file into Fanvue from a public URL.
 * Fanvue fetches the file server-side — no binary upload needed.
 * @param {string} publicUrl  — publicly accessible URL (e.g. Supabase storage)
 * @param {string} [name]     — display name (defaults to filename from URL)
 * @returns {Promise<string>} mediaUuid
 */
export async function uploadMediaFromUrl(publicUrl, name) {
  const fileName  = name ?? publicUrl.split('/').pop().split('?')[0];
  const baseName  = fileName.replace(/\.[^.]+$/, '');
  const mediaType = fileName.endsWith('.mp4') ? 'video' : 'image';

  console.log(`[fanvue] Importing media from URL: ${fileName}`);

  const { access_token } = await getStoredTokens();

  // Phase 1: Tell Fanvue to fetch from URL
  const initRes = await fetch(`${API_BASE}/media/uploads`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url: publicUrl, name: baseName, filename: fileName, mediaType }),
  });

  const initBody = await initRes.json();
  if (!initRes.ok) throw new Error(`Upload init failed: ${JSON.stringify(initBody)}`);

  const uploadId  = initBody.uploadId  ?? initBody.upload_id;
  const mediaUuid = initBody.mediaUuid ?? initBody.uuid ?? initBody.id;
  if (!uploadId || !mediaUuid) throw new Error(`Missing uploadId/mediaUuid: ${JSON.stringify(initBody)}`);

  // Phase 2: Complete (parts: [] since Fanvue fetched it)
  const completeRes = await fetch(`${API_BASE}/media/uploads/${uploadId}`, {
    method:  'PATCH',
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ parts: [] }),
  });

  const completeBody = await completeRes.json();
  if (!completeRes.ok) throw new Error(`Upload complete failed: ${JSON.stringify(completeBody)}`);

  console.log(`[fanvue] Media processing — uuid: ${mediaUuid} status: ${completeBody.status}`);

  // Poll until status === "ready" (max 2 minutes)
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes  = await fetch(`${API_BASE}/media/${mediaUuid}`, {
      headers: { 'Authorization': `Bearer ${access_token}` },
    });
    const pollBody = await pollRes.json();
    console.log(`[fanvue] Media status: ${pollBody.status}`);
    if (pollBody.status === 'ready') break;
    if (pollBody.status === 'failed') throw new Error(`Media processing failed: ${JSON.stringify(pollBody)}`);
  }

  console.log(`[fanvue] Media ready — uuid: ${mediaUuid}`);
  return mediaUuid;
}

/**
 * Upload a local file to Fanvue via URL import.
 * Uploads to Supabase storage first, then imports URL into Fanvue.
 * @param {string} localFilePath
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<string>} mediaUuid
 */
export async function uploadMedia(localFilePath, supabaseClient) {
  if (!supabaseClient) throw new Error('uploadMedia requires supabaseClient — or use uploadMediaFromUrl(url) for Supabase-hosted files');

  const { createClient } = await import('@supabase/supabase-js');
  const sb = supabaseClient ?? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

// ─── Post creation ────────────────────────────────────────────────────────────

/**
 * Create a Fanvue post immediately.
 * @param {object} opts
 * @param {string[]} opts.mediaUuids
 * @param {string} opts.caption
 * @param {boolean} [opts.isFree=true]
 */
export async function createPost({ mediaUuids, caption, isFree = true, price = null, audience = 'followers-and-subscribers' }) {
  const payload = { text: caption, mediaUuids, isFree, audience };
  if (!isFree && price != null) payload.price = Math.round(price * 100); // dollars → cents, API min is 300 ($3.00)
  const post = await apiFetch('/posts', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });
  console.log(`[fanvue] Post created — id: ${post.id ?? post.uuid}`);
  return post;
}

/**
 * Schedule a Fanvue post.
 * @param {object} opts
 * @param {string[]} opts.mediaUuids
 * @param {string} opts.caption
 * @param {string} opts.scheduledAt — ISO 8601 UTC
 * @param {boolean} [opts.isFree=true]
 */
export async function scheduleFanvuePost({ mediaUuids, caption, scheduledAt, isFree = true, audience = 'followers-and-subscribers' }) {
  const post = await apiFetch('/posts', {
    method: 'POST',
    body:   JSON.stringify({ text: caption, mediaUuids, isFree, scheduledAt, audience }),
  });
  console.log(`[fanvue] Post scheduled — id: ${post.id ?? post.uuid} @ ${scheduledAt}`);
  return post;
}
