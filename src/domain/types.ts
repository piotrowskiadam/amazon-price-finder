export type CurrencyCode = 'PLN' | 'EUR' | 'GBP' | 'SEK';

export type MarketplaceId = 'PL' | 'DE' | 'ES' | 'IT' | 'FR' | 'NL' | 'SE' | 'BE' | 'UK';

export interface Marketplace {
  id: MarketplaceId;
  domain: string;
  countryNamePl: string;
  countryCodeIso: string;
  currency: CurrencyCode;
  currencySymbol: string;
  languageTag: string;
  regionGroup: 'EU' | 'UK';
  defaultShippingToPlEstimate: number;
}

export type ResolvedInput =
  | {
      kind: 'asin';
      asin: string;
      sourceDomain?: string;
      sourceMarketplaceId?: MarketplaceId;
      extractedSlug?: string;
    }
  | {
      kind: 'keyword';
      query: string;
    };

export interface CatalogCandidate {
  asin: string;
  title: string;
  imageUrl: string | null;
  previewPrice: number | null;
  currency: CurrencyCode;
  previewPriceFormatted: string | null;
  rating: string | null;
  reviewCount: string | null;
  productUrl: string;
  marketplaceId: MarketplaceId;
}

export type OfferStatus =
  | 'available'
  | 'out_of_stock'
  | 'captcha_blocked'
  | 'not_found'
  | 'error';

export interface MarketplaceOffer {
  marketplaceId: MarketplaceId;
  domain: string;
  asin: string;
  productUrl: string;
  status: OfferStatus;
  title: string | null;
  imageUrl: string | null;
  currency: CurrencyCode;
  itemPrice: number | null;
  shippingQuote: number | null;
  shippingNote: string | null;
  shipsToPoland: boolean | null;
  sellerName: string | null;
  fetchedAt: string;
  responseTimeMs: number;
  statusMessage?: string;
}

export interface ExchangeRateTable {
  source: 'NBP_API' | 'FALLBACK' | 'CUSTOM';
  tableNumber: string;
  effectiveDate: string;
  fetchedAt: string;
  ratesToPln: Record<CurrencyCode, number>;
}

export interface DeliverySessionConfig {
  postalCode?: string;
  cookieHeader?: string;
  fxSpreadPct?: number;
  customRates?: Partial<Record<CurrencyCode, number>>;
  preferSimulatedWhenBlocked?: boolean;
}

export interface LandedOfferRow extends MarketplaceOffer {
  marketplace: Marketplace;
  baseExchangeRate: number;
  effectiveExchangeRate: number;
  itemPricePln: number | null;
  shippingQuotePln: number | null;
  landedPricePln: number | null;
  hasKnownShipping: boolean;
  deltaFromBestPln: number | null;
  deltaFromBestPct: number | null;
  deltaFromPolandStorePln: number | null;
  isBestLanded: boolean;
  isBestItemPrice: boolean;
}

export interface PriceComparisonReport {
  asin: string;
  canonicalTitle: string;
  canonicalImageUrl: string | null;
  originDomain: string | null;
  queriedAt: string;
  fxSpreadPct: number;
  postalCode: string;
  exchangeRates: ExchangeRateTable;
  bestOffer: LandedOfferRow | null;
  polishOffer: LandedOfferRow | null;
  maxSavingsVsPlStorePln: number | null;
  offers: LandedOfferRow[];
}
