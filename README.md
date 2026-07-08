# simsima-connectivity — MCP server

Public MCP server exposing Simsima's travel eSIM catalog to AI agents.
Endpoint: `POST https://mcp.simsima.io/mcp` (Streamable HTTP). Health: `GET /health`.

## Tools

- `list_destinations` — countries/regions covered, with min price + product URL.
- `search_plans` — plans for a destination, with optional price/data/validity filters.
- `get_plan` — a single plan by sku.
- `recommend_plan` — best plan(s) for a trip (length + light/medium/heavy usage).
- `create_checkout_link` — a Simsima product URL with agent attribution (`source`/`utm_*`).

Read + attributed-link only. No payment, no order data, no auth.

## Data source

Reads the public web feed `${SIMSIMA_FEED_BASE}/{locale}/agent/catalog` (cached ~15 min).
Product URLs come straight from the feed → always valid (zero 404). No database, no backend calls.
Phase 1 covers country plans in `en`/`fr` (regional/global inherit from the feed later).

## Env

- `SIMSIMA_FEED_BASE` (default `https://simsima.io`)
- `PORT` (default 8080)
- `RATE_LIMIT_RPM` (default 60)
- `POSTHOG_KEY` (optional) — PostHog project API key. When set, the server emits an `mcp_tool_call` event per tool call. Absent → telemetry disabled (no-op).
- `POSTHOG_HOST` (optional, default `https://us.i.posthog.com`) — PostHog ingestion host (match the web app).

## Local dev

```bash
cd mcp
npm install
npm test          # jest (25 tests)
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
