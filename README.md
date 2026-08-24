# simsima-connectivity — MCP server

[![Glama score](https://glama.ai/mcp/servers/Willyfab/simsima-connectivity/badges/score.svg)](https://glama.ai/mcp/servers/Willyfab/simsima-connectivity)

**Website:** [simsima.io](https://simsima.io) · **Endpoint:** `POST https://mcp.simsima.io/mcp` (Streamable HTTP) · **Registry:** `io.github.Willyfab/simsima-connectivity`

Public MCP server exposing [Simsima](https://simsima.io)'s travel eSIM catalog to AI agents.
Endpoint: `POST https://mcp.simsima.io/mcp` (Streamable HTTP). Health: `GET /health`.

## Tools

- `list_destinations` — countries/regions covered, with min price + product URL.
- `search_plans` — plans for a destination, with optional price/data/validity filters.
- `get_plan` — a single plan by sku.
- `recommend_plan` — best plan(s) for a trip (length + light/medium/heavy usage).
- `create_checkout_link` — a Simsima product URL with agent attribution (`source`/`utm_*`), the plan already preselected.
- `check_coverage` — does this destination cover this country? Takes a country name or an ISO code, and hands back the standalone country plan whether the answer is yes or no.
- `get_destination_info` — coverage, mobile operators, top-up availability and entry price for one destination.

Read + attributed-link only. No payment, no order data, no auth.

## Data source

Reads the public web feed `${SIMSIMA_FEED_BASE}/{locale}/agent/catalog` (cached ~15 min).
Product URLs come straight from the feed → always valid (zero 404). No database, no backend calls.

That feed is built from Simsima's sellable catalog — the same source the website and the Google
Shopping feed read. So what this server answers is what the site actually sells: one plan per
(destination, data, duration), unlimited plans resolved through the site's fair-use cascade, and
the checkout price floor already applied.

Coverage and mobile operators travel in the feed's `destinations` block, once per destination
rather than on every plan (the Europe zone alone carries ~40 country codes). Operators are listed
for single-country destinations only: on a zone, forty countries' networks mixed together would
say nothing useful.

## Env

- `SIMSIMA_FEED_BASE` (default `https://simsima.io`)
- `PORT` (default 8080)
- `RATE_LIMIT_RPM` (default 60)
- `POSTHOG_KEY` (optional) — PostHog project API key. When set, the server emits an `mcp_tool_call` event per tool call, carrying `resultCount`, `feedStale` and a named `failureReason` when a call comes back empty, plus a dedicated `mcp_checkout_link` event when a checkout link is handed out. Absent → telemetry disabled (no-op).
- `POSTHOG_HOST` (optional, default `https://eu.i.posthog.com`) — PostHog ingestion host (match the web app).

## Local dev

```bash
cd mcp
npm install
npm test          # jest (42 tests)
npm run dev       # ts-node-dev on :8080
curl localhost:8080/health
```

## Connect from Claude (private validation — Phase 1a)

Add a custom connector pointing at `https://mcp.simsima.io/mcp`, then try:
"Recommande-moi un eSIM pour 7 jours au Japon en usage moyen."

## Deploy

Coolify app, Docker build context = `mcp/`, subdomain `mcp.simsima.io`. Auto-deploy on push to `main`.
Set `SIMSIMA_FEED_BASE`, `PORT`, `RATE_LIMIT_RPM` env vars.

## Publication to the MCP Registry (Phase 1b)

Metadata lives in [`server.json`](./server.json) (namespace `io.github.Willyfab/simsima-connectivity`,
remote `streamable-http` at `https://mcp.simsima.io/mcp`). Discovery is also hinted from
`web/public/llms.txt` + `llms-full.txt`.

To publish (needs the `mcp-publisher` CLI + GitHub auth as the repo owner):

```bash
cd mcp
# install: see github.com/modelcontextprotocol/registry (release binary or `go install`)
mcp-publisher login github     # OIDC auth for the io.github.Willyfab/* namespace
mcp-publisher publish          # validates server.json and publishes
```

- Bump `version` in `server.json` on each meaningful change and re-run `publish`.
- To use a branded `com.simsima/connectivity` namespace instead, verify domain ownership
  of `simsima.io` via a DNS TXT record, then update `name` in `server.json`
  (the remote URL `mcp.simsima.io` already sits on the verified domain).
