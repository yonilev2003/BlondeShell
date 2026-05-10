#!/usr/bin/env node
// Israel firewall ship-gate test (Wave 1).
// Scores lib/qa_gate.js#israelFirewallCheck against the fixture manifest.
// Exit 0 if ship gate passes (default ≥18/20 correct), exit 1 if fails,
// exit 2 if fixtures incomplete (URLs TBD or fewer than min_fixtures).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { israelFirewallCheck } from '../lib/qa_gate.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(HERE, '..', 'assets', 'test_fixtures', 'israel_firewall', 'manifest.json');

async function loadManifest() {
  const raw = await readFile(MANIFEST, 'utf8');
  return JSON.parse(raw);
}

function shipGate(total, correct, manifestGate) {
  const minFixtures = manifestGate?.min_fixtures ?? 20;
  const minCorrect = Math.max(manifestGate?.min_correct ?? 18, Math.ceil(0.9 * total));
  return { minFixtures, minCorrect, totalEnough: total >= minFixtures, accuracyEnough: correct >= minCorrect };
}

async function main() {
  let manifest;
  try {
    manifest = await loadManifest();
  } catch (err) {
    console.error(`[test_israel_firewall] Cannot read manifest: ${err.message}`);
    process.exit(2);
  }

  const fixtures = manifest.fixtures ?? [];
  const ready = fixtures.filter((f) => f.url && f.url !== 'TBD');
  const tbdCount = fixtures.length - ready.length;

  if (ready.length === 0) {
    console.error(`[test_israel_firewall] No fixtures with URLs. ${fixtures.length} entries pending. Populate manifest.json and re-run.`);
    process.exit(2);
  }

  console.log(`[test_israel_firewall] Running ${ready.length}/${fixtures.length} fixtures (${tbdCount} TBD)`);

  const results = [];
  for (const fx of ready) {
    process.stdout.write(`  ${fx.id} (expected=${fx.expected})… `);
    const verdict = await israelFirewallCheck(fx.url, '');
    const actual = verdict.passed ? 'pass' : 'reject';
    const correct = actual === fx.expected;
    results.push({ ...fx, actual, correct, traces: verdict.traces, notes: verdict.notes });
    console.log(correct ? `OK (${actual})` : `MISS (got ${actual}, traces: ${(verdict.traces ?? []).join(',')})`);
  }

  const correctCount = results.filter((r) => r.correct).length;
  const gate = shipGate(ready.length, correctCount, manifest.ship_gate);

  console.log('\n[test_israel_firewall] summary');
  console.log(`  fixtures run    : ${ready.length}`);
  console.log(`  correct         : ${correctCount}/${ready.length}`);
  console.log(`  pending (TBD)   : ${tbdCount}`);
  console.log(`  min fixtures    : ${gate.minFixtures}`);
  console.log(`  min correct     : ${gate.minCorrect}`);

  const failed = results.filter((r) => !r.correct);
  if (failed.length > 0) {
    console.log('\n  misses:');
    for (const m of failed) {
      console.log(`    - ${m.id}: expected ${m.expected}, got ${m.actual} — ${m.notes}`);
    }
  }

  if (!gate.totalEnough) {
    console.error(`\n[test_israel_firewall] INCOMPLETE — only ${ready.length} fixtures populated, need ≥${gate.minFixtures}.`);
    process.exit(2);
  }

  if (!gate.accuracyEnough) {
    console.error(`\n[test_israel_firewall] FAIL — ${correctCount}/${ready.length} correct, ship gate requires ≥${gate.minCorrect}. Tune the prompt in lib/qa_gate.js#israelFirewallCheck and re-run.`);
    process.exit(1);
  }

  console.log(`\n[test_israel_firewall] PASS — ${correctCount}/${ready.length} ≥ ${gate.minCorrect}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[test_israel_firewall] unexpected error: ${err.message}`);
  process.exit(2);
});
