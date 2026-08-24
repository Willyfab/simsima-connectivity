import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../server';
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
  telemetry?: any
) {
  const server = buildMcpServer({ feed: { getCatalog }, telemetry });
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

  it('create_checkout_link returns an attributed url', async () => {
    const client = await connect();
    const res = await client.callTool({
      name: 'create_checkout_link',
      arguments: { sku: 'esim-japan-1gb-7d', agentSource: 'claude' },
    });
    expect(textOf(res)).toContain('utm_medium=mcp');
    expect(textOf(res)).toContain('source=agent%3Aclaude');
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
      arguments: { sku: 'esim-japan-1gb-7d', agentSource: 'claude', locale: 'en' },
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
