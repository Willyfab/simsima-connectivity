export type Locale = 'en' | 'fr';
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
