interface Bucket {
  tokens: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;

export function createRateLimiter(opts: { rpm: number }): (ip: string) => boolean {
  const buckets = new Map<string, Bucket>();
  return (ip: string): boolean => {
    const now = Date.now();
    const b = buckets.get(ip);
    if (!b || now >= b.resetAt) {
      buckets.set(ip, { tokens: opts.rpm - 1, resetAt: now + WINDOW_MS });
      return true;
    }
    if (b.tokens <= 0) return false;
    b.tokens -= 1;
    return true;
  };
}
