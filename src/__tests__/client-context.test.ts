import {
  buildClientContext,
  classifyClient,
  resolveClientIp,
} from '../lib/client-context';

describe('classifyClient', () => {
  it.each([
    ['Claude-User', 'claude'],
    ['claude-desktop/1.2.0', 'claude'],
    ['openai-mcp/0.1', 'openai'],
    ['Cursor/0.42 (mcp)', 'cursor'],
    ['mcpbeat/0.1 (+https://mcpbeat.com/bot/; liveness check)', 'bot'],
    ['SentinelOracle/0.1 (+https://glimind.com/opt-out; liveness-only, never invokes)', 'bot'],
    ['rokmcp-collector/0.2 (+https://rokmcp.com/bot)', 'bot'],
    ['ProofBench/0.1 (+https://proofbench.dev/about/probe)', 'bot'],
    ['Go-http-client/2.0', 'script'],
    ['python-httpx/0.28.1', 'script'],
    ['node', 'script'],
  ] as const)('classe %s en %s', (ua, expected) => {
    expect(classifyClient(ua)).toBe(expected);
  });

  it('retombe sur unknown sans user-agent', () => {
    expect(classifyClient(undefined)).toBe('unknown');
    expect(classifyClient('')).toBe('unknown');
  });

  it('préfère le client réel à la règle bot quand les deux matchent', () => {
    // Un client Claude dont l'UA contient « watch » reste un client Claude :
    // l'ordre des règles porte cette priorité, il ne doit pas se perdre.
    expect(classifyClient('Claude-User (watch mode)')).toBe('claude');
  });
});

describe('resolveClientIp', () => {
  it('préfère CF-Connecting-IP', () => {
    expect(
      resolveClientIp({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }, '10.0.0.1')
    ).toBe('1.2.3.4');
  });

  it('retombe sur le premier X-Forwarded-For', () => {
    expect(resolveClientIp({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })).toBe('1.2.3.4');
  });

  it('retombe sur req.ip en dernier', () => {
    expect(resolveClientIp({}, '10.0.0.1')).toBe('10.0.0.1');
  });

  it('ne renvoie jamais une chaîne vide', () => {
    expect(resolveClientIp({ 'cf-connecting-ip': '  ' })).toBe('unknown');
  });
});

describe('buildClientContext', () => {
  it('porte famille, user-agent et pays', () => {
    expect(
      buildClientContext({ 'user-agent': 'Claude-User', 'cf-ipcountry': 'FR' })
    ).toEqual({ client: 'claude', userAgent: 'Claude-User', country: 'FR' });
  });

  it('tronque un user-agent trop long', () => {
    const ctx = buildClientContext({ 'user-agent': 'x'.repeat(500) });
    expect(ctx.userAgent).toHaveLength(120);
  });

  it('omet le pays inconnu de Cloudflare', () => {
    expect(buildClientContext({ 'cf-ipcountry': 'XX' })).toEqual({ client: 'unknown' });
  });

  it("n'expose jamais l'IP", () => {
    const ctx = buildClientContext({ 'cf-connecting-ip': '1.2.3.4', 'user-agent': 'node' });
    expect(JSON.stringify(ctx)).not.toContain('1.2.3.4');
  });
});
