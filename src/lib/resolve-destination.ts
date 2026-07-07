import type { FeedItem } from '../types';

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip combining diacritics
    .toLowerCase()
    .replace(/^esim-/, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function resolveDestination(
  items: FeedItem[],
  query: string
): { slug: string; items: FeedItem[] } | null {
  const q = normalize(query);
  if (!q) return null;
  const matched = items.filter((it) => normalize(it.destination) === q);
  if (matched.length === 0) return null;
  return { slug: matched[0].destination, items: matched };
}
