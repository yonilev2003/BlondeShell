#!/usr/bin/env node
import 'dotenv/config.js';

/**
 * Image cleanup utility — removes metadata and watermarks from generated images
 * Used by generate_image.js for Variants M, N, O (production-ready)
 */

import sharp from 'sharp';

/**
 * Strip EXIF + metadata from image buffer
 * Removes AI-generation tags and other metadata that could reveal generation method
 *
 * @param {Buffer} imageBuffer - Image data buffer
 * @returns {Promise<Buffer>} Cleaned image buffer without metadata
 * @throws {Error} If cleanup fails
 */
async function stripImageMetadata(imageBuffer) {
  try {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Empty image buffer provided');
    }

    // Reload image with sharp (strips EXIF automatically)
    // withMetadata(false) removes all metadata
    const cleaned = await sharp(imageBuffer)
      .withMetadata(false)
      .toBuffer();

    console.log('[stripImageMetadata] ✓ Metadata stripped successfully');
    return cleaned;
  } catch (err) {
    console.warn('[stripImageMetadata] ⚠️ Cleanup failed, returning original:', err.message);
    // Return original buffer if cleanup fails (non-blocking)
    return imageBuffer;
  }
}

/**
 * Remove AI generation indicators from image
 * In practice, this is handled by negative_prompt in generate_image.js
 * This utility provides fallback cleanup for edge cases
 *
 * @param {Buffer} imageBuffer - Image data
 * @returns {Promise<Buffer>} Cleaned image
 */
async function removeAIIndicators(imageBuffer) {
  try {
    // Run through sharp to remove metadata
    const cleaned = await sharp(imageBuffer)
      .withMetadata(false)
      .rotate() // Force reencoding (removes stale metadata)
      .rotate(-90) // Rotate back
      .toBuffer();

    return cleaned;
  } catch (err) {
    console.warn('[removeAIIndicators] Cleanup failed:', err.message);
    return imageBuffer;
  }
}

export {
  stripImageMetadata,
  removeAIIndicators,
};
