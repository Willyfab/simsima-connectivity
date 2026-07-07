import { recommendPlans, GB_PER_DAY } from '../lib/recommend';
import type { FeedItem } from '../types';

const mk = (
  sku: string,
  gb: number | null,
  unlimited: boolean,
  days: number,
  price: number
): FeedItem => ({
  sku,
  destination: 'japan',
  countryCode: 'JP',
  dataAmountGB: gb,
  unlimited,
  validityDays: days,
  price,
  currency: 'USD',
  url: 'https://simsima.io/en/esim/esim-japan',
  availability: 'in_stock',
  instantDelivery: true,
});

describe('recommendPlans', () => {
  const plans: FeedItem[] = [
    mk('s1', 1, false, 7, 4), // too small for 7d medium (need 4.9)
    mk('s5', 5, false, 7, 9), // covers
    mk('s10', 10, false, 30, 15),
    mk('unl', null, true, 15, 19),
  ];

  it('exposes GB_PER_DAY constants', () => {
    expect(GB_PER_DAY).toEqual({ light: 0.3, medium: 0.7, heavy: 1.5 });
  });

  it('best fit is the cheapest plan covering data need and duration', () => {
    const recs = recommendPlans(plans, { tripDays: 7, usage: 'medium' }); // need 4.9GB
    expect(recs[0].item.sku).toBe('s5');
    expect(recs.length).toBeGreaterThanOrEqual(1);
  });

  it('includes an unlimited option when present and distinct', () => {
    const recs = recommendPlans(plans, { tripDays: 7, usage: 'medium' });
    expect(recs.some((r) => r.item.unlimited)).toBe(true);
  });

  it('falls back to largest covering plan and flags partial coverage when nothing covers need', () => {
    const small: FeedItem[] = [mk('a', 1, false, 30, 3), mk('b', 2, false, 30, 5)];
    const recs = recommendPlans(small, { tripDays: 30, usage: 'heavy' }); // need 45GB
    expect(recs[0].item.sku).toBe('b');
    expect(recs[0].reason.toLowerCase()).toContain('partial');
  });

  it('returns empty when no plan covers the duration', () => {
    const recs = recommendPlans([mk('x', 5, false, 3, 4)], { tripDays: 30, usage: 'light' });
    expect(recs).toEqual([]);
  });
});
