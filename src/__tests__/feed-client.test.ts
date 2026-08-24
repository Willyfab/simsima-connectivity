import { createFeedClient } from '../feed-client';
import type { FeedResponse } from '../types';

function fakeResponse(items: number): FeedResponse {
  return {
    generatedAt: new Date().toISOString(),
    brand: 'Simsima',
    count: items,
    destinations: [],
    items: Array.from({ length: items }, (_, i) => ({
      sku: `esim-x-${i}gb-7d`,
      destination: 'x',
      countryCode: 'XX',
      dataAmountGB: i,
      unlimited: false,
      validityDays: 7,
      price: i + 1,
      currency: 'USD',
      url: 'https://simsima.io/en/esim/esim-x',
      availability: 'in_stock',
      instantDelivery: true,
    })),
  };
}

function mockFetch(body: FeedResponse, ok = true) {
  return jest.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
}

describe('feed-client', () => {
  it('fetches and returns catalog items for a locale', async () => {
    const fetchImpl = mockFetch(fakeResponse(2));
    const client = createFeedClient({ baseUrl: 'https://simsima.io', fetchImpl });
    const { items, stale } = await client.getCatalog('en');
    expect(items).toHaveLength(2);
    expect(stale).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://simsima.io/en/agent/catalog',
      expect.any(Object)
    );
  });

  it('caches within TTL (no second fetch)', async () => {
    const fetchImpl = mockFetch(fakeResponse(1));
    const client = createFeedClient({ baseUrl: 'https://simsima.io', fetchImpl, ttlMs: 10_000 });
    await client.getCatalog('en');
    await client.getCatalog('en');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('serves stale cache when a later fetch fails', async () => {
    const good = mockFetch(fakeResponse(3));
    const client = createFeedClient({ baseUrl: 'https://simsima.io', fetchImpl: good, ttlMs: 0 });
    const first = await client.getCatalog('en');
    expect(first.items).toHaveLength(3);
    expect(first.stale).toBe(false);
    (good as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('network');
    });
    const second = await client.getCatalog('en');
    expect(second.items).toHaveLength(3);
    // Le cache a servi APRÈS un échec : la réponse est périmée et doit le dire,
    // sinon une panne du flux passe pour un fonctionnement normal.
    expect(second.stale).toBe(true);
  });

  it('throws when first fetch fails and no cache exists', async () => {
    const bad = jest.fn(async () => {
      throw new Error('boom');
    });
    const client = createFeedClient({ baseUrl: 'https://simsima.io', fetchImpl: bad });
    await expect(client.getCatalog('fr')).rejects.toThrow('boom');
  });
});
