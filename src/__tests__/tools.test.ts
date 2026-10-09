import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../server';
import { withContext } from '../telemetry';
import { buildClientContext, type ClientFamily } from '../lib/client-context';
import type { FeedDestination, FeedItem, Locale } from '../types';

const items: FeedItem[] = [
  {
    sku: 'esim-japan-1gb-7d',
    destination: 'japan',
    countryCode: 'JP',
    dataAmountGB: 1,
    unlimited: false,
    validityDays: 7,
    price: 4,
    currency: 'USD',
    url: 'https://simsima.io/en/esim/esim-japan',
    availability: 'in_stock',
    instantDelivery: true,
  },
  {
    sku: 'esim-japan-5gb-7d',
    destination: 'japan',
    countryCode: 'JP',
    dataAmountGB: 5,
    unlimited: false,
    validityDays: 7,
    price: 9,
    currency: 'USD',
    url: 'https://simsima.io/en/esim/esim-japan',
    availability: 'in_stock',
    instantDelivery: true,
  },
];

const destinations: FeedDestination[] = [
  {
    destination: 'japan',
    pathSlug: 'esim-japan',
    url: 'https://simsima.io/en/esim/esim-japan',
    countryCode: 'JP',
    bundleType: 'local',
    coverage: ['JP'],
    networks: [{ name: 'NTT DOCOMO', types: ['4G', '5G'] }],
  },
  {
    destination: 'europe',
    pathSlug: 'esim-europe',
    url: 'https://simsima.io/en/esim/esim-europe',
    countryCode: null,
    bundleType: 'regional',
    coverage: ['FR', 'HR', 'IT'],
    networks: [],
  },
];

async function connectWith(
  getCatalog: (l: Locale) => Promise<{
    items: FeedItem[];
    destinations: FeedDestination[];
    stale: boolean;
  }>,
  telemetry?: any,
  clientFamily?: ClientFamily
) {
  const server = buildMcpServer({ feed: { getCatalog }, telemetry, client: clientFamily });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function fakeTelemetry() {
  const events: Array<{ event: string; props: Record<string, unknown> }> = [];
  return {
    events,
    telemetry: {
      capture: (props: Record<string, unknown>, event = 'mcp_tool_call') =>
        events.push({ event, props }),
      shutdown: async () => {},
    },
  };
}

async function connect() {
  const server = buildMcpServer({
    feed: { getCatalog: async (_l: Locale) => ({ items, destinations, stale: false }) },
  });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: any): string {
  return result.content.map((c: any) => c.text).join('\n');
}

describe('mcp tools', () => {
  it('lists the 7 tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'check_coverage',
      'create_checkout_link',
      'get_destination_info',
      'get_plan',
      'list_destinations',
      'recommend_plan',
      'search_plans',
    ]);
  });

  it('search_plans returns plans for a destination', async () => {
    const client = await connect();
    const res = await client.callTool({ name: 'search_plans', arguments: { destination: 'japan' } });
    expect(textOf(res)).toContain('esim-japan-1gb-7d');
  });

  it('recommend_plan returns a best fit', async () => {
    const client = await connect();
    const res = await client.callTool({
      name: 'recommend_plan',
      arguments: { destination: 'japan', tripDays: 7, usage: 'medium' },
    });
    expect(textOf(res)).toContain('esim-japan-5gb-7d');
  });

  it('create_checkout_link attributes the link to the calling client', async () => {
    const client = await connectWith(
      async () => ({ items, destinations, stale: false }),
      undefined,
      'claude'
    );
    const res = await client.callTool({
      name: 'create_checkout_link',
      arguments: { sku: 'esim-japan-1gb-7d' },
    });
    expect(textOf(res)).toContain('utm_medium=mcp');
    expect(textOf(res)).toContain('source=agent%3Aclaude');
  });

  it('create_checkout_link no longer asks the model for an agentSource', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const link = tools.find((t) => t.name === 'create_checkout_link');
    expect(Object.keys(link?.inputSchema.properties ?? {})).not.toContain('agentSource');
    expect(link?.inputSchema.required ?? []).toEqual([]);
  });

  it('create_checkout_link says what to pass when given nothing', async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: 'create_checkout_link', arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('search_plans');
  });

  it('declares every tool read-only, as the Anthropic directory requires', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(7);
    for (const t of tools) {
      expect(t.title).toBeTruthy();
      // Le portail de l'annuaire lit le titre dans les annotations.
      expect(t.annotations).toMatchObject({
        title: t.title,
        readOnlyHint: true,
        destructiveHint: false,
      });
    }
  });

  it('points to a way out when a destination is unknown', async () => {
    const client = await connect();
    const res: any = await client.callTool({
      name: 'search_plans',
      arguments: { destination: 'atlantide' },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('list_destinations');
  });

  it('get_plan errors clearly on unknown sku', async () => {
    const client = await connect();
    const res: any = await client.callTool({ name: 'get_plan', arguments: { sku: 'nope' } });
    expect(res.isError).toBe(true);
  });
});


describe('telemetry emitted by the tools', () => {
  it('counts results and flags a stale feed', async () => {
    const { events, telemetry } = fakeTelemetry();
    const client = await connectWith(async () => ({ items, destinations, stale: true }), telemetry);
    await client.callTool({
      name: 'search_plans',
      arguments: { destination: 'japan', locale: 'en' },
    });
    const call = events.find((e) => e.props.tool === 'search_plans');
    expect(call?.props.resultCount).toBe(2);
    expect(call?.props.feedStale).toBe(true);
  });

  it('names the reason when a destination cannot be resolved', async () => {
    const { events, telemetry } = fakeTelemetry();
    const client = await connectWith(async () => ({ items, destinations, stale: false }), telemetry);
    await client.callTool({
      name: 'search_plans',
      arguments: { destination: 'atlantide', locale: 'en' },
    });
    const call = events.find((e) => e.props.tool === 'search_plans');
    expect(call?.props.resultCount).toBe(0);
    expect(call?.props.failureReason).toBe('destination_not_found');
  });

  it('emits a dedicated conversion event for a checkout link', async () => {
    const { events, telemetry } = fakeTelemetry();
    const client = await connectWith(async () => ({ items, destinations, stale: false }), telemetry);
    await client.callTool({
      name: 'create_checkout_link',
      arguments: { sku: 'esim-japan-1gb-7d', locale: 'en' },
    });
    const conversion = events.find((e) => e.event === 'mcp_checkout_link');
    expect(conversion).toBeDefined();
    expect(conversion?.props.sku).toBe('esim-japan-1gb-7d');
    expect(conversion?.props.price).toBe(4);
    // Le flux de ce test n'a pas de checkoutUrl : le lien renvoie sur la page
    // destination nue, et l'événement doit le dire.
    expect(conversion?.props.preselected).toBe(false);
  });
});


describe('locales', () => {
  it('serves every language of the site, not just en and fr', async () => {
    const asked: Locale[] = [];
    const client = await connectWith(async (l) => {
      asked.push(l);
      return { items, destinations, stale: false };
    });
    for (const locale of ['de', 'ja', 'zh-TW', 'he']) {
      const r: any = await client.callTool({
        name: 'search_plans',
        arguments: { destination: 'japan', locale },
      });
      expect(r.isError).toBeFalsy();
    }
    expect(asked).toEqual(['de', 'ja', 'zh-TW', 'he']);
  });

  it('rejects a language the site does not have', async () => {
    const client = await connect();
    const r: any = await client.callTool({
      name: 'search_plans',
      arguments: { destination: 'japan', locale: 'xx' },
    });
    expect(r.isError).toBe(true);
  });
});

describe('check_coverage', () => {
  it('answers with a plain country name, not just an ISO code', async () => {
    const client = await connect();
    const r: any = await client.callTool({
      name: 'check_coverage',
      arguments: { destination: 'europe', country: 'Croatia', locale: 'en' },
    });
    expect(textOf(r)).toContain('"covered": true');
    expect(textOf(r)).toContain('"country": "HR"');
  });

  it('says no, and hands over the standalone country plan', async () => {
    const client = await connect();
    const r: any = await client.callTool({
      name: 'check_coverage',
      arguments: { destination: 'europe', country: 'JP', locale: 'en' },
    });
    const out = textOf(r);
    expect(out).toContain('"covered": false');
    // Ne pas laisser l'agent sur un « non » : le forfait Japon existe.
    expect(out).toContain('https://simsima.io/en/esim/esim-japan');
  });

  it('reads a country name written in the user\'s language and script', async () => {
    const client = await connect();
    const r: any = await client.callTool({
      name: 'check_coverage',
      arguments: { destination: 'europe', country: 'クロアチア', locale: 'ja' },
    });
    expect(textOf(r)).toContain('"country": "HR"');
    expect(textOf(r)).toContain('"covered": true');
  });

  it('degrades explicitly when the feed carries no coverage', async () => {
    const client = await connectWith(async () => ({ items, destinations: [], stale: false }));
    const r: any = await client.callTool({
      name: 'check_coverage',
      arguments: { destination: 'europe', country: 'HR', locale: 'en' },
    });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('unavailable');
  });
});

describe('get_destination_info', () => {
  it('returns operators for a single-country destination', async () => {
    const client = await connect();
    const r: any = await client.callTool({
      name: 'get_destination_info',
      arguments: { destination: 'japan', locale: 'en' },
    });
    const out = textOf(r);
    expect(out).toContain('NTT DOCOMO');
    expect(out).toContain('"planCount": 2');
  });

  it('leaves operators empty on a zone — forty countries mixed says nothing', async () => {
    const client = await connect();
    const r: any = await client.callTool({
      name: 'get_destination_info',
      arguments: { destination: 'europe', locale: 'en' },
    });
    expect(textOf(r)).toContain('"networks": []');
  });
});

describe("contexte d'origine de bout en bout", () => {
  it("joint le client résolu depuis les en-têtes à l'événement de chaque outil", async () => {
    const { events, telemetry } = fakeTelemetry();
    const decorated = withContext(telemetry, buildClientContext({
      'user-agent': 'Claude-User',
      'cf-ipcountry': 'JP',
      'cf-connecting-ip': '203.0.113.7',
    }));
    const client = await connectWith(
      async (_l: Locale) => ({ items, destinations, stale: false }),
      decorated
    );

    await client.callTool({ name: 'search_plans', arguments: { destination: 'japan', locale: 'en' } });
    await client.callTool({
      name: 'create_checkout_link',
      arguments: { sku: 'esim-japan-1gb-7d', locale: 'en' },
    });

    // Tous les événements portent l'origine, pas seulement celui du lien.
    expect(events.length).toBeGreaterThanOrEqual(3);
    for (const e of events) {
      expect(e.props.client).toBe('claude');
      expect(e.props.country).toBe('JP');
      expect(e.props.userAgent).toBe('Claude-User');
      // L'IP sert au débit, jamais à la mesure.
      expect(JSON.stringify(e.props)).not.toContain('203.0.113.7');
    }
    // Plus rien de dicté par le modèle : l'origine est celle mesurée.
    const link = events.find((e) => e.event === 'mcp_checkout_link');
    expect(link?.props).not.toHaveProperty('agentSource');
    expect(link?.props.client).toBe('claude');
  });

  it('distingue une sonde d’annuaire d’un client réel', async () => {
    const { events, telemetry } = fakeTelemetry();
    const decorated = withContext(
      telemetry,
      buildClientContext({ 'user-agent': 'mcpbeat/0.1 (+https://mcpbeat.com/bot/; liveness check)' })
    );
    const client = await connectWith(
      async (_l: Locale) => ({ items, destinations, stale: false }),
      decorated
    );
    await client.callTool({ name: 'list_destinations', arguments: { locale: 'en' } });
    expect(events[0].props.client).toBe('bot');
  });
});
