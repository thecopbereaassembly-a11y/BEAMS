/**
 * Rate limiting (docs/07 §7, docs/08 §7).
 *
 * An in-memory sliding-window limiter. It is deliberately simple and honest
 * about its limitation: state is per-instance, so on multiple serverless
 * instances the effective limit is (limit × instances). That is still a large
 * reduction in brute-force throughput and costs nothing.
 *
 * For a hard global limit — which matters most for auth — move this to Postgres
 * or Upstash Redis. Tracked as a launch-readiness item in docs/16.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** Stop the map growing without bound in a long-lived process. */
function sweep(now: number, windowMs: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0] ?? now;
    buckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);

  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.hits.length),
    retryAfterSeconds: 0,
  };
}

/** Tuned per surface: auth is strict, ordinary app traffic is generous. */
export const LIMITS = {
  auth: { limit: 8, windowMs: 60_000 },
  webhook: { limit: 120, windowMs: 60_000 },
  export: { limit: 20, windowMs: 60_000 },
} as const;

/** Best-effort client identity from proxy headers. */
export function clientKey(headers: Headers, scope: string): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

/** Test seam — resets the in-memory state. */
export function __resetRateLimits() {
  buckets.clear();
}
