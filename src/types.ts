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
  availability: string;
  instantDelivery: boolean;
}

export interface FeedResponse {
  generatedAt: string;
  brand: string;
  count: number;
  items: FeedItem[];
}

export interface Recommendation {
  item: FeedItem;
  reason: string;
}
