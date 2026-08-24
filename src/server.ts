import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CatalogResult, FeedItem, Locale } from './types';
import { resolveDestination } from './lib/resolve-destination';
import { recommendPlans } from './lib/recommend';
import { buildCheckoutLink } from './lib/checkout-link';
import {
  allCoveredCodes,
  findDestination,
  resolveCountryCode,
  standaloneDestinationFor,
} from './lib/coverage';
import { createTelemetry, withTelemetry, type Telemetry } from './telemetry';

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
    /** Page produit canonique — l'URL à citer dans une réponse. */
    url: i.url,
    /**
     * Page produit avec CE forfait présélectionné. Exposé dès la recherche et
     * pas seulement par `create_checkout_link` : un agent qui vient de citer un
     * prix précis recopie le lien qu'il a sous la main, et l'URL nue le ferait
     * atterrir sur la liste complète.
     */
    checkoutUrl: i.checkoutUrl ?? i.url,
    /** Rechargeable : évite d'acheter large « au cas où » sur un long séjour. */
    topUp: i.topUp ?? false,
  };
}

export function buildMcpServer(deps: {
  feed: { getCatalog(locale: Locale): Promise<CatalogResult> };
  telemetry?: Telemetry;
}): McpServer {
  const server = new McpServer({ name: 'simsima-connectivity', version: '0.1.0' });
  const telemetry = deps.telemetry ?? createTelemetry();

  server.registerTool(
    'list_destinations',
    {
      title: 'List eSIM destinations',
      description: 'List destinations (countries) Simsima covers, with min price and product URL.',
      inputSchema: { locale: localeSchema },
    },
    withTelemetry('list_destinations', telemetry, async ({ locale }, track) => {
      const { items, stale } = await deps.feed.getCatalog(locale);
      const byDest = new Map<
        string,
        {
          name: string;
          url: string;
          minPrice: number;
          currency: string;
          // Le prix d'appel ne veut rien dire sans ce qu'il achète : « à partir
          // de 1,50 $ » est un 100 Mo / 7 jours, un produit d'appel, pas une
          // offre à annoncer seule.
          minPriceDataGB: number | null;
          minPriceUnlimited: boolean;
          minPriceValidityDays: number;
        }
      >();
      for (const i of items) {
        const cur = byDest.get(i.destination);
        if (!cur || i.price < cur.minPrice) {
          byDest.set(i.destination, {
            name: i.destination,
            url: i.url,
            minPrice: i.price,
            currency: i.currency,
            minPriceDataGB: i.dataAmountGB,
            minPriceUnlimited: i.unlimited,
            minPriceValidityDays: i.validityDays,
          });
        }
      }
      const destinations = [...byDest.entries()].map(([slug, v]) => ({ slug, ...v }));
      track({ resultCount: destinations.length, feedStale: stale });
      return text(`${destinations.length} destinations available.`, destinations);
    })
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
    withTelemetry(
      'search_plans',
      telemetry,
      async ({ destination, locale, maxPrice, minDataGB, maxValidityDays, unlimited }, track) => {
        const { items, stale } = await deps.feed.getCatalog(locale);
        track({ feedStale: stale });
        const resolved = resolveDestination(items, destination);
        if (!resolved) {
          // Une destination demandée qu'on ne sait pas résoudre est soit un trou
          // de catalogue, soit une variante de nommage à absorber. Les deux se
          // corrigent, à condition de les voir.
          track({ resultCount: 0, failureReason: 'destination_not_found' });
          return errorText(`Destination "${destination}" not found.`);
        }
        let plans = resolved.items;
        if (maxPrice != null) plans = plans.filter((p) => p.price <= maxPrice);
        if (minDataGB != null)
          plans = plans.filter((p) => p.unlimited || (p.dataAmountGB ?? 0) >= minDataGB);
        if (maxValidityDays != null) plans = plans.filter((p) => p.validityDays <= maxValidityDays);
        if (unlimited != null) plans = plans.filter((p) => p.unlimited === unlimited);
        plans = [...plans].sort((a, b) => a.price - b.price);
        // Zéro résultat après filtrage n'est pas une erreur, mais ce n'est pas
        // un succès non plus : sans ce compteur les deux sont indiscernables.
        track({ resultCount: plans.length, ...(plans.length === 0 ? { failureReason: 'filters_too_narrow' } : {}) });
        return text(`${plans.length} plan(s) for ${resolved.slug}.`, plans.map(planView));
      }
    )
  );

  server.registerTool(
    'get_plan',
    {
      title: 'Get eSIM plan detail',
      description: 'Get a single plan by its sku.',
      inputSchema: { sku: z.string(), locale: localeSchema },
    },
    withTelemetry('get_plan', telemetry, async ({ sku, locale }, track) => {
      const { items, stale } = await deps.feed.getCatalog(locale);
      track({ feedStale: stale });
      const found = items.find((i) => i.sku === sku);
      if (!found) {
        track({ resultCount: 0, failureReason: 'sku_not_found' });
        return errorText(`Plan "${sku}" not found.`);
      }
      track({ resultCount: 1 });
      return text(`Plan ${sku}.`, planView(found));
    })
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
    withTelemetry('recommend_plan', telemetry, async ({ destination, tripDays, usage, locale }, track) => {
      const { items, stale } = await deps.feed.getCatalog(locale);
      track({ feedStale: stale });
      const resolved = resolveDestination(items, destination);
      if (!resolved) {
        track({ resultCount: 0, failureReason: 'destination_not_found' });
        return errorText(`Destination "${destination}" not found.`);
      }
      const recs = recommendPlans(resolved.items, { tripDays, usage });
      if (recs.length === 0) {
        // Aucun forfait ne couvre la durée demandée : c'est un trou d'offre
        // (durées longues, surtout), pas un bug. À suivre dans le temps.
        track({ resultCount: 0, failureReason: 'no_plan_covers_trip' });
        return errorText(`No plan covers a ${tripDays}-day trip to ${resolved.slug}.`);
      }
      track({ resultCount: recs.length });
      return text(
        `Recommendations for ${tripDays} days in ${resolved.slug} (${usage} usage):`,
        recs.map((r) => ({ ...planView(r.item), reason: r.reason }))
      );
    })
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
    withTelemetry('create_checkout_link', telemetry, async ({ sku, destination, agentSource, locale }, track) => {
      const { items, stale } = await deps.feed.getCatalog(locale);
      track({ feedStale: stale });
      let target: FeedItem | undefined;
      if (sku) target = items.find((i) => i.sku === sku);
      else if (destination) target = resolveDestination(items, destination)?.items[0];
      if (!target) {
        track({ resultCount: 0, failureReason: sku ? 'sku_not_found' : 'destination_not_found' });
        return errorText('Provide a valid sku or destination.');
      }
      const checkoutUrl = buildCheckoutLink(target, agentSource);
      track({ resultCount: 1 });
      // Événement dédié : c'est la conversion du canal agent. Noyée dans
      // `mcp_tool_call`, elle n'est lisible qu'en filtrant sur un nom d'outil ;
      // à part, elle se branche directement sur un tunnel PostHog jusqu'au
      // `purchase` server-side (même `utm_source`, `utm_content` = le SKU).
      telemetry.capture(
        {
          agentSource,
          locale,
          tool: 'create_checkout_link',
          sku: target.sku,
          destination: target.destination,
          price: target.price,
          currency: target.currency,
          unlimited: target.unlimited,
          validityDays: target.validityDays,
          // false = le flux n'a pas encore de deep-link, le lien renvoie sur la
          // page destination nue et l'acheteur doit rechoisir. À surveiller.
          preselected: Boolean(target.checkoutUrl),
        },
        'mcp_checkout_link'
      );
      return text('Attributed checkout link:', { checkoutUrl });
    })
  );

  server.registerTool(
    'check_coverage',
    {
      title: 'Check whether a destination covers a country',
      description:
        'Answer "does this eSIM work in <country>" for a destination (country, region or global plan). Accepts a country name or ISO code.',
      inputSchema: {
        destination: z.string(),
        country: z.string(),
        locale: localeSchema,
      },
    },
    withTelemetry('check_coverage', telemetry, async ({ destination, country, locale }, track) => {
      const { destinations, stale } = await deps.feed.getCatalog(locale);
      track({ feedStale: stale });
      if (destinations.length === 0) {
        // Flux antérieur au champ `destinations` : le dire, plutôt que de
        // répondre « non couvert » — un faux négatif ferait perdre la vente.
        track({ resultCount: 0, failureReason: 'coverage_unavailable' });
        return errorText('Coverage data is unavailable for this catalog.');
      }
      const dest = findDestination(destinations, destination);
      if (!dest) {
        track({ resultCount: 0, failureReason: 'destination_not_found' });
        return errorText(`Destination "${destination}" not found.`);
      }
      const code = resolveCountryCode(country, allCoveredCodes(destinations), locale);
      if (!code) {
        track({ resultCount: 0, failureReason: 'country_not_recognized' });
        return errorText(`Country "${country}" not recognized, or not covered by any Simsima plan.`);
      }
      const covered = dest.coverage.includes(code);
      const standalone = standaloneDestinationFor(destinations, code);
      track({ resultCount: 1, covered });
      return text(covered ? `${dest.destination} covers ${code}.` : `${dest.destination} does not cover ${code}.`, {
        destination: dest.destination,
        country: code,
        covered,
        coverageCount: dest.coverage.length,
        // Toujours renvoyé, couvert ou non : couvert, c'est l'alternative
        // dédiée souvent moins chère ; pas couvert, c'est la porte de sortie.
        countryPlanUrl: standalone?.url ?? null,
        countryPlanDestination: standalone?.destination ?? null,
      });
    })
  );

  server.registerTool(
    'get_destination_info',
    {
      title: 'Get destination coverage and networks',
      description:
        'Coverage (ISO country codes), mobile operators, top-up availability and entry price for a destination.',
      inputSchema: { destination: z.string(), locale: localeSchema },
    },
    withTelemetry('get_destination_info', telemetry, async ({ destination, locale }, track) => {
      const { items, destinations, stale } = await deps.feed.getCatalog(locale);
      track({ feedStale: stale });
      const dest = findDestination(destinations, destination);
      if (!dest) {
        track({ resultCount: 0, failureReason: 'destination_not_found' });
        return errorText(`Destination "${destination}" not found.`);
      }
      const plans = items.filter((i) => i.destination === dest.destination);
      const cheapest = [...plans].sort((a, b) => a.price - b.price)[0];
      track({ resultCount: plans.length });
      return text(`${dest.destination}: ${dest.coverage.length} country/countries covered.`, {
        destination: dest.destination,
        url: dest.url,
        bundleType: dest.bundleType,
        coverage: dest.coverage,
        // Vide sur une zone : la liste des opérateurs de quarante pays mélangés
        // ne veut rien dire. L'agent interroge la destination du pays visé.
        networks: dest.networks,
        planCount: plans.length,
        topUpAvailable: plans.some((p) => p.topUp),
        cheapestPlan: cheapest ? planView(cheapest) : null,
      });
    })
  );

  return server;
}
