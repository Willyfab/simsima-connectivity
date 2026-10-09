import type { FeedItem } from '../types';
import type { ClientFamily } from './client-context';

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
 *
 * `utm_source` est la famille du client MCP (`claude`, `openai`…), tirée du
 * User-Agent : le seul signal d'origine que le modèle ne choisit pas.
 */
export function buildCheckoutLink(item: FeedItem, source: ClientFamily): string {
  const url = new URL(item.checkoutUrl || item.url);
  url.searchParams.set('source', `agent:${source}`);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'mcp');
  url.searchParams.set('utm_campaign', 'agent-commerce');
  url.searchParams.set('utm_content', item.sku);
  return url.toString();
}
