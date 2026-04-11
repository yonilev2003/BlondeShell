#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';

import 'dotenv/config.js';

const HERO_DIR = path.join(os.homedir(), 'Downloads/hero_dataset');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const BUCKET = 'Hero_Dataset';

console.log('\n📤 UPLOADING WITH DEBUG INFO\n');
console.log(`URL: ${SUPABASE_URL}`);
console.log(`Bucket: ${BUCKET}`);
console.log(`Key: ${SUPABASE_KEY.substring(0, 20)}...\n`);

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
          reject({ status: res.statusCode, data });
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
    const file = 'beach_T1_sunset_hero.png';
    const filePath = path.join(HERO_DIR, file);
    
    console.log(`🧪 Testing upload with: ${file}\n`);
    
    const url = await uploadFile(filePath, file);
    console.log(`✅ SUCCESS!\n`);
    console.log(`🔗 ${url}\n`);
    
  } catch (err) {
    console.log(`❌ ERROR:\n`);
    console.log(`   Status: ${err.status || err.message}`);
    console.log(`   Data: ${err.data || 'N/A'}\n`);
  }
})();
