import type { FeedItem, FeedResponse, Locale } from './types';

interface CacheEntry {
  at: number;
  items: FeedItem[];
}

export function createFeedClient(opts?: {
  baseUrl?: string;
  ttlMs?: number;
  fetchImpl?: typeof fetch;
}): { getCatalog(locale: Locale): Promise<FeedItem[]> } {
  const baseUrl = opts?.baseUrl ?? process.env.SIMSIMA_FEED_BASE ?? 'https://simsima.io';
  const ttlMs = opts?.ttlMs ?? 15 * 60 * 1000;
  const doFetch = opts?.fetchImpl ?? fetch;
  const cache = new Map<Locale, CacheEntry>();

  async function getCatalog(locale: Locale): Promise<FeedItem[]> {
    const cached = cache.get(locale);
    if (cached && Date.now() - cached.at < ttlMs) {
      return cached.items;
    }
    try {
      const res = await doFetch(`${baseUrl}/${locale}/agent/catalog`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`feed responded ${res.status}`);
      const body = (await res.json()) as FeedResponse;
      const items = Array.isArray(body.items) ? body.items : [];
      cache.set(locale, { at: Date.now(), items });
      return items;
    } catch (err) {
      if (cached) return cached.items;
      throw err;
    }
  }

  return { getCatalog };
}
