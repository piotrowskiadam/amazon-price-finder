import { MARKETPLACE_BY_ID } from '../domain/marketplaces.js';
import type {
  DeliverySessionConfig,
  LandedOfferRow,
  MarketplaceId,
  PriceComparisonReport,
} from '../domain/types.js';
import type { ExchangeRateProvider } from './exchange-rate-provider.js';
import type {
  MarketplaceGateway,
  MarketplaceScrapeProgressEvent,
} from './marketplace-gateway.js';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export class PriceComparisonOrchestrator {
  private readonly gateway: MarketplaceGateway;
  private readonly exchangeRateProvider: ExchangeRateProvider;

  constructor(deps: {
    gateway: MarketplaceGateway;
    exchangeRateProvider: ExchangeRateProvider;
  }) {
    this.gateway = deps.gateway;
    this.exchangeRateProvider = deps.exchangeRateProvider;
  }

  async compareByAsin(
    rawAsin: string,
    options?: {
      config?: DeliverySessionConfig;
      originDomain?: string;
      titleHint?: string;
      imageHint?: string;
      onProgress?: (event: MarketplaceScrapeProgressEvent) => void;
    },
  ): Promise<PriceComparisonReport> {
    const asin = rawAsin.trim().toUpperCase();
    const config = options?.config;
    const fxSpreadPct =
      typeof config?.fxSpreadPct === 'number' && Number.isFinite(config.fxSpreadPct)
        ? Math.max(0, Math.min(15, config.fxSpreadPct))
        : 0;
    const postalCode = config?.postalCode?.trim() || '00-001';

    const [rawOffers, exchangeRates] = await Promise.all([
      this.gateway.fetchOffersAcrossEurope(
        asin,
        config,
        options?.titleHint,
        options?.imageHint,
        options?.onProgress,
      ),
      this.exchangeRateProvider.getExchangeRates(config?.customRates),
    ]);

    const canonicalTitle =
      rawOffers.find((o) => o.marketplaceId === 'PL' && o.title)?.title ||
      rawOffers.find((o) => o.title)?.title ||
      options?.titleHint ||
      `Produkt Amazon (${asin})`;

    const canonicalImageUrl =
      rawOffers.find((o) => o.marketplaceId === 'PL' && o.imageUrl)?.imageUrl ||
      rawOffers.find((o) => o.imageUrl)?.imageUrl ||
      options?.imageHint ||
      null;

    // 1. Convert each offer into LandedOfferRow
    const preliminaryRows: LandedOfferRow[] = rawOffers.map((offer) => {
      const marketplace = MARKETPLACE_BY_ID[offer.marketplaceId];
      const baseRate = exchangeRates.ratesToPln[offer.currency] ?? 1.0;
      const spreadMultiplier = offer.currency === 'PLN' ? 1.0 : 1 + fxSpreadPct / 100;
      const effectiveExchangeRate = Number((baseRate * spreadMultiplier).toFixed(4));

      const itemPricePln =
        offer.itemPrice !== null ? roundMoney(offer.itemPrice * effectiveExchangeRate) : null;

      const hasKnownShipping =
        offer.shippingQuote !== null && offer.shipsToPoland !== false;

      const shippingQuotePln =
        hasKnownShipping && offer.shippingQuote !== null
          ? roundMoney(offer.shippingQuote * effectiveExchangeRate)
          : null;

      const landedPricePln =
        itemPricePln !== null && offer.shipsToPoland !== false
          ? roundMoney(itemPricePln + (shippingQuotePln ?? 0))
          : null;

      return {
        ...offer,
        marketplace,
        baseExchangeRate: baseRate,
        effectiveExchangeRate,
        itemPricePln,
        shippingQuotePln,
        landedPricePln,
        hasKnownShipping,
        deltaFromBestPln: null,
        deltaFromBestPct: null,
        deltaFromPolandStorePln: null,
        isBestLanded: false,
        isBestItemPrice: false,
      };
    });

    // 2. Identify best LandedPrice and best ItemPrice
    const purchasableRows = preliminaryRows.filter(
      (r) => r.status === 'available' && r.landedPricePln !== null,
    );

    const minLandedPln =
      purchasableRows.length > 0
        ? Math.min(...purchasableRows.map((r) => r.landedPricePln!))
        : null;

    const minItemPln =
      purchasableRows.length > 0
        ? Math.min(...purchasableRows.map((r) => r.itemPricePln!))
        : null;

    const polandRow = preliminaryRows.find((r) => r.marketplaceId === 'PL') ?? null;
    const polandLandedPln = polandRow?.landedPricePln ?? null;

    let bestMarked = false;
    let bestItemMarked = false;

    const enrichedRows = preliminaryRows.map((row) => {
      const isBestLanded =
        !bestMarked &&
        minLandedPln !== null &&
        row.landedPricePln !== null &&
        Math.abs(row.landedPricePln - minLandedPln) < 0.005;
      if (isBestLanded) bestMarked = true;

      const isBestItemPrice =
        !bestItemMarked &&
        minItemPln !== null &&
        row.itemPricePln !== null &&
        Math.abs(row.itemPricePln - minItemPln) < 0.005;
      if (isBestItemPrice) bestItemMarked = true;

      const deltaFromBestPln =
        minLandedPln !== null && row.landedPricePln !== null
          ? roundMoney(row.landedPricePln - minLandedPln)
          : null;

      const deltaFromBestPct =
        minLandedPln !== null && minLandedPln > 0 && deltaFromBestPln !== null
          ? roundMoney((deltaFromBestPln / minLandedPln) * 100)
          : null;

      const deltaFromPolandStorePln =
        polandLandedPln !== null && row.landedPricePln !== null
          ? roundMoney(row.landedPricePln - polandLandedPln)
          : null;

      return {
        ...row,
        isBestLanded,
        isBestItemPrice,
        deltaFromBestPln,
        deltaFromBestPct,
        deltaFromPolandStorePln,
      };
    });

    // 3. Sort rows by landedPricePln ascending (available first)
    const sortedOffers = [...enrichedRows].sort((a, b) => {
      if (a.landedPricePln !== null && b.landedPricePln !== null) {
        return a.landedPricePln - b.landedPricePln;
      }
      if (a.landedPricePln !== null) return -1;
      if (b.landedPricePln !== null) return 1;
      return a.marketplace.countryNamePl.localeCompare(b.marketplace.countryNamePl, 'pl');
    });

    const bestOffer = sortedOffers.find((r) => r.isBestLanded) ?? null;
    const polishOffer = sortedOffers.find((r) => r.marketplaceId === 'PL') ?? null;

    const maxSavingsVsPlStorePln =
      bestOffer?.landedPricePln !== null &&
      bestOffer?.landedPricePln !== undefined &&
      polishOffer?.landedPricePln !== null &&
      polishOffer?.landedPricePln !== undefined &&
      polishOffer.landedPricePln > bestOffer.landedPricePln
        ? roundMoney(polishOffer.landedPricePln - bestOffer.landedPricePln)
        : 0;

    return {
      asin,
      canonicalTitle,
      canonicalImageUrl,
      originDomain: options?.originDomain ?? null,
      queriedAt: new Date().toISOString(),
      fxSpreadPct,
      postalCode,
      exchangeRates,
      bestOffer,
      polishOffer,
      maxSavingsVsPlStorePln,
      offers: sortedOffers,
    };
  }

  async searchCandidates(
    query: string,
    marketplaceId: MarketplaceId = 'PL',
    config?: DeliverySessionConfig,
  ) {
    return this.gateway.searchCatalogCandidates(query, marketplaceId, config);
  }
}
