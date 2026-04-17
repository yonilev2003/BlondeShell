import { withRetry } from './retry.js';
import 'dotenv/config';

const HEDRA_BASE = 'https://api.hedra.com/v1';

function getApiKey() {
  const key = process.env.HEDRA_API_KEY;
  if (!key) throw new Error('HEDRA_API_KEY not set');
  return key;
}

async function hedraFetch(path, body) {
  const res = await fetch(`${HEDRA_BASE}${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': getApiKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Hedra ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

async function hedraGet(path) {
  const res = await fetch(`${HEDRA_BASE}${path}`, {
    headers: { 'X-API-Key': getApiKey() },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Hedra ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollForCompletion(projectId, timeoutMs = 300000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const project = await hedraGet(`/projects/${projectId}`);

    if (project.status === 'completed' || project.state === 'completed') {
      return project.video_url || project.url;
    }

    if (project.status === 'failed' || project.state === 'failed') {
      throw new Error(`Hedra project ${projectId} failed: ${project.error || 'unknown'}`);
    }

    await sleep(5000);
  }

  throw new Error(`Hedra project ${projectId} timed out after ${timeoutMs / 1000}s`);
}

export async function generateTalkingHead(imageUrl, audioUrl, options = {}) {
  const aspectRatio = options.aspectRatio || '9:16';
  const resolution = options.resolution || '1080p';

  return withRetry(
    async () => {
      const project = await hedraFetch('/characters', {
        image_url: imageUrl,
        audio_url: audioUrl,
        aspect_ratio: aspectRatio,
        resolution,
      });

      const projectId = project.id || project.project_id;
      if (!projectId) throw new Error('Hedra returned no project ID');

      console.log(`[hedra] Project ${projectId} created, polling for completion...`);
      return pollForCompletion(projectId);
    },
    { maxRetries: 2, baseDelayMs: 5000, label: 'generateTalkingHead' },
  );
}
