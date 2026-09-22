/**
 * Qui appelle réellement le serveur.
 *
 * `agentSource` ne répond pas à cette question : c'est une chaîne libre que le
 * LLM appelant invente pour remplir un champ obligatoire. Mesuré sur 60 jours,
 * 58 des 59 valeurs n'apparaissent qu'un seul jour, et le même appelant écrit
 * tantôt `feature article` tantôt `feature-article` — c'est du contexte de
 * conversation, jamais une identité.
 *
 * Le User-Agent HTTP, lui, est émis par le client MCP et pas par le modèle :
 * c'est le seul signal d'origine que l'appelant ne choisit pas.
 */

/** Familles de clients. `bot` couvre les sondes d'annuaires MCP, qui dominent le trafic. */
export type ClientFamily =
  | 'claude'
  | 'openai'
  | 'cursor'
  | 'vscode'
  | 'bot'
  | 'script'
  | 'unknown';

const RULES: ReadonlyArray<[RegExp, ClientFamily]> = [
  [/claude|anthropic/i, 'claude'],
  [/openai|chatgpt/i, 'openai'],
  [/cursor/i, 'cursor'],
  [/vscode|visual studio code/i, 'vscode'],
  // Avant `script` : ces sondes s'annoncent, et beaucoup n'appellent jamais
  // d'outil (« liveness-only, never invokes »). Les confondre avec du trafic
  // applicatif fausserait toute lecture du canal.
  [/bot\b|\bprobe|monitor|scanner|crawler|watch|beat|collector|verifier|scoring|liveness|health/i, 'bot'],
  [/go-http-client|python|httpx|aiohttp|curl|wget|node|undici|axios|okhttp|java/i, 'script'],
];

export function classifyClient(userAgent: string | undefined): ClientFamily {
  if (!userAgent) return 'unknown';
  for (const [re, family] of RULES) {
    if (re.test(userAgent)) return family;
  }
  return 'unknown';
}

/**
 * IP réelle de l'appelant.
 *
 * Sans ça, `req.ip` derrière Traefik renvoie l'IP du proxy — la même pour tout
 * le monde — et le compteur de débit devient un plafond global : un scan suffit
 * alors à renvoyer des 429 à un vrai client. `CF-Connecting-IP` est posé par
 * Cloudflare et n'est pas falsifiable depuis l'extérieur de l'edge.
 */
export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  fallback?: string
): string {
  const cf = headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const fwd = headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  if (first) return first;
  return fallback || 'unknown';
}

/**
 * Propriétés d'origine jointes à chaque événement. Étend `Record` parce que ce
 * contexte n'existe que pour être étalé dans les propriétés d'un événement.
 */
export interface ClientContext extends Record<string, unknown> {
  client: ClientFamily;
  /** Tronqué : au-delà, c'est du bruit dans PostHog. */
  userAgent?: string;
  /** `CF-IPCountry`. Deux lettres, ou absent hors Cloudflare. */
  country?: string;
}

const UA_MAX = 120;

/**
 * L'IP n'entre délibérément pas dans le contexte : elle sert au débit, pas à la
 * mesure. Le pays suffit à l'analyse et évite d'envoyer une donnée personnelle
 * à PostHog.
 */
export function buildClientContext(
  headers: Record<string, string | string[] | undefined>
): ClientContext {
  const raw = headers['user-agent'];
  const ua = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  const rawCountry = headers['cf-ipcountry'];
  const country = (Array.isArray(rawCountry) ? rawCountry[0] : rawCountry)?.trim();
  return {
    client: classifyClient(ua),
    ...(ua ? { userAgent: ua.slice(0, UA_MAX) } : {}),
    ...(country && country !== 'XX' ? { country } : {}),
  };
}
