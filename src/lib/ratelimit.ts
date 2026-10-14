// Simple fixed-window limiter. Per-instance only; swap for a shared store (e.g. Redis/Upstash) at scale.
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return { ok: true, retryAfter: 0 }; }
  b.count += 1;
  if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return { ok: b.count <= limit, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

export function clientKey(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}
