import sharp from 'sharp';
import { readFileSync } from 'fs';

const FANVUE_MAX_WIDTH = 2048;
const FANVUE_JPEG_QUALITY = 85;

export async function convertToJpeg(inputBufferOrPath, { maxWidth = FANVUE_MAX_WIDTH, quality = FANVUE_JPEG_QUALITY } = {}) {
  let inputBuffer;
  if (Buffer.isBuffer(inputBufferOrPath)) {
    inputBuffer = inputBufferOrPath;
  } else {
    inputBuffer = readFileSync(inputBufferOrPath);
  }

  return sharp(inputBuffer)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
}
