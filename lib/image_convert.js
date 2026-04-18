import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const FANVUE_MAX_WIDTH = 2048;
const FANVUE_JPEG_QUALITY = 85;

export async function convertToJpeg(inputBufferOrPath, { maxWidth = FANVUE_MAX_WIDTH, quality = FANVUE_JPEG_QUALITY } = {}) {
  let inPath;
  let cleanupIn = false;

  if (Buffer.isBuffer(inputBufferOrPath)) {
    inPath = join(tmpdir(), `img_in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`);
    writeFileSync(inPath, inputBufferOrPath);
    cleanupIn = true;
  } else {
    inPath = inputBufferOrPath;
  }

  const outPath = join(tmpdir(), `img_out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`);
  // ffmpeg quality: 2 (best) → 31 (worst). JPEG 85 ≈ q:v 4
  const qScale = Math.max(2, Math.min(31, Math.round(31 - (quality / 100) * 29)));

  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', inPath,
      '-vf', `scale='min(${maxWidth},iw)':-2:flags=lanczos`,
      '-q:v', String(qScale),
      outPath,
    ]);

    let stderr = '';
    ff.stderr.on('data', (d) => { stderr += d.toString(); });

    ff.on('error', (err) => {
      if (cleanupIn) { try { unlinkSync(inPath); } catch {} }
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });

    ff.on('close', (code) => {
      if (cleanupIn) { try { unlinkSync(inPath); } catch {} }
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
      const output = readFileSync(outPath);
      try { unlinkSync(outPath); } catch {}
      resolve(output);
    });
  });
}
