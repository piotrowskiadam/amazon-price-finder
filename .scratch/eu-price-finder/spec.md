# Spec: Amazon Price Finder (EU & UK)

Status: ready-for-agent

## Problem

Polish shoppers buying on Amazon frequently overpay on `amazon.pl` or miss cheaper stock on `amazon.de`, `amazon.es`, `amazon.it`, `amazon.fr`, `amazon.nl`, `amazon.se`, `amazon.com.be`, or `amazon.co.uk`. Comparing a product manually requires opening 9 tabs, extracting the `ASIN`, checking whether each regional store ships to Poland, adding shipping costs, and converting `EUR`, `GBP`, and `SEK` into `PLN`.

## Solution

A full-stack TypeScript web application that:
1. Accepts any Amazon product URL (e.g. `https://www.amazon.pl/Carrie-Sissy-Spacek/dp/B0791VZ99Y`), a raw 10-character `ASIN` (`B0791VZ99Y`), or a keyword search query.
2. When given a keyword query, fetches up to 20 `CatalogCandidate` items from the chosen origin marketplace and presents an interactive disambiguation grid so the user clicks the exact item they want to compare.
3. When given a URL or `ASIN` (or after clicking a `CatalogCandidate`), fans out requests concurrently across all 9 European & UK Amazon marketplaces, extracts `ItemPrice` and `ShippingQuote`, fetches live `PLN` exchange rates from NBP Table A (`api.nbp.pl`), and computes `LandedPrice` in `PLN` (with configurable payment spread e.g. Revolut 0%, Bank card +2%, Amazon Currency Converter +3.5%).
4. Displays a rich comparison table with direct `/dp/{ASIN}` links, native price, PLN price, shipping cost (native & PLN), total landed price in PLN, delta vs best price / vs `amazon.pl`, and inline editable overrides for shipping or price when Amazon requires login to calculate cross-border postage.

## Tickets

- `issues/01-domain-and-deep-modules.md`: Core domain types, ASIN/URL resolver, NBP FX provider, HTML parser & marketplace gateway
- `issues/02-backend-api-and-tests.md`: Hono/Node API server, concurrent comparison orchestrator, unit/integration test suite
- `issues/03-frontend-ui-and-diagram.md`: Impeccable-designed web UI + architectural diagram (`docs/diagrams/architecture.html`)
