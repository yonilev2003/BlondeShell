#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

import 'dotenv/config.js';

const HERO_DIR = path.join(os.homedir(), 'Downloads/hero_dataset');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BUCKET = 'Hero_Dataset';

console.log('\n📤 UPLOADING 29 HERO DATASET IMAGES\n');

async function uploadFile(filePath, fileName) {
  const fileContent = fs.readFileSync(filePath);
  
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      path: `/storage/v1/object/${BUCKET}/${fileName}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'image/jpeg',
        'Content-Length': fileContent.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`;
          resolve(publicUrl);
        } else {
          reject(new Error(`${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(fileContent);
    req.end();
  });
}

(async () => {
  try {
    const files = fs.readdirSync(HERO_DIR).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    console.log(`📂 Found ${files.length} images\n`);

    const urlMap = {};
    let uploaded = 0;

    for (const file of files) {
      try {
        console.log(`⬆️  ${file}...`);
        const filePath = path.join(HERO_DIR, file);
        const url = await uploadFile(filePath, file);
        urlMap[file] = url;
        console.log(`   ✅\n`);
        uploaded++;
      } catch (err) {
        console.log(`   ❌ ${err.message}\n`);
      }
    }

    console.log(`\n✅ Uploaded: ${uploaded}/${files.length}\n`);

    // Save mapping
    fs.writeFileSync(
      path.join(os.homedir(), 'Downloads/blondeshell_archive 2/hero_dataset_urls.json'),
      JSON.stringify(urlMap, null, 2)
    );

    console.log('💾 Saved to hero_dataset_urls.json\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
