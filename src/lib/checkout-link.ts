import type { FeedItem } from '../types';

const AGENT_SOURCE_RE = /^[a-z0-9:_-]{1,40}$/;

/**
 * Lien d'achat attribué.
 *
 * Part de `checkoutUrl` — la page produit AVEC le forfait présélectionné, telle
 * que le flux la construit (contrat partagé avec Google Merchant, voir
 * `web/lib/plan-deeplink.ts`) — et non de l'URL destination nue : sans ça,
 * l'acheteur envoyé par un agent atterrit sur une liste et refait le choix que
 * l'agent venait de faire pour lui. Repli sur `url` si le flux est antérieur au
 * champ.
 *
 * `utm_content` porte le SKU : c'est ce qui permet, côté PostHog, de savoir non
 * seulement qu'un achat vient d'un agent mais s'il porte sur le forfait
 * effectivement recommandé.
 */
export function buildCheckoutLink(item: FeedItem, agentSource: string): string {
  const source = AGENT_SOURCE_RE.test(agentSource) ? agentSource : 'unknown';
  const url = new URL(item.checkoutUrl || item.url);
  url.searchParams.set('source', `agent:${source}`);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'mcp');
  url.searchParams.set('utm_campaign', 'agent-commerce');
  url.searchParams.set('utm_content', item.sku);
  return url.toString();
}
