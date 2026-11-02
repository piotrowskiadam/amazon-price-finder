# 02: Backend API & Automated Tests

Status: ready-for-agent
Type: task
Blocked by: 01

## Scope

- Implement `PriceComparisonOrchestrator` combining `MarketplaceGateway` and `ExchangeRateProvider` into a ranked `PriceComparisonReport`.
- Expose REST endpoints (`/api/resolve`, `/api/search`, `/api/compare/:asin`, `/api/rates`, `/api/demo/:asin`) via a TypeScript HTTP server.
- Write comprehensive unit & integration tests verifying ASIN extraction, multi-locale price/shipping parsing (`19,99 €`, `£14.99`, `89,99 zł`, `199,00 kr`), NBP conversion, and comparison ranking.
