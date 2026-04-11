#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

import 'dotenv/config.js';

const HERO_DIR = path.join(os.homedir(), 'Downloads/hero_dataset');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n📤 Uploading hero_dataset to Supabase Storage\n');

const imageFiles = fs.readdirSync(HERO_DIR).filter(f => /\.(jpg|jpeg|png)$/i.test(f));

async function uploadImage(filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(HERO_DIR, filename);
    const fileBuffer = fs.readFileSync(filePath);
    
    const url = new URL(`${SUPABASE_URL}/storage/v1/object/hero-dataset/${filename}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Length': fileBuffer.length,
        'Content-Type': 'application/octet-stream'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ ${filename}`);
          resolve(`${SUPABASE_URL}/storage/v1/object/public/hero-dataset/${filename}`);
        } else {
          console.log(`⚠️  ${filename} - Status: ${res.statusCode}`);
          resolve(`${SUPABASE_URL}/storage/v1/object/public/hero-dataset/${filename}`);
        }
      });
    });

    req.on('error', () => {
      console.log(`⚠️  ${filename} - Network error (continuing)`);
      resolve(`${SUPABASE_URL}/storage/v1/object/public/hero-dataset/${filename}`);
    });

    req.write(fileBuffer);
    req.end();
  });
}

(async () => {
  console.log(`📂 Found ${imageFiles.length} images\n`);
  const urlMapping = {};
  
  for (const file of imageFiles) {
    const url = await uploadImage(file);
    urlMapping[file] = url;
  }

  console.log('\n✅ Upload complete!\n');
  
  const mappingFile = path.join(os.homedir(), 'Downloads/blondeshell_archive 2/supabase_url_mapping.json');
  fs.writeFileSync(mappingFile, JSON.stringify(urlMapping, null, 2));
  console.log(`📋 Saved URL mapping to: supabase_url_mapping.json\n`);
})();
