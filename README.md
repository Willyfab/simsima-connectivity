# Simsima — travel eSIM plans in Claude

[![Glama score](https://glama.ai/mcp/servers/Willyfab/simsima-connectivity/badges/score.svg)](https://glama.ai/mcp/servers/Willyfab/simsima-connectivity)

**In Claude:** [connector directory](https://claude.ai/directory/simsima) · **Website:** [simsima.io](https://simsima.io) · **Endpoint:** `https://mcp.simsima.io/mcp` (Streamable HTTP) · **Registry:** `io.github.Willyfab/simsima-connectivity`

Simsima sells prepaid travel eSIMs for about 190 countries, regions and worldwide plans. This
connector lets Claude, or any MCP client, look up that catalog while you plan a trip: which plans
exist for a destination, what they cost, whether a regional plan covers every country on your
route, which local networks it uses, and which plan fits the length of your stay. When you have
picked one, it gives you the link to that plan on simsima.io, where you complete the purchase
yourself.

It works in the 26 languages of simsima.io, with prices in the matching currency. It needs no
account and no login, and it only reads the public catalog.

## Add it to Claude

Simsima is listed in Claude's connector directory: open
[claude.ai/directory/simsima](https://claude.ai/directory/simsima) and connect it. No account and
no authentication are required.

You can also add it by hand: in Claude (web, desktop or mobile), open **Settings › Connectors**,
choose **Add custom connector**, and enter `https://mcp.simsima.io/mcp`.

In Claude Code:

```bash
claude mcp add --transport http simsima https://mcp.simsima.io/mcp
```

## What you can ask

- "I'm spending 10 days in Japan and use maps and social media a lot. Which eSIM should I take?"
- "Does the Europe eSIM work in Switzerland and in the UK?"
- "Compare unlimited plans for Thailand for two weeks, under $30."
- "Which mobile networks does the Simsima eSIM for Brazil use, and can I top it up?"
- "Give me the link to buy the 5 GB, 7-day plan for Italy."

## Tools

All tools are read-only.

| Tool | What it does |
|---|---|
| `list_destinations` | Destinations covered (countries, regions, global), with the entry price and product URL of each. |
| `search_plans` | Plans for a destination, cheapest first, filtered by price, data, validity or unlimited data. |
| `get_plan` | One plan by its sku. |
| `recommend_plan` | Best plan(s) for a trip, given its length in days and light, medium or heavy usage. |
| `check_coverage` | Whether a destination's plan covers a given country (name or ISO code), with the standalone country plan as an alternative. |
| `get_destination_info` | Countries covered, mobile operators, top-up availability and entry price for one destination. |
| `create_checkout_link` | Link to a plan's page on simsima.io, with the plan preselected (given only a destination, the destination's page). No order is placed and no payment is made by the tool: the purchase happens on the website. |

## Data and privacy

The server never receives your conversation, only the parameters Claude passes to a tool. For
each call it records the tool name, the search parameters (destination, plan, trip length, usage
level, language), the type of client read from the HTTP User-Agent (for example "Claude"), and the
country derived from the IP address, in order to measure use of the service. These events go to
PostHog, hosted in the EU. The IP address itself is only used in memory to limit request rates and
is never stored. Links handed out carry `utm_*` parameters naming the client type, so a purchase
can be attributed to the connector.

Full privacy policy: [simsima.io/en/privacy](https://simsima.io/en/privacy) · Terms:
[simsima.io/en/terms](https://simsima.io/en/terms)

## Support

Questions or problems: [support@simsima.io](mailto:support@simsima.io).

---

# For developers

Health check: `GET https://mcp.simsima.io/health`.

## Data source

Reads the public web feed `${SIMSIMA_FEED_BASE}/{locale}/agent/catalog` (cached ~15 min).
Every tool takes a `locale` among the site's 26 languages (default `en`). It sets the language of
product URLs and the currency of prices (USD in English, EUR in French, JPY in Japanese…); destination
slugs are the same in every language, and `check_coverage` reads country names in the user's own
language and script ("Kroatien", "クロアチア").
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
- `RATE_LIMIT_RPM` (default 60) — per calling IP. Relies on `trust proxy`: without it every caller shares the proxy's address and the limit turns into one global ceiling that a single scanner empties.
- `RATE_LIMIT_RPM_ANTHROPIC` (default 1200) — per calling IP inside Anthropic's outbound range `160.79.104.0/21`, where every claude.ai connector call comes from. A handful of those addresses carry the traffic of all Claude users at once; at the ordinary per-caller limit, a few simultaneous conversations would get everyone throttled.
- `POSTHOG_KEY` (optional) — PostHog project API key. When set, the server emits an `mcp_tool_call` event per tool call, carrying `resultCount`, `feedStale` and a named `failureReason` when a call comes back empty, plus a dedicated `mcp_checkout_link` event when a checkout link is handed out. Absent → telemetry disabled (no-op).

  Each event also carries where the call came from, read once per request from the headers: `client` (`claude` / `openai` / `cursor` / `vscode` / `bot` / `script` / `unknown`), the raw `userAgent`, and `country`. The User-Agent is sent by the MCP client rather than written by the model, which makes it the one origin signal a caller does not pick for itself. It is also what the checkout link is attributed to (`source=agent:<client>`, `utm_source=<client>`) and what PostHog's `distinct_id` is built from (`mcp:<client>`). An earlier `agentSource` argument, filled in by the model from the conversation, has been removed: it carried conversation fragments and identified nobody. The caller's IP is resolved as well (`CF-Connecting-IP`, then `X-Forwarded-For`, then `req.ip`) and is used **only** to meter requests; it never reaches PostHog.
- `POSTHOG_HOST` (optional, default `https://eu.i.posthog.com`) — PostHog ingestion host (match the web app).

## Local dev

```bash
cd mcp
npm install
npm test          # jest
npm run dev       # ts-node-dev on :8080
curl localhost:8080/health
```

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
