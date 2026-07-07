import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { FeedItem, Locale } from './types';
import { resolveDestination } from './lib/resolve-destination';
import { recommendPlans } from './lib/recommend';
import { buildCheckoutLink } from './lib/checkout-link';

const localeSchema = z.enum(['en', 'fr']).default('en');

function text(summary: string, data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${summary}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
      },
    ],
  };
}

function errorText(message: string) {
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

function planView(i: FeedItem) {
  return {
    sku: i.sku,
    destination: i.destination,
    dataAmountGB: i.dataAmountGB,
    unlimited: i.unlimited,
    validityDays: i.validityDays,
    price: i.price,
    currency: i.currency,
    url: i.url,
  };
}

export function buildMcpServer(deps: {
  feed: { getCatalog(locale: Locale): Promise<FeedItem[]> };
}): McpServer {
  const server = new McpServer({ name: 'simsima-connectivity', version: '0.1.0' });

  server.registerTool(
    'list_destinations',
    {
      title: 'List eSIM destinations',
      description: 'List countries/regions Simsima covers, with min price and product URL.',
      inputSchema: { locale: localeSchema, region: z.string().optional() },
    },
    async ({ locale }) => {
      const items = await deps.feed.getCatalog(locale);
      const byDest = new Map<
        string,
        { name: string; url: string; minPrice: number; currency: string }
      >();
      for (const i of items) {
        const cur = byDest.get(i.destination);
        if (!cur || i.price < cur.minPrice) {
          byDest.set(i.destination, {
            name: i.destination,
            url: i.url,
            minPrice: i.price,
            currency: i.currency,
          });
        }
      }
      const destinations = [...byDest.entries()].map(([slug, v]) => ({ slug, ...v }));
      return text(`${destinations.length} destinations available.`, destinations);
    }
  );

  server.registerTool(
    'search_plans',
    {
      title: 'Search eSIM plans',
      description: 'Search plans for a destination (country name or slug), with optional filters.',
      inputSchema: {
        destination: z.string(),
        locale: localeSchema,
        maxPrice: z.number().optional(),
        minDataGB: z.number().optional(),
        maxValidityDays: z.number().optional(),
        unlimited: z.boolean().optional(),
      },
    },
    async ({ destination, locale, maxPrice, minDataGB, maxValidityDays, unlimited }) => {
      const items = await deps.feed.getCatalog(locale);
      const resolved = resolveDestination(items, destination);
      if (!resolved) return errorText(`Destination "${destination}" not found.`);
      let plans = resolved.items;
      if (maxPrice != null) plans = plans.filter((p) => p.price <= maxPrice);
      if (minDataGB != null)
        plans = plans.filter((p) => p.unlimited || (p.dataAmountGB ?? 0) >= minDataGB);
      if (maxValidityDays != null) plans = plans.filter((p) => p.validityDays <= maxValidityDays);
      if (unlimited != null) plans = plans.filter((p) => p.unlimited === unlimited);
      plans = [...plans].sort((a, b) => a.price - b.price);
      return text(`${plans.length} plan(s) for ${resolved.slug}.`, plans.map(planView));
    }
  );

  server.registerTool(
    'get_plan',
    {
      title: 'Get eSIM plan detail',
      description: 'Get a single plan by its sku.',
      inputSchema: { sku: z.string(), locale: localeSchema },
    },
    async ({ sku, locale }) => {
      const items = await deps.feed.getCatalog(locale);
      const found = items.find((i) => i.sku === sku);
      if (!found) return errorText(`Plan "${sku}" not found.`);
      return text(`Plan ${sku}.`, planView(found));
    }
  );

  server.registerTool(
    'recommend_plan',
    {
      title: 'Recommend an eSIM plan',
      description: 'Recommend the best plan(s) for a trip given its length and data usage.',
      inputSchema: {
        destination: z.string(),
        tripDays: z.number().int().positive(),
        usage: z.enum(['light', 'medium', 'heavy']),
        locale: localeSchema,
      },
    },
    async ({ destination, tripDays, usage, locale }) => {
      const items = await deps.feed.getCatalog(locale);
      const resolved = resolveDestination(items, destination);
      if (!resolved) return errorText(`Destination "${destination}" not found.`);
      const recs = recommendPlans(resolved.items, { tripDays, usage });
      if (recs.length === 0)
        return errorText(`No plan covers a ${tripDays}-day trip to ${resolved.slug}.`);
      return text(
        `Recommendations for ${tripDays} days in ${resolved.slug} (${usage} usage):`,
        recs.map((r) => ({ ...planView(r.item), reason: r.reason }))
      );
    }
  );

  server.registerTool(
    'create_checkout_link',
    {
      title: 'Create an attributed checkout link',
      description:
        'Return a Simsima product URL with agent attribution, for the user to complete checkout.',
      inputSchema: {
        sku: z.string().optional(),
        destination: z.string().optional(),
        agentSource: z.string(),
        locale: localeSchema,
      },
    },
    async ({ sku, destination, agentSource, locale }) => {
      const items = await deps.feed.getCatalog(locale);
      let target: FeedItem | undefined;
      if (sku) target = items.find((i) => i.sku === sku);
      else if (destination) target = resolveDestination(items, destination)?.items[0];
      if (!target) return errorText('Provide a valid sku or destination.');
      return text('Attributed checkout link:', { checkoutUrl: buildCheckoutLink(target, agentSource) });
    }
  );

  return server;
}
