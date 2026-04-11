#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const configPath = path.join(__dirname, '../../experiments/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('\n📊 Results Analysis (DRY RUN)\n');
for (const exp of config.experiments) {
  console.log(`✓ ${exp.id}: analyze ${exp.variants.join(' vs ')})`);
}
