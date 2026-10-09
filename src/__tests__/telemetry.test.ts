import { createTelemetry, withContext, withTelemetry, type CaptureClient } from '../telemetry';

function fakeClient() {
  const calls: any[] = [];
  const client: CaptureClient = {
    capture: (a) => {
      calls.push(a);
    },
    shutdown: async () => {},
  };
  return { client, calls };
}

describe('createTelemetry', () => {
  it('is a no-op when no key and no client', () => {
    const t = createTelemetry();
    expect(() => t.capture({ tool: 'x' })).not.toThrow();
  });

  it('captures mcp_tool_call with a distinct_id per client family', () => {
    const { client, calls } = fakeClient();
    const t = createTelemetry({ client });
    t.capture({ tool: 'create_checkout_link', client: 'claude', isError: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].event).toBe('mcp_tool_call');
    expect(calls[0].distinctId).toBe('mcp:claude');
    expect(calls[0].properties.tool).toBe('create_checkout_link');
  });

  it('defaults distinct_id to mcp-anonymous without a client family', () => {
    const { client, calls } = fakeClient();
    createTelemetry({ client }).capture({ tool: 'search_plans' });
    expect(calls[0].distinctId).toBe('mcp-anonymous');
  });

  it('never throws when the client capture throws', () => {
    const client: CaptureClient = {
      capture: () => {
        throw new Error('posthog down');
      },
      shutdown: async () => {},
    };
    const t = createTelemetry({ client });
    expect(() => t.capture({ tool: 'x' })).not.toThrow();
  });
});

describe('withTelemetry', () => {
  it('returns the handler result unchanged and captures once', async () => {
    const { client, calls } = fakeClient();
    const t = createTelemetry({ client });
    const handler = async (_args: { locale: string; destination: string }) => ({
      content: [{ type: 'text' as const, text: 'ok' }],
    });
    const wrapped = withTelemetry('search_plans', t, handler);
    const res = await wrapped({ locale: 'en', destination: 'japan' });
    expect(res).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(calls).toHaveLength(1);
    expect(calls[0].properties).toMatchObject({
      tool: 'search_plans',
      locale: 'en',
      destination: 'japan',
      isError: false,
    });
    expect(typeof calls[0].properties.durationMs).toBe('number');
  });

  it('captures isError:true for a business-error result and returns it', async () => {
    const { client, calls } = fakeClient();
    const t = createTelemetry({ client });
    const handler = async () => ({
      isError: true,
      content: [{ type: 'text' as const, text: 'nope' }],
    });
    const res = await withTelemetry('get_plan', t, handler)({ sku: 'x' } as any);
    expect(res.isError).toBe(true);
    expect(calls[0].properties.isError).toBe(true);
  });

  it('captures isError:true then re-throws when the handler throws', async () => {
    const { client, calls } = fakeClient();
    const t = createTelemetry({ client });
    const handler = async () => {
      throw new Error('boom');
    };
    await expect(withTelemetry('list_destinations', t, handler)({} as any)).rejects.toThrow('boom');
    expect(calls[0].properties.isError).toBe(true);
  });
});

describe('withContext', () => {
  it('joint le contexte à chaque capture', () => {
    const { client, calls } = fakeClient();
    const t = withContext(createTelemetry({ client }), { client: 'claude', country: 'FR' });
    t.capture({ tool: 'search_plans' });
    t.capture({ tool: 'get_plan' });
    expect(calls).toHaveLength(2);
    expect(calls[0].properties).toMatchObject({ tool: 'search_plans', client: 'claude', country: 'FR' });
    expect(calls[1].properties).toMatchObject({ tool: 'get_plan', client: 'claude', country: 'FR' });
  });

  it("laisse l'appel l'emporter sur le contexte", () => {
    const { client, calls } = fakeClient();
    withContext(createTelemetry({ client }), { locale: 'en' }).capture({ tool: 'x', locale: 'fr' });
    expect(calls[0].properties.locale).toBe('fr');
  });

  it('tire le distinct_id de la famille de client du contexte', () => {
    const { client, calls } = fakeClient();
    withContext(createTelemetry({ client }), { client: 'claude' }).capture({
      tool: 'create_checkout_link',
    });
    expect(calls[0].distinctId).toBe('mcp:claude');
    expect(calls[0].properties.client).toBe('claude');
  });

  it("transmet l'événement dédié du lien d'achat", () => {
    const { client, calls } = fakeClient();
    withContext(createTelemetry({ client }), { client: 'openai' }).capture(
      { sku: 'esim-japan-10gb-30d' },
      'mcp_checkout_link'
    );
    expect(calls[0].event).toBe('mcp_checkout_link');
    expect(calls[0].properties.client).toBe('openai');
  });
});
