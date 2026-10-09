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
 * Forme de comparaison d'un nom de pays : la ponctuation, « & » et l'abréviation
 * « St. » varient d'une source à l'autre (« St. Lucia », « saint-lucia »,
 * « Bosnia & Herzegovina ») sans que le pays change.
 */
function nameKey(s: string): string {
  return normalize(s)
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/\bst\b/g, 'saint');
}

/**
 * Noms usuels qu'aucune des deux autres sources ne donne : ni Unicode, qui suit
 * les noms officiels, ni les slugs du catalogue. Volontairement courte : tout
 * ce que le catalogue nomme déjà (« turkey », « czech-republic ») n'a rien à
 * faire ici.
 */
const ALIASES: Record<string, string> = {
  usa: 'US',
  america: 'US',
  'united states of america': 'US',
  'great britain': 'GB',
  britain: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  korea: 'KR',
  holland: 'NL',
  burma: 'MM',
  swaziland: 'SZ',
  uae: 'AE',
  emirates: 'AE',
  drc: 'CD',
  'dr congo': 'CD',
  macedonia: 'MK',
  'ivory coast': 'CI',
  vatican: 'VA',
  'holy see': 'VA',
  'cabo verde': 'CV',
  trinidad: 'TT',
};

/**
 * Code ISO d'un pays écrit en clair, cherché parmi les codes que le catalogue
 * couvre réellement — pas sur la terre entière : la question ne porte que sur
 * cette liste, et la restreindre évite de résoudre un pays qu'on ne vend pas.
 *
 * Trois sources de noms, parce qu'aucune ne suffit seule :
 * - `Intl.DisplayNames`, en forme longue et courte, dans la locale demandée et
 *   en anglais : « Croatie » comme « Croatia », « UK » comme « United Kingdom ».
 *   Mais Unicode suit les noms officiels : « Türkiye », « Czechia », « Hong Kong
 *   SAR China », et un voyageur qui écrit « Turkey » restait sans réponse ;
 * - les slugs des destinations pays du catalogue, qui portent les noms usuels
 *   du site (`turkey`, `czech-republic`, `hong-kong`) ;
 * - `ALIASES`, pour les quelques noms familiers restants (« USA », « England »).
 * Un libellé à parenthèses compte pour ses deux parties : « Myanmar (Burma) ».
 */
export function resolveCountryCode(
  query: string,
  knownCodes: string[],
  locale = 'en',
  destinations: FeedDestination[] = []
): string | null {
  const q = nameKey(query);
  if (!q) return null;

  const codes = new Set(knownCodes.map((c) => c.toUpperCase()));
  if (/^[a-z]{2}$/.test(q) && codes.has(q.toUpperCase())) return q.toUpperCase();

  const byName = new Map<string, string>();
  const add = (label: string | undefined, code: string) => {
    if (!label) return;
    for (const part of [label, ...label.split(/[()]/)]) {
      const key = nameKey(part);
      if (key && !byName.has(key)) byName.set(key, code);
    }
  };

  for (const lang of [...new Set([locale, 'en'])]) {
    for (const style of ['long', 'short'] as const) {
      let names: Intl.DisplayNames;
      try {
        names = new Intl.DisplayNames([lang], { type: 'region', style });
      } catch {
        continue;
      }
      for (const code of codes) {
        try {
          add(names.of(code), code);
        } catch {
          /* code inconnu d'ICU : les autres sources peuvent le nommer */
        }
      }
    }
  }
  for (const d of destinations) {
    const code = d.countryCode?.toUpperCase();
    if (code && codes.has(code)) add(d.destination, code);
  }
  for (const [alias, code] of Object.entries(ALIASES)) {
    if (codes.has(code)) add(alias, code);
  }

  return byName.get(q) ?? null;
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
