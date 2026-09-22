import express, { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from './server';
import { createFeedClient } from './feed-client';
import { createRateLimiter } from './rate-limit';
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

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/mcp', async (req: Request, res: Response) => {
    const ip = resolveClientIp(req.headers, req.ip || req.socket.remoteAddress);
    if (!allow(ip)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }
    // Stateless: a fresh server + transport per request. C'est aussi ce qui
    // rend le contexte d'origine trivial à injecter — une instance, une requête.
    const server = buildMcpServer({
      feed,
      telemetry: withContext(telemetry, buildClientContext(req.headers)),
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
