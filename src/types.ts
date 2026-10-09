/**
 * Les langues du site (`web/i18n.ts`) : le flux `/{locale}/agent/catalog` existe
 * dans chacune, avec ses URL localisées et sa devise (USD en anglais, EUR en
 * français, JPY en japonais…). Les slugs de destination, eux, ne changent pas.
 */
export const LOCALES = [
  'en', 'fr', 'es', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'ru', 'tr', 'hi',
  'vi', 'th', 'sv', 'nb', 'da', 'fi', 'nl', 'pl', 'cs', 'zh-TW', 'id', 'tl', 'he',
] as const;
export type Locale = (typeof LOCALES)[number];
export type Usage = 'light' | 'medium' | 'heavy';

export interface FeedItem {
  sku: string;
  destination: string;
  countryCode: string | null;
  dataAmountGB: number | null;
  unlimited: boolean;
  validityDays: number;
  price: number;
  currency: string;
  url: string;
  /**
   * Page produit avec le forfait présélectionné, produite par le flux
   * (`web/lib/plan-deeplink.ts`). Optionnel : un flux plus ancien ne l'émet pas,
   * on retombe alors sur `url`.
   */
  checkoutUrl?: string;
  /** Rechargeable. Absent d'un flux antérieur au champ. */
  topUp?: boolean;
  availability: string;
  instantDelivery: boolean;
}

/** Ce que couvre une destination, dit une fois par destination. */
export interface FeedDestination {
  destination: string;
  pathSlug: string;
  url: string;
  countryCode: string | null;
  bundleType: string;
  coverage: string[];
  networks: { name: string; types: string[] }[];
}

export interface FeedResponse {
  generatedAt: string;
  brand: string;
  currency?: string;
  count: number;
  items: FeedItem[];
  /** Absent d'un flux antérieur au champ : les outils dégradent, ils n'échouent pas. */
  destinations?: FeedDestination[];
}

/** Résultat d'une lecture de catalogue : les articles, et s'ils sont périmés. */
export interface CatalogResult {
  items: FeedItem[];
  destinations: FeedDestination[];
  /** true = le flux n'a pas répondu, ces articles viennent d'un cache expiré. */
  stale: boolean;
}

export interface Recommendation {
  item: FeedItem;
  reason: string;
}
