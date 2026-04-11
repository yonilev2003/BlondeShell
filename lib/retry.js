/**
 * Exponential backoff retry — quality gate #4
 * Max 3 retries, base delay 500ms, multiplier 2x.
 */
async function withRetry(fn, { maxRetries = 3, baseDelayMs = 500, label = 'op' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[retry] ${label} attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export { withRetry };
