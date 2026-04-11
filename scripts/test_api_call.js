#!/usr/bin/env node
import https from 'https';
import 'dotenv/config.js';

const payload = {
  model: "seedream-4-5-251128",
  prompt: "Portrait of a woman, professional lighting",
  reference_images: [
    "https://nznvfseyrpzfkwjxowgd.supabase.co/storage/v1/object/public/Hero_Dataset/beach_T1_sunset_hero.png"
  ],
  num_inference_steps: 34,
  cfg_scale: 3.9,
  sampler: "euler_advanced_4",
  image_size: "1024x1536"
};

const options = {
  hostname: 'ark.ap-southeast.bytepluses.com',
  path: '/api/v3/images/generations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.SEEDREAM45_API}`
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', JSON.stringify(JSON.parse(data), null, 2));
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(JSON.stringify(payload));
req.end();
