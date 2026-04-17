import 'dotenv/config';

const BASE = 'https://app.publer.com/api/v1';

let _workspaceId = null;

function baseHeaders(workspaceId = null) {
  const h = {
    'Authorization': `Bearer-API ${process.env.Publer_API}`,
    'Content-Type': 'application/json',
  };
  if (workspaceId) h['Publer-Workspace-Id'] = workspaceId;
  return h;
}

async function apiFetch(path, options = {}, workspaceId = null) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...baseHeaders(workspaceId), ...(options.headers ?? {}) },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = body?.message ?? body?.errors?.[0] ?? body?.error ?? res.statusText;
    throw new Error(`Publer API error ${res.status}: ${msg}`);
  }

  return body;
}

/**
 * Fetch workspaces and return the first workspace ID.
 * No workspace header needed for this call.
 * @returns {Promise<string>}
 */
export async function getWorkspaceId() {
  if (_workspaceId) return _workspaceId;
  const data = await apiFetch('/workspaces');
  const workspaces = data?.workspaces ?? data?.data ?? (Array.isArray(data) ? data : []);
  if (!workspaces.length) throw new Error('No workspaces found in Publer account');
  _workspaceId = String(workspaces[0]?.id ?? workspaces[0]);
  return _workspaceId;
}

/**
 * Fetch connected accounts.
 * Returns { instagram: {id, networkKey}, tiktok: {id, networkKey}, twitter: {id, networkKey} }
 */
export async function getPlatformIds() {
  const workspaceId = await getWorkspaceId();
  const data = await apiFetch('/accounts', {}, workspaceId);
  const accounts = Array.isArray(data) ? data : (data?.accounts ?? data?.data ?? []);

  const result = { instagram: null, tiktok: null, twitter: null };

  for (const account of accounts) {
    const type = (account?.type ?? '').toLowerCase();
    const id = String(account?.id ?? '');
    if (!id) continue;

    // networkKey must be the platform name, NOT the account type from the API response.
    // /accounts returns type 'ig_business' or 'ig_creator' but the networks key must be 'instagram'.
    if ((type === 'ig_business' || type === 'ig_creator' || type.includes('instagram')) && !result.instagram) {
      result.instagram = { id, networkKey: 'instagram' };
    } else if (type === 'tiktok' && !result.tiktok) {
      result.tiktok = { id, networkKey: 'tiktok' };
    } else if ((type === 'twitter' || type.includes('twitter') || type.includes('x')) && !result.twitter) {
      result.twitter = { id, networkKey: 'twitter' };
    }
  }

  return result;
}

/**
 * Upload a media file by URL and return the Publer media ID.
 * Must be called before schedulePost when the post has media.
 * @param {string} url - Public URL of the image or video
 * @returns {Promise<string>} Publer media ID
 */
export async function uploadMedia(url) {
  const workspaceId = await getWorkspaceId();
  const data = await apiFetch('/media', {
    method: 'POST',
    body: JSON.stringify({ url }),
  }, workspaceId);
  const mediaId = data?.id ?? data?.data?.id;
  if (!mediaId) throw new Error(`uploadMedia: no id in response — ${JSON.stringify(data)}`);
  return String(mediaId);
}

/**
 * Schedule a post via POST /posts/schedule using bulk format.
 * Publer does not accept media_urls directly — call uploadMedia() first.
 * @param {object} opts
 * @param {string} opts.accountId   - Publer account ID
 * @param {string} opts.networkKey  - Platform name: 'instagram' | 'tiktok' | 'twitter'
 * @param {string} opts.caption     - Post text/caption
 * @param {string} opts.scheduledAt - ISO 8601 UTC timestamp
 * @param {string|null} [opts.mediaUrl] - Public media URL (will be uploaded automatically)
 * @param {boolean} [opts.isVideo]  - true for video posts
 * @param {string|null} [opts.postType] - Override type: 'photo'|'reel'|'story'|'video'|'status'
 * @returns {Promise<string>} job_id
 */
export async function schedulePost({ accountId, networkKey, caption, scheduledAt, mediaUrl = null, isVideo = false, postType = null }) {
  const workspaceId = await getWorkspaceId();

  // Upload media first — Publer requires a media ID, not a URL in schedule payloads
  let mediaId = null;
  if (mediaUrl) {
    mediaId = await uploadMedia(mediaUrl);
  }

  // postType overrides auto-detection (e.g. 'reel', 'story')
  const derivedType = postType ?? (isVideo ? 'video' : (networkKey === 'twitter' ? 'status' : 'photo'));
  const networkPayload = {
    type: derivedType,
    text: caption,
    ...(mediaId ? { media: [{ id: mediaId }] } : {}),
  };

  const payload = {
    bulk: {
      state: 'scheduled',
      posts: [{
        networks: { [networkKey]: networkPayload },
        accounts: [{ id: accountId, scheduled_at: scheduledAt }],
      }],
    },
  };

  const data = await apiFetch('/posts/schedule', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, workspaceId);

  const jobId = data?.job_id ?? data?.id ?? data?.data?.job_id;
  if (!jobId) throw new Error(`schedulePost: no job_id in response — ${JSON.stringify(data)}`);

  return String(jobId);
}

/**
 * Check job status — returns true if completed/published.
 * @param {string} jobId
 * @returns {Promise<boolean>}
 */
export async function verifyPostLive(jobId) {
  const workspaceId = await getWorkspaceId();
  const data = await apiFetch(`/job_status/${jobId}`, {}, workspaceId);
  const status = (data?.status ?? data?.data?.status ?? '').toLowerCase();
  return status === 'completed';
}
