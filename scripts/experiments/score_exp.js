#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const configPath = path.join(__dirname, '../../experiments/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('\n📋 Scoring Interface (DRY RUN)\n');
console.log('Would score images for:');
for (const exp of config.experiments) {
  console.log(`  • ${exp.id}: ${exp.images_per_variant * exp.variants.length} images`);
}
