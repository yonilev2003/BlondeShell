#!/usr/bin/env node

import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '../../');

// Parse CLI args
const args = process.argv.slice(2);
const expArg = args.find(a => a.startsWith('--exp'));
const variantArg = args.find(a => a.startsWith('--variant'));

if (!expArg || !variantArg) {
  console.error('Usage: node scripts/experiments/generate_exp.js --exp=exp-01 --variant=disabled');
  process.exit(1);
}

const configPath = path.join(projectRoot, 'experiments/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const expId = expArg.split('=')[1];
const variant = variantArg.split('=')[1];
const exp = config.experiments.find(e => e.id === expId);

if (!exp) {
  console.error(`Experiment ${expId} not found`);
  process.exit(1);
}

if (!exp.variants.includes(variant)) {
  console.error(`Variant ${variant} not in ${expId}`);
  process.exit(1);
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Build API request based on experiment variant
 */
function buildRequest(expId, variant, config) {
  const baseRequest = {
    model: config.fixed_params.model,
    prompt: buildPrompt(expId, variant, config),
    size: config.fixed_params.size,
    response_format: config.fixed_params.response_format,
    extra_body: {
      image: selectReferences(expId, variant, config.references),
      watermark: config.fixed_params.watermark,
      seed: getSeedForVariant(expId, variant),
      sequential_image_generation: getSequentialMode(expId, variant),
      sequential_image_generation_options: { max_images: 3 },
      optimize_prompt_options: { mode: getOptimizeMode(expId, variant) },
      guidance_scale: getGuidanceScale(expId, variant) || undefined
    }
  };
  return baseRequest;
}

function buildPrompt(expId, variant, config) {
  if (expId === 'exp-03') {
    if (variant === 'keyword_list') {
      return 'blonde woman, beach, golden hour, white dress, contemplative, lifestyle photography, warm light, soft bokeh, editorial, professional';
    }
  }
  return config.baseline_prompt;
}

function selectReferences(expId, variant, references) {
  if (expId === 'exp-02') {
    const map = { '1_ref': 1, '2_refs': 2, '4_refs': 4 };
    const count = map[variant] || 4;
    return references.slice(0, count).map(r => r.url);
  }
  return references.map(r => r.url);
}

function getSeedForVariant(expId, variant) {
  if (expId === 'exp-05') {
    return variant === 'fixed_seed_12345' ? 12345 : -1;
  }
  return -1;
}

function getSequentialMode(expId, variant) {
  return expId === 'exp-04' ? (variant === 'auto' ? 'auto' : 'disabled') : 'disabled';
}

function getOptimizeMode(expId, variant) {
  return expId === 'exp-01' ? variant : 'disabled';
}


function getGuidanceScale(expId, variant) {
  if (expId === 'exp-06') {
    return parseFloat(variant);  // '4.0', '7.5', '15.0'
  }
  return null;
}

/**
 * Generate a single image
 */
async function generateImage(expId, variant, imageIndex) {
  const requestBody = buildRequest(expId, variant, config);

  console.log(`  [${imageIndex}] Calling BytePlus API...`);

  
  // Remove undefined values from extra_body
  Object.keys(requestBody.extra_body).forEach(key => {
    if (requestBody.extra_body[key] === undefined) {
      delete requestBody.extra_body[key];
    }
  });

  // Call BytePlus API
  const response = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SEEDREAM45_API}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BytePlus API error: ${response.status} ${errorText}`);
  }

  const apiResponse = await response.json();
  const imageUrl = apiResponse?.images?.[0]?.url || apiResponse?.data?.[0]?.url;

  if (!imageUrl) {
    throw new Error(`No image URL in response`);
  }

  const faceSimilarity = apiResponse?.images?.[0]?.face_similarity || 
                        apiResponse?.data?.[0]?.face_similarity || null;

  // Insert into Supabase
  const { data, error } = await supabase
    .from('experiment_results')
    .insert({
      experiment_id: expId,
      variant: variant,
      image_index: imageIndex,
      image_url: imageUrl,
      api_request: requestBody,
      api_response: apiResponse,
      face_similarity: faceSimilarity,
      scores: null
    });

  if (error) {
    console.error(`  ✗ Supabase insert failed: ${error.message}`);
    throw error;
  }

  console.log(`  ✓ ${imageUrl.substring(0, 40)}... (similarity: ${faceSimilarity?.toFixed(2) || 'N/A'})`);
  
  return { imageUrl, faceSimilarity, data };
}

/**
 * Main: Generate 3 images for a variant
 */
async function main() {
  if (!process.env.SEEDREAM45_API) {
    console.error('Error: SEEDREAM45_API environment variable not set');
    process.exit(1);
  }

  console.log(`
📊 ${expId} / ${variant}
`);

  for (let i = 1; i <= exp.images_per_variant; i++) {
    try {
      await generateImage(expId, variant, i);
      if (i < exp.images_per_variant) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay
      }
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ Completed ${expId}/${variant}\n`);
}

main();
