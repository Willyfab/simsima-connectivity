import type { FeedItem } from '../types';

const AGENT_SOURCE_RE = /^[a-z0-9:_-]{1,40}$/;

export function buildCheckoutLink(item: FeedItem, agentSource: string): string {
  const source = AGENT_SOURCE_RE.test(agentSource) ? agentSource : 'unknown';
  const url = new URL(item.url);
  url.searchParams.set('source', `agent:${source}`);
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'mcp');
  url.searchParams.set('utm_campaign', 'agent-commerce');
  return url.toString();
}
