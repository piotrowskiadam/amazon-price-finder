---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: ["public/styles.css","public/app.js"]
---

# Surface Brief: Amazon Price Finder (EU & UK)

## Scope & Mode
- **Surface**: `public/index.html` (`public/styles.css`, `public/app.js`)
- **Mode**: `operate`

## Audience & Task
Polish cross-border buyers comparing a specific product across 9 European and UK Amazon storefronts (`PL`, `DE`, `ES`, `IT`, `FR`, `NL`, `SE`, `BE`, `UK`) by pasting an `amazon.pl` URL, entering an `ASIN`, or searching by keyword (picking from up to 20 candidates), then inspecting native price, cross-border shipping to Poland, and landed `PLN` cost using live NBP exchange rates.

## Direction contract

THESIS: A cross-border European freight and currency dispatch ledger that treats Amazon price comparison as precision arbitrage—refusing generic e-commerce card grids and bloated SaaS hero banners in favor of an exposed-hairline tabular manifest where shelf price, shipping to Poland, and NBP FX conversion lock together in one scannable sheet.

OWN-WORLD: Cool European customs slate-silver dispatch ground (`#eef2f6`), secondary slate panel (`#dfe6ee`), and crisp white ledger cells (`#ffffff`) framed by exposed carbon-navy hairlines (`#141923` and `rgba(20,25,35,0.16)`), signal vermilion (`#bf4520`) reserved strictly for the primary action and shipping composition bar, clearance forest green (`#1b6b45`) and mint (`#7be0ad`) for the confirmed lowest landed PLN offer, and tabular monospace numerals (`Azeret Mono`) paired with transport-grade grotesk (`Public Sans`). Raised by `crouwel-grid-specimen` (visible cell grid), `rw-timetable-slide-rack` (reversed dark carbon plate for the #1 lowest landed offer), `saville-catalog-sleeve` (prominent ASIN catalog stamp), and `ikeda-datamatics` (inline PLN spread bar).

STORY: The user immediately sees the live NBP currency strip (`EUR`, `GBP`, `SEK` → `PLN` + payment spread selector), enters a product URL (like the `Carrie` Blu-ray `B0791VZ99Y`) or keyword, disambiguates the exact catalog edition if searching by keyword, and reads the ranked 9-country landed-cost table with direct `/dp/{ASIN}` links and inline shipping/price override inputs.

FIRST VIEWPORT: Top utility ledger bar with live NBP Table A exchange rates, FX spread selector (0% Revolut / +2% Bank / +3.5% Amazon FX), and Polish delivery session drawer (`00-001` postal code / optional cookie). Immediately below sits the unified command bar accepting any Amazon URL, ASIN, or keyword, accompanied by one-click presets (`Carrie [B0791VZ99Y]`, hardware, books) and the full-width 9-marketplace comparison table above the fold.

FORM: Continental Rail & Parcel Dispatch Board (candidate #3 of 7 on grounded list; seed key `e5d9b649`).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
