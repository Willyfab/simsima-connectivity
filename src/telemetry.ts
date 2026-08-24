export interface CaptureClient {
  capture(args: { distinctId: string; event: string; properties?: Record<string, unknown> }): void;
  shutdown(): Promise<void>;
}

export interface Telemetry {
  /**
   * `event` par défaut : `mcp_tool_call`. Le lien d'achat émet en plus son
   * propre événement — c'est la conversion du canal, elle doit être lisible
   * sans filtrer un événement fourre-tout.
   */
  capture(props: Record<string, unknown> & { agentSource?: string }, event?: string): void;
  shutdown(): Promise<void>;
}

function resolveClient(opts?: {
  key?: string;
  host?: string;
  client?: CaptureClient;
}): CaptureClient | null {
  if (opts?.client) return opts.client;
  const key = opts?.key ?? process.env.POSTHOG_KEY;
  if (!key) return null;
  // Lazy require so tests/local without posthog-node installed still work.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PostHog } = require('posthog-node');
  const host = opts?.host ?? process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  const posthog = new PostHog(key, { host });
  return {
    capture: (a) => posthog.capture(a),
    shutdown: () => posthog.shutdown(),
  };
}

export function createTelemetry(opts?: {
  key?: string;
  host?: string;
  client?: CaptureClient;
}): Telemetry {
  const client = resolveClient(opts);
  if (!client) {
    return { capture: () => {}, shutdown: async () => {} };
  }
  return {
    capture: (props, event = 'mcp_tool_call') => {
      try {
        const { agentSource, ...rest } = props;
        client.capture({
          distinctId: agentSource ? `agent:${agentSource}` : 'mcp-anonymous',
          event,
          properties: { ...rest, ...(agentSource ? { agentSource } : {}) },
        });
      } catch {
        /* fire-and-forget: telemetry must never break a tool */
      }
    },
    shutdown: async () => {
      try {
        await client.shutdown();
      } catch {
        /* ignore */
      }
    },
  };
}

const PROP_KEYS = ['locale', 'destination', 'sku', 'agentSource', 'tripDays', 'usage'] as const;

/**
 * Propriétés que l'outil ajoute à SON événement d'appel — nombre de résultats,
 * fraîcheur du flux, raison d'un échec. Un seul événement par appel : ces
 * propriétés sont fusionnées, pas émises à part.
 */
export type Track = (props: Record<string, unknown>) => void;

export function withTelemetry<A extends Record<string, unknown>, R>(
  toolName: string,
  telemetry: Telemetry,
  handler: (args: A, track: Track) => Promise<R>
): (args: A) => Promise<R> {
  return async (args: A): Promise<R> => {
    const start = Date.now();
    const picked: Record<string, unknown> = {};
    for (const k of PROP_KEYS) {
      if (args[k] !== undefined) picked[k] = args[k];
    }
    const extra: Record<string, unknown> = {};
    const track: Track = (props) => Object.assign(extra, props);
    try {
      const result = await handler(args, track);
      telemetry.capture({
        ...picked,
        ...extra,
        tool: toolName,
        isError: Boolean((result as { isError?: boolean } | null | undefined)?.isError),
        durationMs: Date.now() - start,
      });
      return result;
    } catch (err) {
      telemetry.capture({
        ...picked,
        ...extra,
        tool: toolName,
        isError: true,
        durationMs: Date.now() - start,
      });
      throw err;
    }
  };
}
