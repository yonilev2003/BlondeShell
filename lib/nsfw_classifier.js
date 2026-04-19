import * as tf from '@tensorflow/tfjs-node';
import * as nsfwjs from 'nsfwjs';

let modelPromise = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = nsfwjs.load('MobileNetV2');
  }
  return modelPromise;
}

async function fetchImageBuffer(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function classifyTier(scores) {
  const porn = scores.Porn ?? 0;
  const hentai = scores.Hentai ?? 0;
  const sexy = scores.Sexy ?? 0;
  const neutral = scores.Neutral ?? 0;
  const drawing = scores.Drawing ?? 0;

  const explicit = porn + hentai;
  const suggestive = sexy;
  const safe = neutral + drawing;

  if (explicit >= 0.5) {
    return { tier: 'T3', confidence: explicit, notes: `Explicit (porn+hentai=${explicit.toFixed(2)})` };
  }
  if (explicit >= 0.2 || suggestive >= 0.5) {
    return { tier: 'T2', confidence: Math.max(explicit, suggestive), notes: `Suggestive (sexy=${sexy.toFixed(2)}, explicit=${explicit.toFixed(2)})` };
  }
  if (safe >= 0.6 && explicit < 0.1 && suggestive < 0.3) {
    return { tier: 'T1', confidence: safe, notes: `SFW (neutral+drawing=${safe.toFixed(2)})` };
  }
  return { tier: 'T2', confidence: Math.max(suggestive, 0.3), notes: `Borderline (sexy=${sexy.toFixed(2)}, safe=${safe.toFixed(2)}) — defaulting T2` };
}

export async function nsfwClassifyLocal(imageUrl) {
  const model = await loadModel();
  const buffer = await fetchImageBuffer(imageUrl);
  const tensor = tf.node.decodeImage(buffer, 3);
  try {
    const predictions = await model.classify(tensor);
    const scores = Object.fromEntries(predictions.map(p => [p.className, p.probability]));
    return classifyTier(scores);
  } finally {
    tensor.dispose();
  }
}
