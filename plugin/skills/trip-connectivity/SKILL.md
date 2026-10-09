---
name: trip-connectivity
description: Plan mobile data for a trip abroad with Simsima travel eSIMs. Use when the user asks how to get internet or mobile data while travelling, which eSIM to buy for a destination or a multi-country route, how much data they need, or whether a regional plan covers the countries they will visit.
---

# Plan mobile data for a trip

The Simsima connector gives you live data from Simsima's travel eSIM catalog: destinations, plans, prices, country coverage, local networks and links to each plan's page on simsima.io. Use it so that prices and coverage in your answer come from the catalog, not from memory.

## Gather the trip details

Before recommending anything, make sure you know:

- every country on the route, including stopovers longer than a few hours;
- the length of the stay, in days;
- how the user will use data: light (messaging, email, maps now and then; about 0.3 GB a day), medium (maps, social media, some photos; about 0.7 GB a day) or heavy (video, video calls, hotspot for a laptop; about 1.5 GB a day). These are the estimates `recommend_plan` uses, so quote the same ones;
- the user's language, so that pages and prices come back in that language and its currency.

Ask only for what is missing, in one short question.

## Find the right plan

1. **One country:** call `recommend_plan` with the destination, the number of days and the usage level. It returns the plan that covers the estimated data at the lowest price, the cheapest plan for that length, and an unlimited option when there is one. Use `search_plans` instead when the user sets their own constraints, such as a budget, a minimum amount of data or unlimited data only.
2. **Several countries:** look for a regional plan first (`list_destinations` shows Europe, Asia, Latin America, the Middle East, worldwide and other zones), then call `check_coverage` for each country on the route. If a country is not covered, the answer includes the standalone plan for that country; compare one regional plan plus that country against separate country plans.
3. **Practical questions:** `get_destination_info` gives the local mobile networks a plan uses and whether it can be topped up. A plan that can be topped up lets the user start small on a long stay.

Destinations can be passed as a country name, a two-letter ISO code ("JP"), a zone name or a name in the user's language.

## Present the recommendation

- Give one recommendation first, with its data allowance, validity, price and the reason it fits, then at most one or two alternatives.
- Quote prices exactly as the tools return them, with their currency. Do not convert them or round them.
- Say plainly when the trip is longer than any plan, or when no plan covers a country on the route.
- When the user has chosen, call `create_checkout_link` with the plan's `sku` and give them the link. The purchase happens on simsima.io: the connector never places an order or takes a payment.

## Before the user buys

Remind the user, briefly and only when relevant:

- their phone must support eSIM and be carrier-unlocked; the list of compatible phones is at https://simsima.io/en/esim-supported-devices;
- they can install the eSIM before leaving, over Wi-Fi, and switch mobile data to it on arrival; the plan page explains when its validity starts;
- how installation works step by step: https://simsima.io/en/how-it-works.

## What not to do

- Do not invent plans, prices or coverage. If a tool returns an error, follow what the error message says, such as calling `search_plans` to get current plan identifiers.
- Do not push a purchase. If the user only wants to compare options, compare them and stop there.
