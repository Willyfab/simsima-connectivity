import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../server';
import type { FeedItem, Locale } from '../types';

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

async function connect() {
  const server = buildMcpServer({ feed: { getCatalog: async (_l: Locale) => items } });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: any): string {
  return result.content.map((c: any) => c.text).join('\n');
}

describe('mcp tools', () => {
  it('lists the 5 tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'create_checkout_link',
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
