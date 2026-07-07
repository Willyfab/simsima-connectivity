import type { FeedItem, Recommendation, Usage } from '../types';

export const GB_PER_DAY: Record<Usage, number> = { light: 0.3, medium: 0.7, heavy: 1.5 };

function coversData(item: FeedItem, needGB: number): boolean {
  return item.unlimited || (item.dataAmountGB != null && item.dataAmountGB >= needGB);
}

export function recommendPlans(
  items: FeedItem[],
  opts: { tripDays: number; usage: Usage }
): Recommendation[] {
  const needGB = GB_PER_DAY[opts.usage] * opts.tripDays;
  const byPrice = [...items]
    .filter((i) => i.validityDays >= opts.tripDays)
    .sort((a, b) => a.price - b.price);
  if (byPrice.length === 0) return [];

  const recs: Recommendation[] = [];
  const push = (item: FeedItem, reason: string) => {
    if (!recs.some((r) => r.item.sku === item.sku)) recs.push({ item, reason });
  };

  const bestFit = byPrice.find((i) => coversData(i, needGB));
  if (bestFit) {
    push(bestFit, `Covers ~${needGB.toFixed(1)} GB for ${opts.tripDays} days (${opts.usage} usage).`);
  } else {
    const largest = [...byPrice].sort((a, b) => (b.dataAmountGB ?? 0) - (a.dataAmountGB ?? 0))[0];
    push(largest, `Largest plan for the trip length; partial coverage (needs ~${needGB.toFixed(1)} GB).`);
  }

  push(byPrice[0], 'Cheapest plan for this trip length.');

  const unlimited = byPrice.find((i) => i.unlimited);
  if (unlimited) push(unlimited, 'Unlimited data — no usage worries.');

  return recs.slice(0, 3);
}
