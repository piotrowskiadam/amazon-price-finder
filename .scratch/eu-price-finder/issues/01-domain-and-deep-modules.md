# 01: Core Domain & Deep Modules

Status: ready-for-agent
Type: task

## Scope

Implement the deep modules defined in `GLOSSARY.md` and `ADR-0002`:
- `InputResolver`: parses any Amazon URL or raw string into `{ kind: 'asin', asin, sourceDomain? } | { kind: 'keyword', query }`.
- `ExchangeRateProvider`: fetches live `EUR`, `GBP`, `SEK` → `PLN` rates from NBP API (`https://api.nbp.pl/api/exchangerates/tables/A/?format=json`) with caching, spread calculation, and fallback rates.
- `MarketplaceParser` & `MarketplaceGateway`: parses Amazon product pages (`/dp/{ASIN}`) and search result pages (`/s?k=`) across `PL`, `DE`, `ES`, `IT`, `FR`, `NL`, `SE`, `BE`, `UK`, extracting title, image, `ItemPrice`, `ShippingQuote`, availability, and bot-block state.
