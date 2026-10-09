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

/**
 * Plage de sortie d'Anthropic, d'où partent tous les appels des connecteurs
 * claude.ai : 160.79.104.0/21 (https://platform.claude.com/docs/en/api/ip-addresses).
 * Quelques IP y portent le trafic de tous les utilisateurs de Claude : au
 * plafond d'un appelant ordinaire, une poignée de conversations simultanées
 * suffirait à renvoyer des 429 à tout le monde.
 */
export function isAnthropicEgress(ip: string): boolean {
  const m = /^(?:::ffff:)?160\.79\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (!m) return false;
  const third = Number(m[1]);
  return third >= 104 && third <= 111;
}
