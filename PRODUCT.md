# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Node.js + TypeScript full-stack web application (Hono/Express HTTP server + Cheerio/Undici concurrent marketplace scraper + NBP FX provider + modern responsive TypeScript/HTML/CSS frontend) running locally.

## Users

Polish cross-border e-commerce shoppers, collectors (physical media such as Blu-ray/4K UHD films, books, electronics, hardware), and deal hunters who buy from European and UK Amazon storefronts (`amazon.pl`, `amazon.de`, `amazon.es`, `amazon.it`, `amazon.fr`, `amazon.nl`, `amazon.se`, `amazon.com.be`, `amazon.co.uk`) and want to compare the real landed price in PLN (`zł`) including delivery to Poland.

## Product Purpose

Eliminate the tedious tab-by-tab manual checking of 9 European Amazon storefronts and mental currency/shipping conversion. Given either a direct Amazon product URL (e.g. `https://www.amazon.pl/Carrie-Sissy-Spacek/dp/B0791VZ99Y`), a raw 10-character ASIN, or a keyword query (which returns up to 20 disambiguation candidates so the user can pick the exact edition), the product fetches prices and shipping quotes across EU & UK Amazon stores and presents a clear, sortable comparison table in both native currency and PLN.

## Positioning

Unlike static price trackers locked to a single country or paid API wrappers requiring commercial subscriptions, Amazon Price Finder resolves any ASIN across 9 EU/UK Amazon storefronts in parallel, pairs live NBP Table A exchange rates (with custom rate override / payment-card spread calculator), and supports optional postal-code/cookie delivery session context plus instant manual-check deep links and price simulation when a storefront withholds cross-border shipping behind login.

## Operating Context

Used on desktop or mobile browsers while shopping on `amazon.pl` or other European Amazon sites. The user pastes a product URL or searches by keyword, selects the target item if searching by keyword, inspects the ranked comparison table across PL, DE, ES, IT, FR, NL, SE, BE, and UK, checks native vs PLN prices and shipping costs, and clicks directly through to the winning Amazon storefront to purchase.

## Capabilities and Constraints

- **Input resolution**: Accepts full Amazon product URLs from any regional domain (extracting the 10-char `ASIN` via `/dp/`, `/gp/product/`, etc.), raw ASINs, or keyword queries.
- **Keyword disambiguation**: Keyword searches query the primary marketplace (default `amazon.pl`, switchable to `amazon.de` / `amazon.co.uk`) and display up to 20 `CatalogCandidate` results with thumbnail, title, ASIN badge, and preview price so the user clicks the exact item to trigger the cross-border comparison.
- **Multi-marketplace comparison**: Queries 9 storefronts (`amazon.pl`, `amazon.de`, `amazon.es`, `amazon.it`, `amazon.fr`, `amazon.nl`, `amazon.se`, `amazon.com.be`, `amazon.co.uk`) in parallel with browser-grade headers, locale cookies, and resilient multi-selector HTML parsing (`cheerio`).
- **Currency conversion**: Fetches live official mid-market rates (`EUR`, `GBP`, `SEK` → `PLN`) from the public NBP Web API (`api.nbp.pl`), displays the active table number and date, and allows optional FX spread adjustment (e.g. Revolut 0%, bank card +2%, Amazon Currency Converter +3.5%) or custom manual rates.
- **Shipping & Anti-Bot resilience**: Extracts shipping quotes from Amazon's delivery block (`#mir-layout-DELIVERY_BLOCK`, `data-csa-c-delivery-price`, `#deliveryBlockMessage`). Supports optional Polish postal code / session cookie configuration, and allows interactive inline shipping/price override in the comparison table if Amazon serves a CAPTCHA or requires login for cross-border shipping to Poland.

## Product Principles

1. **Landed PLN Truth First**: A low shelf price in EUR or GBP can be wiped out by cross-border postage; rank by total landed cost in PLN whenever delivery is known, and clearly separate shelf price from shipping.
2. **Disambiguate Before Fan-Out**: Keyword search across 9 stores simultaneously produces mismatched editions; resolve keywords to one canonical ASIN first via a visual 20-item picker, then fan out by ASIN.
3. **Resilient Transparency Over Silent Failure**: When an Amazon domain rate-limits, blocks automated scraping, or hides cross-border shipping behind login, show the exact status, provide a one-click direct `/dp/{ASIN}` link, and let the user type a manual price/shipping value inline to complete their calculation.
4. **Zero-Friction Local Operation**: Works out of the box locally without requiring paid third-party API keys, while offering power-user hooks (custom cookies, postal code, FX spread) when needed.
