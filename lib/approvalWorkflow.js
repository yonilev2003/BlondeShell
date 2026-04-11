import { supabase, logAgentAction } from './supabase.js';

/**
 * Fetch image data for manual review
 *
 * @param {string} postId - Post UUID
 * @returns {Promise<object>} { image_url, face_similarity, reference_image_id, prompt_hash }
 */
async function approvalWorkflow(postId) {
  if (!postId) throw new Error('approvalWorkflow: postId is required');

  const { data: post, error } = await supabase.from('posts').select('*').eq('id', postId).single();

  if (error || !post) {
    throw new Error(`approvalWorkflow: post ${postId} not found`);
  }

  return {
    image_url: post.image_url || post.asset_url,
    face_similarity: post.face_similarity,
    reference_image_id: post.reference_image_id,
    prompt_hash: post.prompt_hash,
    status: post.status,
  };
}

/**
 * Approve an image and optionally promote it to reference_images table
 *
 * @param {string} postId - Post UUID
 * @param {boolean} [promoteToReference=false] - If true and sim ≥ 0.92, add to reference_images
 *
 * @returns {Promise<object>} { success: true, promoted: boolean }
 */
async function approveImage(postId, promoteToReference = false) {
  if (!postId) throw new Error('approveImage: postId is required');

  // ── Mark as approved ──────────────────────────────────────────────────
  const now = new Date().toISOString();
  const { data: [updatedPost], error: updateErr } = await supabase
    .from('posts')
    .update({ status: 'approved', qa_passed_at: now, updated_at: now })
    .eq('id', postId)
    .select()
    .single();

  if (updateErr || !updatedPost) {
    throw new Error(`approveImage: failed to update post ${postId}: ${updateErr?.message || 'unknown error'}`);
  }

  let promoted = false;

  // ── Optionally promote to reference_images ────────────────────────────
  if (promoteToReference && updatedPost.face_similarity >= 0.90) {
    console.log(
      `[approvalWorkflow] Promoting post ${postId} to reference_images (sim=${updatedPost.face_similarity})`
    );

    const refData = {
      image_url: updatedPost.image_url || updatedPost.asset_url,
      setting: updatedPost.setting,
      tier: updatedPost.tier,
      mood: updatedPost.mood || 'golden',
      face_similarity: updatedPost.face_similarity,
      filename: `${updatedPost.setting}_${updatedPost.tier}_${updatedPost.mood}.jpg`,
      alt_text: `BlondeShell reference — ${updatedPost.setting} ${updatedPost.tier} ${updatedPost.mood}`,
      created_at: now,
    };

    const { error: insertErr } = await supabase.from('reference_images').insert(refData);

    if (insertErr) {
      console.warn(`[approvalWorkflow] Failed to insert reference image: ${insertErr.message}`);
      // Don't throw; approve succeeded even if promotion failed
    } else {
      promoted = true;
      await logAgentAction('approvalWorkflow', 'promotion', 'completed',
        `Post ${postId} promoted to reference_images (sim=${updatedPost.face_similarity})`);
    }
  }

  await logAgentAction('approvalWorkflow', 'approval', 'completed', `Post ${postId} approved, promoted=${promoted}`);
  return { success: true, promoted };
}

/**
 * Reject an image with optional reason
 *
 * @param {string} postId - Post UUID
 * @param {string} [reason=''] - Rejection reason (safety check, poor quality, etc.)
 *
 * @returns {Promise<object>} { success: true }
 */
async function rejectImage(postId, reason = '') {
  if (!postId) throw new Error('rejectImage: postId is required');

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('posts')
    .update({
      status: 'rejected',
      rejection_reason: reason || null,
      qa_failed_at: now,
      updated_at: now,
    })
    .eq('id', postId);

  if (error) {
    throw new Error(`rejectImage: failed to update post ${postId}: ${error.message}`);
  }

  await logAgentAction('approvalWorkflow', 'rejection', 'completed', `Post ${postId} rejected: ${reason || 'no reason provided'}`);
  return { success: true };
}

export {
  approvalWorkflow,
  approveImage,
  rejectImage,
};
