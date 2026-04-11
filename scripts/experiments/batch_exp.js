#!/usr/bin/env node

import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../../');

// Parse CLI args
const args = process.argv.slice(2);
const expFilter = args.find(a => a.startsWith('--exp'))?.split('=')[1];

const configPath = path.join(projectRoot, 'experiments/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const experiments = expFilter
  ? config.experiments.filter(e => e.id === expFilter)
  : config.experiments;

if (experiments.length === 0) {
  console.error(`Error: No experiments matching ${expFilter}`);
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║  BlondeShell Image Pipeline — Batch Experiment Runner   ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

for (const exp of experiments) {
  console.log(`\n📊 ${exp.name} (${exp.total_images} images)\n`);

  for (const variant of exp.variants) {
    try {
      const cmd = `node scripts/experiments/generate_exp.js --exp=${exp.id} --variant=${variant}`;
      execSync(cmd, {
        cwd: projectRoot,
        stdio: 'inherit',
        env: process.env
      });
    } catch (error) {
      console.error(`\n❌ Failed: ${exp.id}/${variant}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ Completed ${exp.id}\n`);
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('✅ All experiments complete');
console.log('\nNext: node scripts/experiments/score_exp.js\n');
