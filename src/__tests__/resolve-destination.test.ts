import { resolveDestination } from '../lib/resolve-destination';
import type { FeedItem } from '../types';

const mk = (destination: string, sku: string): FeedItem => ({
  sku,
  destination,
  countryCode: destination.slice(0, 2).toUpperCase(),
  dataAmountGB: 1,
  unlimited: false,
  validityDays: 7,
  price: 5,
  currency: 'USD',
  url: `https://simsima.io/en/esim/esim-${destination}`,
  availability: 'in_stock',
  instantDelivery: true,
});

const items: FeedItem[] = [mk('japan', 'a'), mk('japan', 'b'), mk('sri-lanka', 'c'), mk('curacao', 'd')];

describe('resolveDestination', () => {
  it('matches by bare slug', () => {
    expect(resolveDestination(items, 'japan')?.items).toHaveLength(2);
  });
  it('matches by esim- prefixed slug', () => {
    expect(resolveDestination(items, 'esim-japan')?.slug).toBe('japan');
  });
  it('matches case/space-insensitively (Sri Lanka -> sri-lanka)', () => {
    expect(resolveDestination(items, 'Sri Lanka')?.slug).toBe('sri-lanka');
  });
  it('matches accented input (Curaçao -> curacao)', () => {
    expect(resolveDestination(items, 'Curaçao')?.slug).toBe('curacao');
  });
  it('returns null for unknown destination', () => {
    expect(resolveDestination(items, 'atlantis')).toBeNull();
  });
});
