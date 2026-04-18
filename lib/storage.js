import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(ROOT, 'output');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = 'content';

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function localPath(type, date, filename) {
  const dir = join(OUTPUT_DIR, type, date);
  ensureDir(dir);
  return join(dir, filename);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function saveLocally(buffer, { type = 'images', filename }) {
  const date = todayStr();
  const path = localPath(type, date, filename);
  writeFileSync(path, buffer);
  return path;
}

export async function uploadToSupabase(buffer, { filename, contentType = 'image/png' }) {
  const storagePath = `${todayStr()}/${filename}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: true });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return { publicUrl, storagePath };
}

export async function deleteFromSupabase(storagePath) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);

  if (error) console.warn(`[storage] delete failed for ${storagePath}: ${error.message}`);
}

export async function downloadAndStore(url, { type = 'images', filename, contentType }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} from ${url}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const detectedType = contentType || res.headers.get('content-type') || 'image/png';

  const localFilePath = await saveLocally(buffer, { type, filename });
  const { publicUrl, storagePath } = await uploadToSupabase(buffer, { filename, contentType: detectedType });

  return { localPath: localFilePath, publicUrl, storagePath, size: buffer.length };
}

export async function cleanupPublished(storagePaths) {
  let deleted = 0;
  for (const sp of storagePaths) {
    await deleteFromSupabase(sp);
    deleted++;
  }
  return deleted;
}
