#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

import 'dotenv/config.js';

const PLAN_FILE = path.join(os.homedir(), 'Downloads/blondeshell_archive 2/T1_GENERATION_PLAN_V3_CORRECTED.json');
const URL_MAP_FILE = path.join(os.homedir(), 'Downloads/blondeshell_archive 2/hero_dataset_urls.json');

const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
const urlMap = JSON.parse(fs.readFileSync(URL_MAP_FILE, 'utf8'));

const SEEDREAM_API = process.env.SEEDREAM45_API;
const ENDPOINT = process.env.SEEDREAM45_ENDPOINT;

console.log('\n🎨 GENERATING WITH SESSION RESET\n');

async function callSeedream(prompt, referenceFiles) {
  const bestRef = referenceFiles[0];
  const refUrl = urlMap[bestRef];
  
  const payload = {
    model: "seedream-4-5-251128",
    prompt: `photograph of blondeshell, ${prompt}`,
    reference_images: [refUrl],
    num_inference_steps: 28,
    cfg_scale: 3.9,
    sampler: "dpmpp_2m_sde",
    image_size: "1024x1536",
    character_consistency_weight: 0.88,
    reference_adherence_mode: "hard_identity",
    reference_feature_mode: "face_only",
    eye_naturalization: 0.80,
    output_sharpening_bypass: true,
    identity_lock_version: 2,
    identity_session_reset: true
  };

  return new Promise((resolve, reject) => {
    const url = new URL(ENDPOINT);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SEEDREAM_API}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const resp = JSON.parse(data);
          if (resp.data && resp.data[0] && resp.data[0].url) {
            resolve(resp.data[0].url);
          } else {
            reject(new Error('No URL'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

(async () => {
  for (const letter of ['A', 'B', 'C', 'D', 'E']) {
    const promptData = plan.prompts[letter];
    if (!promptData) continue;
    
    console.log(`🎬 Prompt ${letter}`);
    
    try {
      const imageUrl = await callSeedream(promptData.full_prompt, promptData.references);
      console.log(`✅ ${imageUrl}\n`);
    } catch (err) {
      console.log(`❌ ${err.message}\n`);
    }
  }
})();
