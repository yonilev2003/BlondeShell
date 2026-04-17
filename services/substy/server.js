import 'dotenv/config';
import express from 'express';
import { login, getConversations, getSubscribers, updateSettings, shutdown } from './index.js';

const PORT = parseInt(process.env.SUBSTY_PORT || '3001', 10);
const SERVICE_KEY = process.env.SUBSTY_SERVICE_KEY;

if (!SERVICE_KEY) {
  console.error('[substy] SUBSTY_SERVICE_KEY not set — exiting');
  process.exit(1);
}

const app = express();
app.use(express.json());

function authMiddleware(req, res, next) {
  const key = req.headers['x-service-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (key !== SERVICE_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use('/substy', authMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'blondeshell-substy', timestamp: new Date().toISOString() });
});

app.post('/substy/conversations', async (_req, res) => {
  try {
    const conversations = await getConversations();
    res.json({ success: true, data: conversations });
  } catch (err) {
    console.error('[substy] GET conversations failed:', err.message);
    res.status(500).json({
      error: err.message,
      screenshotPath: err.screenshotPath || null,
    });
  }
});

app.get('/substy/subscribers', async (_req, res) => {
  try {
    const subscribers = await getSubscribers();
    res.json({ success: true, data: subscribers });
  } catch (err) {
    console.error('[substy] GET subscribers failed:', err.message);
    res.status(500).json({
      error: err.message,
      screenshotPath: err.screenshotPath || null,
    });
  }
});

app.post('/substy/update-settings', async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: 'Request body required with settings to update' });
    }
    const result = await updateSettings(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[substy] POST update-settings failed:', err.message);
    res.status(500).json({
      error: err.message,
      screenshotPath: err.screenshotPath || null,
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[substy] Service listening on port ${PORT}`);
});

async function gracefulShutdown() {
  console.log('[substy] Shutting down...');
  await shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
