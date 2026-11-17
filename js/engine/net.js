// Network helpers. A request that stalls (seen with Chrome's HTTP cache when the same URL is still
// in flight from an earlier page) is aborted after `timeout` ms and retried without the cache.
export async function fetchRetry(url, { timeout = 8000, retries = 2, cache = 'no-cache' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { cache: attempt === 0 ? cache : 'no-store', signal: ctrl.signal });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      console.warn(`[net] ${url} attempt ${attempt + 1} failed: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// Small JSON files always come straight from the server (no HTTP cache, so no stale or stuck copies)
export function fetchJson(url) {
  return fetchRetry(url, { cache: 'no-store' }).then(r => r.json());
}
