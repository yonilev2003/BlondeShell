/**
 * scripts/twitter_morning_scan.js — Railway entry point
 *
 * Thin launcher: loads .env then spawns twitter_morning_scan.py
 * which uses twikit for all Twitter interactions (no official API needed).
 *
 * To run manually:
 *   node scripts/twitter_morning_scan.js
 *   node scripts/twitter_morning_scan.js --dry-run "gym workout"
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(__dirname, 'twitter_morning_scan.py');

const args = ['scripts/twitter_morning_scan.py', ...process.argv.slice(2)];

const result = spawnSync('/opt/homebrew/bin/python3.11', args, {
  cwd:   join(__dirname, '..'),
  stdio: 'inherit',
  env:   { ...process.env },
});

process.exit(result.status ?? 0);
