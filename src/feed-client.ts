import type { CatalogResult, FeedDestination, FeedItem, FeedResponse, Locale } from './types';

interface CacheEntry {
  at: number;
  items: FeedItem[];
  destinations: FeedDestination[];
}

/**
 * Client du flux `/{locale}/agent/catalog`.
 *
 * `stale` dit si la réponse vient du cache APRÈS un échec de rafraîchissement.
 * Servir le cache est le bon comportement — mieux vaut un catalogue de quinze
 * minutes que pas de catalogue — mais le taire ne l'est pas : sans ce drapeau,
 * une panne du flux se traduit par des prix périmés annoncés en silence, et rien
 * dans la télémétrie ne le montre.
 */
export function createFeedClient(opts?: {
  baseUrl?: string;
  ttlMs?: number;
  fetchImpl?: typeof fetch;
}): { getCatalog(locale: Locale): Promise<CatalogResult> } {
  const baseUrl = opts?.baseUrl ?? process.env.SIMSIMA_FEED_BASE ?? 'https://simsima.io';
  const ttlMs = opts?.ttlMs ?? 15 * 60 * 1000;
  const doFetch = opts?.fetchImpl ?? fetch;
  const cache = new Map<Locale, CacheEntry>();

  async function getCatalog(locale: Locale): Promise<CatalogResult> {
    const cached = cache.get(locale);
    if (cached && Date.now() - cached.at < ttlMs) {
      return { items: cached.items, destinations: cached.destinations, stale: false };
    }
    try {
      const res = await doFetch(`${baseUrl}/${locale}/agent/catalog`, {
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`feed responded ${res.status}`);
      const body = (await res.json()) as FeedResponse;
      const items = Array.isArray(body.items) ? body.items : [];
      const destinations = Array.isArray(body.destinations) ? body.destinations : [];
      cache.set(locale, { at: Date.now(), items, destinations });
      return { items, destinations, stale: false };
    } catch (err) {
      if (cached) return { items: cached.items, destinations: cached.destinations, stale: true };
      throw err;
    }
  }

  return { getCatalog };
}
