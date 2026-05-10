#!/usr/bin/env node
// Backup pool warming script (Wave 1).
// Reads backup_accounts table, generates a daily content brief per warming
// account using a "personality theme" (different per account so they look
// like independent aggregators, not coordinated). Brief is printed to
// stdout + written to tmp/backup_pool/YYYY-MM-DD.md.
//
// Owner posts manually from each account's separate device/IP and then
// updates last_post_at via:
//   node scripts/warmup_backup_pool.mjs --confirm <handle>
//
// The pool target is 30+ days of warming. Wave 1 starts the clock; Wave 3
// expands to auto-posting via per-account scheduling tools if available.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';
import { supabase } from '../lib/supabase.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const OUT_DIR = resolve(REPO_ROOT, 'tmp', 'backup_pool');

const HAIKU = 'claude-haiku-4-5-20251001';

// Default themes seeded into backup_accounts.notes.theme. If notes.theme is
// missing, the account falls back to one of these by index.
const DEFAULT_THEMES = [
  { theme: 'coffee_morning_aesthetic',     vibe: 'soft, slow, golden hour, latte art, bookshelves' },
  { theme: 'gym_motivation_meme',          vibe: 'reposted gym memes, bro humor, no faces' },
  { theme: 'sunset_landscape_aggregator',  vibe: 'silhouettes, oceans, mountains, no people in frame' },
  { theme: 'gamer_gear_curator',           vibe: 'mech keyboards, RGB setups, retro games, screenshot art' },
  { theme: 'cozy_apartment_aesthetic',     vibe: 'plants, candles, knit blankets, no human subjects' },
];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function pickTheme(account, index) {
  let parsed = null;
  try { parsed = account.notes ? JSON.parse(account.notes) : null; } catch { /* notes is freeform text */ }
  if (parsed?.theme && parsed?.vibe) return parsed;
  return DEFAULT_THEMES[index % DEFAULT_THEMES.length];
}

async function generateBrief({ platform, theme, vibe }) {
  const prompt = `You produce one-line content briefs for a small aggregator-style ${platform} account themed "${theme}". Vibe: ${vibe}. The account never features a single creator's face — it reposts/curates lifestyle content. Today's post brief should fit that theme and feel organic, not promotional.

Return ONLY a JSON object: {"caption": "<2-line caption>", "hashtags": ["#tag1", "#tag2", "#tag3"], "image_concept": "<1 sentence visual brief>"}`;

  try {
    const r = await anthropic.messages.create({
      model: HAIKU,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = r.content[0]?.text ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    return { caption: '(brief generation failed: ' + err.message + ')', hashtags: [], image_concept: '' };
  }
}

async function loadWarming() {
  const { data, error } = await supabase
    .from('backup_accounts')
    .select('id, handle, platform, status, last_post_at, warming_started_at, notes')
    .eq('status', 'warming')
    .order('platform', { ascending: true });
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return data ?? [];
}

async function confirmPosted(handle) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('backup_accounts')
    .update({ last_post_at: now })
    .eq('handle', handle);
  if (error) throw new Error(`Confirm failed: ${error.message}`);
  console.log(`[warmup] last_post_at updated for ${handle}`);
}

function daysAgo(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

async function dailyBriefs() {
  const accounts = await loadWarming();
  if (accounts.length === 0) {
    console.log('[warmup] No warming accounts in backup_accounts table. Owner must register 5 (2 IG, 2 TT, 1 X) and insert rows with status=warming.');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  await mkdir(OUT_DIR, { recursive: true });
  const lines = [`# Backup pool briefs — ${today}`, ''];

  for (let i = 0; i < accounts.length; i++) {
    const acct = accounts[i];
    const since = daysAgo(acct.last_post_at);
    const themeInfo = pickTheme(acct, i);
    const brief = await generateBrief({ platform: acct.platform, theme: themeInfo.theme, vibe: themeInfo.vibe });

    lines.push(`## ${acct.platform} · @${acct.handle}`);
    lines.push(`- theme: \`${themeInfo.theme}\``);
    lines.push(`- days since last post: ${since === Infinity ? 'never' : since}`);
    lines.push(`- caption: ${brief.caption}`);
    lines.push(`- hashtags: ${(brief.hashtags ?? []).join(' ')}`);
    lines.push(`- image concept: ${brief.image_concept}`);
    lines.push('');
    lines.push(`After posting, run: \`node scripts/warmup_backup_pool.mjs --confirm ${acct.handle}\``);
    lines.push('');
  }

  const out = lines.join('\n');
  console.log(out);

  const path = resolve(OUT_DIR, `${today}.md`);
  await writeFile(path, out);
  console.log(`\n[warmup] Briefs written to ${path}`);
}

async function main() {
  const args = process.argv.slice(2);
  const confirmIdx = args.indexOf('--confirm');
  if (confirmIdx >= 0) {
    const handle = args[confirmIdx + 1];
    if (!handle) {
      console.error('Usage: --confirm <handle>');
      process.exit(2);
    }
    await confirmPosted(handle);
    return;
  }
  await dailyBriefs();
}

main().catch((err) => {
  console.error(`[warmup] unexpected error: ${err.message}`);
  process.exit(1);
});
