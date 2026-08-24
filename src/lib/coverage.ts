import type { FeedDestination } from '../types';

/**
 * Résolution « est-ce que ce forfait marche dans ce pays ».
 *
 * Un agent pose la question avec ce que l'utilisateur a écrit : « Croatia »,
 * « Croatie », « HR », parfois « croatia ». Refuser tout sauf l'ISO ferait
 * répondre « inconnu » sur une question à laquelle le catalogue sait répondre,
 * ce qui est pire qu'une erreur visible : l'agent conclut qu'on ne couvre pas.
 */

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Code ISO d'un pays écrit en clair, cherché parmi les codes que le catalogue
 * couvre réellement — pas sur la terre entière : la question ne porte que sur
 * cette liste, et la restreindre évite de résoudre un pays qu'on ne vend pas.
 * Les noms sont produits par `Intl.DisplayNames` en anglais ET dans la locale
 * demandée, ce qui couvre « Croatia » comme « Croatie » sans table à maintenir.
 */
export function resolveCountryCode(
  query: string,
  knownCodes: string[],
  locale = 'en'
): string | null {
  const q = normalize(query);
  if (!q) return null;

  const codes = [...new Set(knownCodes.map((c) => c.toUpperCase()))];
  if (/^[a-z]{2}$/.test(q) && codes.includes(q.toUpperCase())) return q.toUpperCase();

  for (const lang of [...new Set([locale, 'en'])]) {
    let names: Intl.DisplayNames;
    try {
      names = new Intl.DisplayNames([lang], { type: 'region' });
    } catch {
      continue;
    }
    for (const code of codes) {
      let label: string | undefined;
      try {
        label = names.of(code);
      } catch {
        continue;
      }
      if (label && normalize(label) === q) return code;
    }
  }
  return null;
}

/** Destination du catalogue portant ce slug (« japan », « esim-japan »). */
export function findDestination(
  destinations: FeedDestination[],
  query: string
): FeedDestination | null {
  const q = normalize(query).replace(/^esim-/, '').replace(/ /g, '-');
  return (
    destinations.find((d) => normalize(d.destination).replace(/ /g, '-') === q) ??
    destinations.find((d) => normalize(d.pathSlug).replace(/ /g, '-') === `esim-${q}`) ??
    null
  );
}

/** Tous les codes couverts par le catalogue, pour borner la résolution de nom. */
export function allCoveredCodes(destinations: FeedDestination[]): string[] {
  const set = new Set<string>();
  for (const d of destinations) for (const c of d.coverage) set.add(c.toUpperCase());
  return [...set];
}

/**
 * La destination pays vendue seule pour ce code, quand elle existe. Un agent qui
 * apprend qu'une zone ne couvre pas la Croatie doit pouvoir enchaîner sur le
 * forfait Croatie plutôt que de conclure « pas couvert ».
 */
export function standaloneDestinationFor(
  destinations: FeedDestination[],
  code: string
): FeedDestination | null {
  const upper = code.toUpperCase();
  return destinations.find((d) => d.bundleType === 'local' && d.countryCode === upper) ?? null;
}
