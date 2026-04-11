import 'dotenv/config';
import readline from 'readline';
import { getPendingQA, updateQAStatus } from '../lib/supabase_content.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const batch = args.find((a) => a.startsWith('--batch='))?.split('=')[1] ?? null;
  const autoApprove = args.includes('--auto-approve');
  return { batch, autoApprove };
}

const CHECKLIST = [
  'Face matches hero reference',
  'Platinum blonde hair consistent',
  'Green eyes visible / consistent',
  'T1 tier compliance (no explicit content)',
  'No watermarks or artifacts',
];

function printItem(item, index, total) {
  console.log(`\n──────────────────────────────────────`);
  console.log(`Item ${index + 1}/${total} | ${item.type.toUpperCase()} | ${item.setting} | ${item.tier} | ${item.mood}`);
  console.log(`Batch: ${item.batch_id}`);
  console.log(`URL: ${item.url}`);
  console.log(`\nChecklist:`);
  CHECKLIST.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
  console.log(`\n[a] Approve  [r] Reject  [R] Regenerate  [s] Skip`);
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const { batch, autoApprove } = parseArgs();

  console.log('Loading pending QA items...');
  const items = await getPendingQA(batch ? { batch_id: batch } : {});

  if (!items.length) {
    console.log('No pending items. All clear.');
    return;
  }

  console.log(`Found ${items.length} pending item(s).`);

  if (autoApprove) {
    console.log('--auto-approve: approving all items...');
    for (const item of items) {
      await updateQAStatus(item.id, 'approved');
      console.log(`  ✓ approved ${item.id}`);
    }
    console.log(`\nAuto-approved ${items.length} items.`);
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const stats = { approved: 0, rejected: 0, regenerate: 0, skipped: 0 };
  const batchStats = {};

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    printItem(item, i, items.length);

    const answer = await prompt(rl, '> ');
    const key = answer.trim();

    let status;
    if (key === 'a') {
      status = 'approved';
      stats.approved++;
    } else if (key === 'r') {
      status = 'rejected';
      stats.rejected++;
    } else if (key === 'R') {
      status = 'regenerate';
      stats.regenerate++;
    } else {
      stats.skipped++;
      console.log('  → skipped');
      continue;
    }

    await updateQAStatus(item.id, status);
    console.log(`  → ${status}`);

    const b = item.batch_id;
    if (!batchStats[b]) batchStats[b] = { approved: 0, total: 0 };
    batchStats[b].total++;
    if (status === 'approved') batchStats[b].approved++;
  }

  rl.close();

  console.log('\n══════════════════════════════════════');
  console.log('QA SUMMARY');
  console.log(`  Approved:    ${stats.approved}`);
  console.log(`  Rejected:    ${stats.rejected}`);
  console.log(`  Regenerate:  ${stats.regenerate}`);
  console.log(`  Skipped:     ${stats.skipped}`);
  console.log('\nPass rate per batch (Gate 2 threshold: ≥80%):');

  for (const [batchId, s] of Object.entries(batchStats)) {
    const rate = s.total > 0 ? Math.round((s.approved / s.total) * 100) : 0;
    const gate = rate >= 80 ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${batchId}: ${s.approved}/${s.total} (${rate}%) — ${gate}`);
  }

  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
