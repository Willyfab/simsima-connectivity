import path from 'path';
import express, { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from './server';
import { createFeedClient } from './feed-client';
import { createRateLimiter, isAnthropicEgress } from './rate-limit';
import { createTelemetry, withContext } from './telemetry';
import { buildClientContext, resolveClientIp } from './lib/client-context';

// One telemetry instance for the process (no-op unless POSTHOG_KEY is set).
export const telemetry = createTelemetry();

export function createApp(): Express {
  const app = express();
  // Derrière Traefik puis Cloudflare : sans ça `req.ip` est l'IP du proxy, la
  // même pour tous les appelants, et le compteur de débit ci-dessous devient un
  // plafond global que le premier scan venu épuise.
  app.set('trust proxy', true);
  app.use(express.json());

  const feed = createFeedClient();
  const rpm = Number(process.env.RATE_LIMIT_RPM) || 60;
  const allow = createRateLimiter({ rpm });
  const allowAnthropic = createRateLimiter({
    rpm: Number(process.env.RATE_LIMIT_RPM_ANTHROPIC) || 1200,
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Claude affiche le favicon de l'URL du serveur à côté du connecteur, dans
  // l'annuaire comme dans les conversations : sans lui, pas de logo. La page
  // racine le déclare et dit où trouver la doc à qui ouvre l'URL à la main.
  const publicDir = path.join(__dirname, '..', 'public');
  const day = 24 * 60 * 60 * 1000;
  app.get('/favicon.ico', (_req, res) => res.sendFile('favicon.ico', { root: publicDir, maxAge: day }));
  app.get('/icon.png', (_req, res) => res.sendFile('icon.png', { root: publicDir, maxAge: day }));
  app.get('/', (_req, res) =>
    res.type('html').send(
      '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
        '<title>Simsima MCP server</title>' +
        '<link rel="icon" href="/favicon.ico" sizes="any">' +
        '<link rel="icon" type="image/png" sizes="512x512" href="/icon.png">' +
        '<link rel="apple-touch-icon" href="/icon.png">' +
        '</head><body><p>Simsima travel eSIM catalog for AI assistants. MCP endpoint: ' +
        '<code>POST https://mcp.simsima.io/mcp</code>. Documentation: ' +
        '<a href="https://github.com/Willyfab/simsima-connectivity#readme">github.com/Willyfab/simsima-connectivity</a>. ' +
        '<a href="https://simsima.io">simsima.io</a></p></body></html>'
    )
  );

  app.post('/mcp', async (req: Request, res: Response) => {
    const ip = resolveClientIp(req.headers, req.ip || req.socket.remoteAddress);
    const limiter = isAnthropicEgress(ip) ? allowAnthropic : allow;
    if (!limiter(ip)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    // Stateless: a fresh server + transport per request. C'est aussi ce qui
    // rend le contexte d'origine trivial à injecter — une instance, une requête.
    const context = buildClientContext(req.headers);
    const server = buildMcpServer({
      feed,
      telemetry: withContext(telemetry, context),
      client: context.client,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  return app;
}

/* istanbul ignore next */
if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      telemetry.shutdown().finally(() => process.exit(0));
    });
  }
  createApp().listen(port, () => console.log(`mcp server on :${port}`));
}
