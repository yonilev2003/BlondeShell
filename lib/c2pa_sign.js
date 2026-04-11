/**
 * lib/c2pa_sign.js — C2PA signing for AI-generated content
 *
 * Downloads asset from URL, embeds a C2PA manifest with
 * digitalSourceType: trainedAlgorithmicMedia, uploads signed
 * file to Supabase Storage, returns permanent public URL.
 *
 * Signer priority:
 *   1. Env vars C2PA_PRIVATE_KEY + C2PA_CERT_CHAIN (production — PEM strings)
 *   2. createTestSigner() fallback (self-signed, works locally, not trusted by external validators)
 *
 * To generate production certs, run: npm run c2pa:gen-cert
 */

import { createC2pa, createTestSigner, ManifestBuilder, SigningAlgorithm } from 'c2pa-node';
import { createClient } from '@supabase/supabase-js';
import { extname } from 'path';
import 'dotenv/config';

const MIME_MAP = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
};

const TRAINEDALGOMEDIA = 'https://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

async function buildSigner() {
  if (process.env.C2PA_PRIVATE_KEY && process.env.C2PA_CERT_CHAIN) {
    return {
      type:        'local',
      certificate: Buffer.from(process.env.C2PA_CERT_CHAIN),
      privateKey:  Buffer.from(process.env.C2PA_PRIVATE_KEY),
      algorithm:   SigningAlgorithm.ES256,
      tsaUrl:      'http://timestamp.digicert.com',
    };
  }
  console.log('[c2pa] No certs in env — using test signer (self-signed)');
  return createTestSigner();
}

/**
 * Download → sign → upload to Supabase Storage.
 * @param {string} sourceUrl  - fal.ai (or any) public URL
 * @returns {Promise<string>} permanent Supabase public URL of signed asset
 */
export async function signAndUpload(sourceUrl) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── 1. Download ────────────────────────────────────────────────────────────
  const fetchRes = await fetch(sourceUrl);
  if (!fetchRes.ok) throw new Error(`[c2pa] Download failed ${sourceUrl}: ${fetchRes.status}`);
  const buffer = Buffer.from(await fetchRes.arrayBuffer());

  // ── 2. Determine mime type ─────────────────────────────────────────────────
  const rawPath  = (() => { try { return new URL(sourceUrl).pathname; } catch { return sourceUrl; } })();
  const ext      = extname(rawPath).toLowerCase() || '.jpg';
  const mimeType = MIME_MAP[ext] ?? 'image/jpeg';

  // ── 3. Sign ────────────────────────────────────────────────────────────────
  const signer = await buildSigner();
  const c2pa   = createC2pa();

  const manifest = new ManifestBuilder({
    claim_generator: 'BlondeShell/1.0',
    format:          mimeType,
    assertions: [
      {
        label: 'c2pa.creative_work',
        data:  { digitalSourceType: TRAINEDALGOMEDIA },
      },
    ],
  });

  let signedBuffer;
  try {
    const { signedAsset } = await c2pa.sign({ asset: { mimeType, buffer }, signer, manifest });
    signedBuffer = signedAsset.buffer;
    console.log(`[c2pa] Signed OK (${signedBuffer.length} bytes)`);
  } catch (err) {
    // Non-fatal: log and fall back to original buffer so pipeline never stalls
    console.warn(`[c2pa] Signing failed (${err.message}) — uploading unsigned`);
    signedBuffer = buffer;
  }

  // ── 4. Upload to Supabase Storage ──────────────────────────────────────────
  const baseName    = rawPath.split('/').pop().split('?')[0] || `asset_${Date.now()}${ext}`;
  const storagePath = `signed/${Date.now()}_${baseName}`;

  const { error: uploadErr } = await supabase.storage
    .from('content')
    .upload(storagePath, signedBuffer, { contentType: mimeType, upsert: false });

  if (uploadErr) throw new Error(`[c2pa] Supabase upload failed: ${uploadErr.message}`);

  const { data: { publicUrl } } = supabase.storage.from('content').getPublicUrl(storagePath);
  console.log(`[c2pa] → ${storagePath}`);
  return publicUrl;
}
