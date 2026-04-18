import 'dotenv/config';
import { readFileSync } from 'fs';

const BASE = 'https://app.publer.com/api/v1';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

let _workspaceId = null;

function baseHeaders(includeWorkspace = true) {
  const h = {
    'Authorization': `Bearer-API ${process.env.Publer_API}`,
    'Content-Type': 'application/json',
  };
  if (includeWorkspace) {
    const ws = _workspaceId || process.env.PUBLER_WORKSPACE_ID;
    if (ws) h['Publer-Workspace-Id'] = ws;
  }
  return h;
}

async function apiFetch(path, options = {}, { includeWorkspace = true } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...baseHeaders(includeWorkspace), ...(options.headers ?? {}) },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.message ?? body?.errors?.[0] ?? body?.error ?? res.statusText;
    throw new Error(`Publer ${res.status} ${path}: ${JSON.stringify(msg)}`);
  }
  return body;
}

export async function getWorkspaceId() {
  if (_workspaceId) return _workspaceId;
  if (process.env.PUBLER_WORKSPACE_ID) {
    _workspaceId = process.env.PUBLER_WORKSPACE_ID;
    return _workspaceId;
  }
  const data = await apiFetch('/workspaces', {}, { includeWorkspace: false });
  const workspaces = Array.isArray(data) ? data : (data?.workspaces ?? data?.data ?? []);
  if (!workspaces.length) throw new Error('No workspaces found');
  _workspaceId = String(workspaces[0]?.id ?? workspaces[0]);
  return _workspaceId;
}

export async function getPlatformIds() {
  await getWorkspaceId();
  const data = await apiFetch('/accounts');
  const accounts = Array.isArray(data) ? data : (data?.accounts ?? data?.data ?? []);

  const result = { instagram: null, tiktok: null, twitter: null };

  for (const account of accounts) {
    const provider = (account?.provider ?? '').toLowerCase();
    const type = (account?.type ?? '').toLowerCase();
    const id = String(account?.id ?? '');
    if (!id) continue;

    if (provider === 'instagram' && !result.instagram) {
      result.instagram = { id, networkKey: 'instagram', accountType: type };
    } else if (provider === 'tiktok' && !result.tiktok) {
      result.tiktok = { id, networkKey: 'tiktok', accountType: type };
    } else if (provider === 'twitter' && !result.twitter) {
      result.twitter = { id, networkKey: 'twitter', accountType: type };
    }
  }

  return result;
}

// ─── Media upload (CRITICAL: must happen before scheduling) ────────────────

async function waitForJob(jobId, { timeoutMs = POLL_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS } = {}) {
  await getWorkspaceId();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await apiFetch(`/job_status/${jobId}`);
    const data = res?.data ?? res;
    const status = (data?.status ?? '').toLowerCase();

    if (status === 'complete' || status === 'completed') {
      const result = data?.result ?? data?.payload ?? data;
      const failures = result?.payload?.failures ?? result?.failures ?? data?.payload?.failures;
      return { status: 'complete', result, failures, raw: data };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`Publer job ${jobId} ${status}: ${JSON.stringify(data)}`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Publer job ${jobId} timed out after ${timeoutMs}ms`);
}

export async function uploadMediaFromUrl(url, { name, caption = '', source = 'blondeshell' } = {}) {
  await getWorkspaceId();
  const fileName = name ?? url.split('/').pop().split('?')[0];

  const jobRes = await apiFetch('/media/from-url', {
    method: 'POST',
    body: JSON.stringify({
      media: [{ url, name: fileName, caption, source }],
      type: 'single',
      direct_upload: false,
      in_library: false,
    }),
  });

  const jobId = jobRes?.job_id ?? jobRes?.data?.job_id;
  if (!jobId) throw new Error(`No job_id in /media/from-url response: ${JSON.stringify(jobRes)}`);

  const { result, failures } = await waitForJob(jobId);

  if (failures && (Array.isArray(failures) ? failures.length : Object.keys(failures).length)) {
    throw new Error(`Media upload failed: ${JSON.stringify(failures)}`);
  }

  // Publer returns result as: Array<mediaObject>, or { media: [...] }, or { payload: { media: [...] } }
  let mediaList;
  if (Array.isArray(result)) {
    mediaList = result;
  } else if (Array.isArray(result?.media)) {
    mediaList = result.media;
  } else if (Array.isArray(result?.payload?.media)) {
    mediaList = result.payload.media;
  } else {
    mediaList = [];
  }

  const media = mediaList[0];
  if (!media?.id) throw new Error(`No media id in upload result: ${JSON.stringify(result).slice(0, 400)}`);
  return media;
}

export async function uploadMediaFile(filePath, { inLibrary = false } = {}) {
  await getWorkspaceId();
  const buffer = readFileSync(filePath);
  const filename = filePath.split('/').pop();

  const form = new FormData();
  const blob = new Blob([buffer]);
  form.append('file', blob, filename);
  form.append('direct_upload', 'false');
  form.append('in_library', String(inLibrary));

  const res = await fetch(`${BASE}/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer-API ${process.env.Publer_API}`,
      'Publer-Workspace-Id': _workspaceId || process.env.PUBLER_WORKSPACE_ID,
    },
    body: form,
  });

  const body = await res.json();
  if (!res.ok) throw new Error(`Publer /media ${res.status}: ${JSON.stringify(body)}`);
  if (!body?.id) throw new Error(`No id in direct upload response: ${JSON.stringify(body)}`);
  return body;
}

// ─── Scheduling ─────────────────────────────────────────────────────────────

function buildInstagramPhoto({ caption, mediaId, altText }) {
  return {
    type: 'photo',
    text: caption,
    media: [{ id: mediaId, type: 'image', ...(altText ? { alt_text: altText } : {}) }],
  };
}

function buildInstagramVideo({ caption, mediaId, postType = 'reel' }) {
  return {
    type: 'video',
    text: caption,
    media: [{ id: mediaId, type: 'video' }],
    details: { type: postType, feed: false },
  };
}

function buildTikTokPhoto({ caption, mediaId, title, privacy = 'PUBLIC_TO_EVERYONE' }) {
  if (!title) throw new Error('TikTok photo posts require a title field');
  return {
    type: 'photo',
    title,
    text: caption,
    media: [{ id: mediaId }],
    details: {
      privacy,
      auto_add_music: true,
      comment: true,
      promotional: false,
      paid: false,
      reminder: false,
    },
  };
}

function buildTikTokVideo({ caption, mediaId, privacy = 'PUBLIC_TO_EVERYONE' }) {
  return {
    type: 'video',
    text: caption,
    media: [{ id: mediaId }],
    details: {
      privacy,
      comment: true, duet: true, stitch: true,
      promotional: false, paid: false, reminder: false,
    },
  };
}

function buildTwitterStatus({ caption, mediaId }) {
  const net = { type: 'status', text: caption };
  if (mediaId) {
    net.type = 'photo';
    net.media = [{ id: mediaId, type: 'image' }];
  }
  return net;
}

// Schedule a post — mediaId is REQUIRED for photo/video; must be uploaded via uploadMediaFromUrl first.
export async function schedulePost({ accountId, networkKey, caption, scheduledAt, mediaId = null, mediaType = 'photo', postType = null, tiktokTitle = null }) {
  await getWorkspaceId();

  let networkPayload;
  switch (networkKey) {
    case 'instagram':
    case 'ig_business':
      networkPayload = mediaType === 'video'
        ? buildInstagramVideo({ caption, mediaId, postType: postType || 'reel' })
        : buildInstagramPhoto({ caption, mediaId });
      break;
    case 'tiktok':
      networkPayload = mediaType === 'video'
        ? buildTikTokVideo({ caption, mediaId })
        : buildTikTokPhoto({ caption, mediaId, title: tiktokTitle || caption.slice(0, 80) });
      break;
    case 'twitter':
      networkPayload = buildTwitterStatus({ caption, mediaId });
      break;
    default:
      throw new Error(`Unsupported networkKey: ${networkKey}`);
  }

  const apiNetworkKey = networkKey === 'ig_business' ? 'instagram' : networkKey;

  const payload = {
    bulk: {
      state: 'scheduled',
      posts: [{
        networks: { [apiNetworkKey]: networkPayload },
        accounts: [{ id: accountId, scheduled_at: scheduledAt }],
      }],
    },
  };

  const data = await apiFetch('/posts/schedule', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const jobId = data?.job_id ?? data?.data?.job_id;
  if (!jobId) throw new Error(`schedulePost: no job_id — ${JSON.stringify(data)}`);
  return String(jobId);
}

export async function verifyPostLive(jobId) {
  try {
    const { failures } = await waitForJob(jobId, { timeoutMs: 30_000 });
    return { ok: !failures || (Array.isArray(failures) ? failures.length === 0 : Object.keys(failures).length === 0), failures };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export { waitForJob };
