#!/usr/bin/env node
// Account health audit checker.
// Reads ACCOUNT_HEALTH.md and verifies the owner has completed the audit
// (Status: PASS) before any wave that touches live accounts proceeds.
// Wired into npm run readiness as a precondition.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(HERE, '..', 'ACCOUNT_HEALTH.md');

async function main() {
  let raw;
  try {
    raw = await readFile(FILE, 'utf8');
  } catch (err) {
    console.error(`[account_health] Cannot read ${FILE}: ${err.message}`);
    process.exit(2);
  }

  const lastAudited = /\*\*Last audited\*\*:\s*(.+)/.exec(raw)?.[1]?.trim();
  const statusLine = /^Final-status:\s*(PASS|FAIL|NOT_YET)\b/im.exec(raw)?.[1]?.toUpperCase();

  const unticked = (raw.match(/^\s*-\s*\[\s\]/gm) ?? []).length;
  const ticked = (raw.match(/^\s*-\s*\[x\]/gim) ?? []).length;
  const totalBoxes = unticked + ticked;

  console.log('[account_health] audit summary');
  console.log(`  file       : ${FILE}`);
  console.log(`  last audit : ${lastAudited ?? '(missing)'}`);
  console.log(`  checkboxes : ${ticked}/${totalBoxes} ticked`);
  console.log(`  status     : ${statusLine ?? '(missing)'}`);

  if (!statusLine || statusLine === 'NOT_YET') {
    console.error('\n[account_health] FAIL — owner has not completed audit. Fill ACCOUNT_HEALTH.md and set "Final-status: PASS".');
    process.exit(1);
  }

  if (statusLine === 'FAIL') {
    console.error('\n[account_health] FAIL — owner marked status as FAIL. Resolve blockers before proceeding.');
    process.exit(1);
  }

  if (statusLine === 'PASS' && unticked > 0) {
    console.warn(`\n[account_health] WARN — status is PASS but ${unticked} checkbox(es) still unticked. Confirm intentional.`);
  }

  console.log('\n[account_health] PASS — cleared to proceed with live-account work.');
  process.exit(0);
}

main().catch((err) => {
  console.error(`[account_health] unexpected error: ${err.message}`);
  process.exit(2);
});
