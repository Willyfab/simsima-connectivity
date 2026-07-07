import { buildCheckoutLink } from '../lib/checkout-link';
import type { FeedItem } from '../types';

const item: FeedItem = {
  sku: 'esim-japan-1gb-7d',
  destination: 'japan',
  countryCode: 'JP',
  dataAmountGB: 1,
  unlimited: false,
  validityDays: 7,
  price: 5,
  currency: 'USD',
  url: 'https://simsima.io/en/esim/esim-japan',
  availability: 'in_stock',
  instantDelivery: true,
};

describe('buildCheckoutLink', () => {
  it('appends attribution + utm params', () => {
    const url = new URL(buildCheckoutLink(item, 'claude'));
    expect(url.searchParams.get('source')).toBe('agent:claude');
    expect(url.searchParams.get('utm_source')).toBe('claude');
    expect(url.searchParams.get('utm_medium')).toBe('mcp');
    expect(url.searchParams.get('utm_campaign')).toBe('agent-commerce');
    expect(url.pathname).toBe('/en/esim/esim-japan');
  });

  it('falls back to unknown for an invalid agentSource', () => {
    const url = new URL(buildCheckoutLink(item, 'Bad Source!!'));
    expect(url.searchParams.get('source')).toBe('agent:unknown');
    expect(url.searchParams.get('utm_source')).toBe('unknown');
  });

  it('preserves pre-existing query params on the product url', () => {
    const withQuery = { ...item, url: 'https://simsima.io/en/esim/esim-japan?ref=abc' };
    const url = new URL(buildCheckoutLink(withQuery, 'chatgpt'));
    expect(url.searchParams.get('ref')).toBe('abc');
    expect(url.searchParams.get('utm_source')).toBe('chatgpt');
  });
});
