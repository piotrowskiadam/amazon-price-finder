# AGENTS.md

Instructions and project conventions for coding agents working in **Amazon Price Finder (EU & UK)**.

## Architecture & Engineering Principles (`codebase-design`)

- Design **deep modules**: hide substantial behaviour (multi-marketplace concurrent scraping, anti-bot fallback parsing, shipping extraction, NBP currency normalization, ASIN extraction) behind small, clear interfaces at clean seams.
- Use the canonical terms from `GLOSSARY.md` across types, functions, routes, and tests.
- Accept dependencies at seams (e.g. `MarketplaceGateway`, `ExchangeRateProvider`) so every module is testable without live network calls when running unit/integration suites, while supporting live scraping in production.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five canonical triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` at the repo root and ADRs in `docs/adr/`). See `docs/agents/domain.md`.
