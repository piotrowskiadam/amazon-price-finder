# Amazon Price Finder

Cross-border European & UK Amazon price comparison domain for Polish buyers, normalizing item prices and shipping costs into PLN (`zł`) to identify the lowest landed total.

## Language

### Core Catalog & Identity

**ASIN**:
Amazon Standard Identification Number — a 10-character alphanumeric product identifier (`B0...` or 10-digit ISBN) shared across European Amazon marketplaces for the same catalog item.
_Avoid_: ProductId, SKU, ItemCode

**Marketplace**:
A specific country-level Amazon storefront (`amazon.pl`, `amazon.de`, `amazon.es`, `amazon.it`, `amazon.fr`, `amazon.nl`, `amazon.se`, `amazon.com.be`, `amazon.co.uk`) with its own domain, native currency, and locale.
_Avoid_: Store, Shop, Region, Site

**CatalogCandidate**:
A lightweight product entry returned from a keyword search (containing ASIN, title, thumbnail URL, preview price, and rating) allowing the user to disambiguate which exact product they want to compare across Europe.
_Avoid_: SearchItem, ProductPreview, Hit

### Pricing & Comparison

**MarketplaceOffer**:
The resolved availability, item price, and delivery quote for a specific ASIN on a single Marketplace at a point in time.
_Avoid_: Listing, Quote, StoreResult

**ItemPrice**:
The shelf price of the product (including VAT as displayed on the Marketplace) in the Marketplace's native currency before delivery charges.
_Avoid_: BasePrice, NetPrice, Cost

**ShippingQuote**:
The estimated cost of delivering the item to the buyer's destination (default: Poland), or `0` when marked as free delivery, or `null` when the seller does not expose shipping without an authenticated address session.
_Avoid_: Postage, DeliveryFee, Freight

**LandedPrice**:
The sum of `ItemPrice` and `ShippingQuote` converted into `PLN` using the active `ExchangeRateTable`, representing the true total out-of-pocket cost for a Polish buyer.
_Avoid_: TotalCost, FinalPrice, GrandTotal

**ExchangeRateTable**:
A snapshot of mid-market foreign exchange rates (`EUR`, `GBP`, `SEK` → `PLN`) sourced from Narodowy Bank Polski (NBP Table A) with a known effective date and fallback resilience.
_Avoid_: CurrencyMap, FxRates, ForexCache

**PriceComparisonReport**:
The aggregated result for a single ASIN across all queried Marketplaces, ranked by `LandedPrice` (or `ItemPrice` in PLN when shipping is unknown), highlighting the best deal and potential savings vs `amazon.pl`.
_Avoid_: ComparisonMatrix, ResultTable

**DeliverySessionConfig**:
Optional user-supplied context (Polish postal code e.g. `00-001` and/or Amazon session cookies) forwarded to Marketplaces to improve the accuracy of cross-border `ShippingQuote` detection.
_Avoid_: AuthConfig, UserSettings
