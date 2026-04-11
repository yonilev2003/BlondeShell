#!/usr/bin/env node
import 'dotenv/config.js';

import { generateImage  } from './generate_image.js';
import { approveImage  } from '../lib/approvalWorkflow.js';

/**
 * CLI for image generation with reference selection, approval workflow
 *
 * Usage:
 *   node scripts/cli-generate-image.js \
 *     --setting beach \
 *     --tier T1 \
 *     --mood golden \
 *     --count 3 \
 *     [--approve-auto]
 */

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { count: 1, approveAuto: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--approve-auto') {
      result.approveAuto = true;
    } else if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        // Handle special keys that can have spaces/quotes
        if (key === 'prompt-override') {
          result[key] = value;
        } else if (key === 'references') {
          // Split by comma and trim whitespace
          result[key] = value.split(',').map(url => url.trim()).filter(url => url.length > 0);
        } else {
          result[key] = isNaN(value) ? value : Number(value);
        }
        i++;
      }
    }
  }

  return result;
}

const argv = parseArgs();

// Validate required args
if (!argv.setting || !argv.tier || !argv.mood) {
  console.error('Usage: node scripts/cli-generate-image.js --setting <setting> --tier <tier> --mood <mood> [--count <number>] [--approve-auto] [--param-overrides...]');
  console.error('\nExamples (V3 — Corrected Parameters):');
  console.error('  node scripts/cli-generate-image.js --setting beach --tier T1 --mood photorealistic-s3 --count 1');
  console.error('  node scripts/cli-generate-image.js --setting beach --tier T1 --mood photorealistic-s3 --cfg-scale 3.9 --eye-naturalization 0.97 --beauty-filter -0.17');
  console.error('  node scripts/cli-generate-image.js --setting beach --tier T1 --mood photorealistic-s3 --cfg-scale 4.0 --character-consistency-weight 0.89 --beauty-filter 0.03');
  console.error('\nSettings: beach, gym, home, studio, street, travel');
  console.error('Tiers: T1, T2, T3');
  console.error('Moods (V3 Recommended): photorealistic-s3, authentic-t3, natural-professional-u3');
  console.error('\nParameter Overrides (optional):');
  console.error('  --cfg-scale <number>                    (default: 3.8)');
  console.error('  --eye-naturalization <number>           (default: 0.9)');
  console.error('  --character-consistency-weight <number> (default: 0.92)');
  console.error('  --beauty-filter <number>                (default: -0.17)');
  console.error('  --reference-adherence-mode <mode>       (default: "hard_identity", alt: "strict")');
  console.error('  --output-sharpening-bypass              (flag, no value)');
  console.error('  --global-default-blur <number>          (default: 0.0)');
  console.error('  --skin-blur <number>                    (default: 0.0)');
  process.exit(1);
}

async function main() {
  const { setting, tier, mood, count, approveAuto, 'prompt-override': promptOverride, references, ...overrides } = argv;

  // Extract parameter overrides with proper keys (convert kebab-case to camelCase)
  const parameterOverrides = {
    promptOverride: promptOverride ?? null,
    referenceUrls: references ?? null,
    cfgScale: overrides['cfg-scale'] ?? null,
    eyeNaturalization: overrides['eye-naturalization'] ?? null,
    characterConsistencyWeight: overrides['character-consistency-weight'] ?? null,
    beautyFilter: overrides['beauty-filter'] ?? null,
    referenceAdherenceMode: overrides['reference-adherence-mode'] ?? null,
    outputSharpeningBypass: 'output-sharpening-bypass' in overrides,
    globalDefaultBlur: overrides['global-default-blur'] ?? 0.0,
    skinBlur: overrides['skin-blur'] ?? 0.0,
  };

  console.log(`\n🎨 Generating ${count} ${mood} image(s)...`);
  console.log(`   Setting: ${setting} | Tier: ${tier} | Mood: ${mood}`);

  // A/B/C Testing Mode indicator
  if (parameterOverrides.promptOverride || parameterOverrides.referenceUrls) {
    console.log(`   🧪 A/B/C TESTING MODE`);
    if (parameterOverrides.promptOverride) console.log(`      Custom Prompt: ${parameterOverrides.promptOverride.substring(0, 80)}...`);
    if (parameterOverrides.referenceUrls) console.log(`      Reference URLs: ${parameterOverrides.referenceUrls.length} image(s)`);
  }

  if (approveAuto) console.log(`   Auto-approve: YES (if similarity ≥ 0.92)`);
  if (Object.values(parameterOverrides).some(v => v && v !== null && (Array.isArray(v) ? v.length > 0 : true))) {
    const filteredOverrides = Object.fromEntries(Object.entries(parameterOverrides).filter(([_, v]) => v !== null && v !== 0.0 && v !== false && !(Array.isArray(v) && v.length === 0)));
    if (Object.keys(filteredOverrides).length > 0) {
      console.log(`   Parameter Overrides: ${JSON.stringify(filteredOverrides)}`);
    }
  }
  console.log();

  const results = [];
  let approved = 0;

  for (let i = 0; i < count; i++) {
    try {
      console.log(`[${i + 1}/${count}] Generating...`);

      const result = await generateImage({
        setting,
        tier,
        mood,
        ...parameterOverrides,
      });

      results.push(result);
      const simPercent = (result.face_similarity * 100).toFixed(1);

      console.log(`✅ Generated: ${result.image_url.slice(0, 80)}...`);
      console.log(`   Face Similarity: ${simPercent}%`);
      console.log(`   Reference: ${result.reference_image_id}`);
      console.log(`   Post ID: ${result.post_id}`);

      // ── Auto-approve if requested ──────────────────────────────────
      if (approveAuto && result.face_similarity >= 0.90 && result.post_id) {
        try {
          const approval = await approveImage(result.post_id, true); // promote to reference
          if (approval.promoted) {
            console.log(`   Status: ✅ APPROVED & PROMOTED to reference`);
            approved++;
          } else {
            console.log(`   Status: ✅ APPROVED (not promoted, sim < 0.92)`);
            approved++;
          }
        } catch (err) {
          console.log(`   Status: ⚠️ PENDING_QA (approval failed: ${err.message})`);
        }
      } else {
        console.log(`   Status: ⏳ PENDING_QA`);
      }

      console.log();
    } catch (err) {
      console.error(`❌ Failed: ${err.message}`);
      if (err.code) console.error(`   Error Code: ${err.code}`);
      if (err.face_similarity !== undefined) console.error(`   Face Similarity: ${err.face_similarity}`);
      console.log();
    }
  }

  // ── Summary ────────────────────────────────────────────────────────
  console.log(`\n📊 Summary:`);
  console.log(`   Generated: ${results.length}/${count}`);
  console.log(`   Approved: ${approved}`);
  console.log(`   Pending QA: ${results.length - approved}`);

  if (results.length > 0) {
    console.log(`\n🔗 Generated URLs:`);
    results.forEach((r, idx) => {
      const shortUrl = r.image_url.slice(0, 100) + (r.image_url.length > 100 ? '...' : '');
      console.log(`  ${idx + 1}. ${shortUrl}`);
    });
  }

  console.log();
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  process.exit(1);
});
