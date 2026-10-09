import type { FeedDestination, FeedItem } from '../types';
import { findDestination } from './coverage';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip combining diacritics
    .toLowerCase()
    .replace(/^esim-/, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Forfaits d'une destination. Le slug exact d'abord ; sinon, quand le flux porte
 * ses `destinations`, la même résolution que `get_destination_info` : code ISO,
 * nom usuel ou officiel, nom dans la langue de l'utilisateur, synonyme de zone.
 * Sans elle, « JP » ou « USA » répondaient « destination inconnue ».
 */
export function resolveDestination(
  items: FeedItem[],
  query: string,
  destinations: FeedDestination[] = [],
  locale = 'en'
): { slug: string; items: FeedItem[] } | null {
  const q = normalize(query);
  if (!q) return null;
  let matched = items.filter((it) => normalize(it.destination) === q);
  if (matched.length === 0) {
    const dest = findDestination(destinations, query, locale);
    if (dest) matched = items.filter((it) => it.destination === dest.destination);
  }
  if (matched.length === 0) return null;
  return { slug: matched[0].destination, items: matched };
}
