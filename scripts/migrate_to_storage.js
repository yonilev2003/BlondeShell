import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = 'content';

function extFromUrl(url) {
  const path = new URL(url).pathname;
  const ext = path.split('.').pop().toLowerCase();
  return ext || 'bin';
}

function contentType(ext) {
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'image/png';
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function uploadToStorage(buffer, storagePath, mimeType) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

function publicUrl(storagePath) {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

async function main() {
  const { data: items, error } = await supabase
    .from('content_items')
    .select('id, type, url, batch_id, setting')
    .eq('qa_status', 'approved');

  if (error) throw new Error(`Failed to fetch items: ${error.message}`);
  if (!items.length) { console.log('No approved items found.'); return; }

  console.log(`Found ${items.length} approved item(s) to migrate.\n`);

  let success = 0;
  let failed = 0;

  for (const item of items) {
    const ext = extFromUrl(item.url);
    const folder = item.type === 'video' ? 'generated/videos' : 'generated/images';
    const storagePath = `${folder}/${item.id}.${ext}`;
    const mime = contentType(ext);

    process.stdout.write(`[${item.type}] ${item.id} ... `);

    try {
      const buffer = await downloadBuffer(item.url);
      await uploadToStorage(buffer, storagePath, mime);
      const newUrl = publicUrl(storagePath);

      const { error: updateErr } = await supabase
        .from('content_items')
        .update({ url: newUrl })
        .eq('id', item.id);

      if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

      console.log(`✓ → ${newUrl}`);
      success++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== MIGRATION SUMMARY ===`);
  console.log(`  Migrated: ${success}`);
  console.log(`  Failed:   ${failed}`);
  console.log('Done.\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
