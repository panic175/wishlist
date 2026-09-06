import type { NextRequest } from 'next/server';

/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Suitable for the single-instance, self-hosted deployment this app targets.
 * For multi-instance or very high traffic deployments this should be replaced
 * with a shared store (e.g. Redis).
 */

// Proxy-supplied IP headers are not honoured by default: without a trusted
// reverse proxy they are trivially spoofable and would let a client bypass
// per-IP limits. Set TRUST_PROXY_HEADERS=true only when running behind a proxy
// that overwrites X-Forwarded-For / X-Real-IP for every request (see
// DEPLOYMENT.md). When disabled, all requests share one bucket.
const TRUST_PROXY_HEADERS = process.env.TRUST_PROXY_HEADERS === 'true';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_THRESHOLD = 1000;
let lastSweep = Date.now();

function pruneExpired(now: number): void {
  if (buckets.size < SWEEP_THRESHOLD && now - lastSweep < SWEEP_INTERVAL_MS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  lastSweep = now;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check (and, when allowed, consume) a token for `key`. Allows `limit`
 * requests per `windowMs` sliding window.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  pruneExpired(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

/**
 * Best-effort client identifier.
 *
 * Reads X-Forwarded-For / X-Real-IP ONLY when TRUST_PROXY_HEADERS=true; the
 * reverse proxy must overwrite these for every request. Otherwise returns a
 * shared key ('unknown') so spoofed headers can never be leveraged to evade
 * throttling.
 */
export function getClientIp(request: NextRequest): string {
  if (!TRUST_PROXY_HEADERS) return 'unknown';

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();
  return 'unknown';
}

/** Standard rate-limiter 429 response body. */
export function tooManyRequestsResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: 'Too many requests, please try again later' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds / 1000))),
      },
    }
  );
}