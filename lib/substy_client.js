import 'dotenv/config';
import { withRetry } from './retry.js';

const SUBSTY_URL = process.env.SUBSTY_SERVICE_URL;
const SUBSTY_KEY = process.env.SUBSTY_SERVICE_KEY;

async function substyFetch(method, path, body = null) {
  if (!SUBSTY_URL) throw new Error('SUBSTY_SERVICE_URL not set');
  if (!SUBSTY_KEY) throw new Error('SUBSTY_SERVICE_KEY not set');

  const url = `${SUBSTY_URL}${path}`;
  const options = {
    method,
    headers: {
      'x-service-key': SUBSTY_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(`Substy ${res.status} ${path}: ${data.error || res.statusText}`);
    err.status = res.status;
    err.screenshotPath = data.screenshotPath || null;
    throw err;
  }

  return data;
}

export async function substyGetConversations() {
  return withRetry(
    () => substyFetch('POST', '/substy/conversations'),
    { label: 'substy:conversations' }
  );
}

export async function substyGetSubscribers() {
  return withRetry(
    () => substyFetch('GET', '/substy/subscribers'),
    { label: 'substy:subscribers' }
  );
}

export async function substyUpdateSettings(settings) {
  return withRetry(
    () => substyFetch('POST', '/substy/update-settings', settings),
    { label: 'substy:update-settings' }
  );
}
