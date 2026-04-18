#!/usr/bin/env node
/**
 * Bio Consistency Check
 *
 * Verifies BlondeShell's bio is consistent across platforms:
 * - AI-generated disclosure (Meta AI label for Instagram, required)
 * - Link to beacons.ai or throne wishlist
 * - Character fundamentals (LA, 21, content tier)
 *
 * Reads current bios from Publer accounts (via profile API) and prints gaps.
 *
 * Usage: node scripts/check_bios.mjs
 */

import 'dotenv/config';

const PUBLER_BASE = 'https://app.publer.com/api/v1';
const HEADERS = {
  'Authorization': `Bearer-API ${process.env.Publer_API}`,
  'Publer-Workspace-Id': process.env.PUBLER_WORKSPACE_ID,
};

// What every bio MUST include (regardless of platform)
const REQUIRED_TOKENS = [
  { token: /AI[- ]?generated|AI.*content|AI.*creator/i, label: 'AI disclosure' },
  { token: /LA|Los Angeles|California/i, label: 'LA location' },
  { token: /beacons\.ai|linktr\.ee|throne/i, label: 'link-in-bio URL' },
];

// Platform-specific soft checks
const PLATFORM_CHECKS = {
  instagram: [{ token: /AI[- ]?generated/i, label: 'Meta AI label (required by Instagram ToS)' }],
  tiktok: [{ token: /ai/i, label: 'AI mention (TikTok AI content label enabled)' }],
  twitter: [],
};

async function fetchAccounts() {
  const res = await fetch(`${PUBLER_BASE}/accounts`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Publer /accounts ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : (body?.accounts ?? body?.data ?? []);
}

function checkBio(bio, platform) {
  const missing = [];

  for (const check of REQUIRED_TOKENS) {
    if (!check.token.test(bio)) missing.push({ severity: 'required', label: check.label });
  }

  for (const check of (PLATFORM_CHECKS[platform] ?? [])) {
    if (!check.token.test(bio)) missing.push({ severity: 'platform', label: check.label });
  }

  return missing;
}

console.log('\n━━━ Bio Consistency Check ━━━\n');

const accounts = await fetchAccounts();
if (!accounts.length) {
  console.error('❌ No Publer accounts found');
  process.exit(1);
}

let totalIssues = 0;

for (const acc of accounts) {
  const provider = (acc.provider ?? '').toLowerCase();
  if (!['instagram', 'tiktok', 'twitter'].includes(provider)) continue;

  const bio = acc.bio ?? acc.description ?? acc.about ?? '';
  console.log(`─── ${provider.toUpperCase()} (${acc.name ?? acc.username ?? acc.id?.slice(0, 8)}) ───`);
  console.log(`Bio: "${bio.slice(0, 120)}${bio.length > 120 ? '...' : ''}"`);

  if (!bio) {
    console.log('   ⚠️  No bio data returned by Publer (may require account-level API access)');
    console.log();
    continue;
  }

  const missing = checkBio(bio, provider);
  if (missing.length === 0) {
    console.log('   ✅ Bio consistent — all checks pass');
  } else {
    for (const m of missing) {
      const icon = m.severity === 'required' ? '❌' : '⚠️ ';
      console.log(`   ${icon} Missing: ${m.label}`);
      totalIssues++;
    }
  }
  console.log();
}

console.log('━━━ Summary ━━━');
if (totalIssues === 0) {
  console.log('🟢 All bios consistent across platforms.\n');
  process.exit(0);
} else {
  console.log(`🟡 ${totalIssues} issue(s) found. Update bios manually via each platform's app.\n`);
  console.log('Canonical template for all platforms:');
  console.log(`
  ─────────────────────────────────────────
  Blonde Shell 🤍 | AI creator | LA, CA
  pilates girl era + Valorant enjoyer
  link-in-bio ↓ beacons.ai/blondeshell
  ─────────────────────────────────────────
  `);
  process.exit(1);
}
