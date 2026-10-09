# Simsima: travel eSIM plans in Claude

This plugin helps Claude plan mobile data for a trip abroad. It connects Claude to Simsima's travel eSIM catalog, which covers more than 190 countries, regions and worldwide plans, and adds a skill that tells Claude how to use it: which details to ask about the trip, how to pick a plan for one country or a multi-country route, how to check coverage, and how to present prices and the link to buy.

It needs no account and no API key.

## Install

In Claude (web, desktop or mobile), add it from the directory. In Claude Code:

```
/plugin install simsima --marketplace Willyfab/simsima-connectivity
```

## What's inside

- **Connector:** the Simsima MCP server at `https://mcp.simsima.io/mcp`, also listed in Claude's connector directory at [claude.ai/directory/simsima](https://claude.ai/directory/simsima). Its seven tools are read-only: `list_destinations`, `search_plans`, `get_plan`, `recommend_plan`, `check_coverage`, `get_destination_info` and `create_checkout_link`.
- **Skill `trip-connectivity`:** used when you ask how to get mobile data on a trip, which eSIM to take, how much data you need, or whether a regional plan covers your route.

## Example requests

- "I'm spending 10 days in Japan and use maps and social media a lot. Which eSIM should I take?"
- "Two weeks across France, Switzerland and Croatia: is one Europe plan enough?"
- "Unlimited data in Thailand for 7 days, under $30?"

## Data and privacy

The plugin itself runs no code, stores nothing and sends nothing anywhere. All requests go to the Simsima MCP server above. That server never receives your conversation, only the parameters Claude passes to a tool (destination, plan, trip length, usage level, language). For each call it records the tool name, those parameters, the type of client (for example "Claude") and the country derived from the IP address, in PostHog hosted in the EU, to measure use of the service; the IP address is not stored. Links to simsima.io carry `utm_*` parameters naming the client type. No purchase is ever made by the plugin: you buy on simsima.io if you choose to.

Privacy policy: [simsima.io/en/privacy](https://simsima.io/en/privacy) · Terms: [simsima.io/en/terms](https://simsima.io/en/terms) · Support: [support@simsima.io](mailto:support@simsima.io)

## License

MIT, see [LICENSE](LICENSE).
