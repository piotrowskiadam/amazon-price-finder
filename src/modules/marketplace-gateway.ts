import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildProductUrl,
  buildSearchUrl,
  MARKETPLACE_BY_ID,
  MARKETPLACES,
} from '../domain/marketplaces.js';
import type {
  CatalogCandidate,
  DeliverySessionConfig,
  Marketplace,
  MarketplaceId,
  MarketplaceOffer,
} from '../domain/types.js';
import {
  isCaptchaHtml,
  isDogOrErrorPageHtml,
  parseProductPageHtml,
  parseSearchResultsHtml,
} from './marketplace-parser.js';

const execFileAsync = promisify(execFile);

export type MarketplaceScrapeProgressEvent =
  | {
      type: 'store_start';
      marketplaceId: MarketplaceId;
      domain: string;
      countryNamePl: string;
      completedCount: number;
      totalCount: number;
    }
  | {
      type: 'store_done';
      marketplaceId: MarketplaceId;
      domain: string;
      countryNamePl: string;
      offer: MarketplaceOffer;
      completedCount: number;
      totalCount: number;
    };

export interface MarketplaceGateway {
  fetchOffersAcrossEurope(
    asin: string,
    config?: DeliverySessionConfig,
    titleHint?: string,
    imageHint?: string,
    onProgress?: (event: MarketplaceScrapeProgressEvent) => void,
  ): Promise<MarketplaceOffer[]>;

  searchCatalogCandidates(
    query: string,
    marketplaceId?: MarketplaceId,
    config?: DeliverySessionConfig,
  ): Promise<{
    candidates: CatalogCandidate[];
    source: 'LIVE' | 'REFERENCE_FALLBACK';
    notice?: string;
  }>;
}

const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpMarketplaceGateway implements MarketplaceGateway {
  private readonly customFetchImpl?: typeof fetch;
  private readonly timeoutMs: number;
  private readonly offerCache = new Map<
    string,
    { expiresAt: number; offers: MarketplaceOffer[] }
  >();

  constructor(options?: { fetchImpl?: typeof fetch; timeoutMs?: number }) {
    this.customFetchImpl = options?.fetchImpl;
    this.timeoutMs = options?.timeoutMs ?? 8000;
  }

  private async downloadHtml(
    url: string,
    headers: Record<string, string>,
    cookieJarId?: string,
  ): Promise<{ status: number; html: string }> {
    if (this.customFetchImpl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const response = await this.customFetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const html = await response.text();
      return { status: response.status, html };
    }

    const maxTimeSec = Math.max(4, Math.ceil(this.timeoutMs / 1000));
    const args: string[] = [
      '-s',
      '-L',
      '--compressed',
      '--max-time',
      String(maxTimeSec),
      '-w',
      '\n__HTTP_STATUS__:%{http_code}',
    ];

    if (cookieJarId) {
      const jarPath = `/tmp/euroamazon_jar_${cookieJarId}.cookies`;
      args.push('-c', jarPath, '-b', jarPath);
    }

    for (const [k, v] of Object.entries(headers)) {
      args.push('-H', `${k}: ${v}`);
    }
    args.push(url);

    const { stdout } = await execFileAsync('curl', args, {
      maxBuffer: 20 * 1024 * 1024,
    });

    const markerIdx = stdout.lastIndexOf('\n__HTTP_STATUS__:');
    if (markerIdx !== -1) {
      const html = stdout.slice(0, markerIdx);
      const statusStr = stdout
        .slice(markerIdx + '\n__HTTP_STATUS__:'.length)
        .trim();
      const status = Number.parseInt(statusStr, 10) || 200;
      return { status, html };
    }

    return { status: 200, html: stdout };
  }

  async fetchOffersAcrossEurope(
    asin: string,
    config?: DeliverySessionConfig,
    _titleHint?: string,
    imageHint?: string,
    onProgress?: (event: MarketplaceScrapeProgressEvent) => void,
  ): Promise<MarketplaceOffer[]> {
    const cleanAsin = asin.trim().toUpperCase();
    const cacheKey = `${cleanAsin}|${config?.cookieHeader?.trim() || ''}`;
    const cached = this.offerCache.get(cacheKey);
    const totalCount = MARKETPLACES.length;

    if (cached && cached.expiresAt > Date.now() && !this.customFetchImpl) {
      let completed = 0;
      for (const offer of cached.offers) {
        const market = MARKETPLACE_BY_ID[offer.marketplaceId];
        onProgress?.({
          type: 'store_start',
          marketplaceId: offer.marketplaceId,
          domain: offer.domain,
          countryNamePl: market.countryNamePl,
          completedCount: completed,
          totalCount,
        });
        completed += 1;
        onProgress?.({
          type: 'store_done',
          marketplaceId: offer.marketplaceId,
          domain: offer.domain,
          countryNamePl: market.countryNamePl,
          offer,
          completedCount: completed,
          totalCount,
        });
      }
      return cached.offers;
    }

    // Scrape in paced waves of 2 stores at a time so we do not trigger
    // Amazon CloudFront's 9-request burst limiter (HTTP 503 dog page) on the user's IP.
    const concurrency = this.customFetchImpl ? 9 : 2;
    const results: MarketplaceOffer[] = new Array(totalCount);
    let completedCount = 0;

    for (let i = 0; i < totalCount; i += concurrency) {
      const batch = MARKETPLACES.slice(i, i + concurrency);

      for (const marketplace of batch) {
        onProgress?.({
          type: 'store_start',
          marketplaceId: marketplace.id,
          domain: marketplace.domain,
          countryNamePl: marketplace.countryNamePl,
          completedCount,
          totalCount,
        });
      }

      const batchOffers = await Promise.all(
        batch.map(async (marketplace, batchIdx) => {
          const globalIdx = i + batchIdx;
          const offer = await this.fetchSingleMarketplaceOffer(
            marketplace,
            cleanAsin,
            config,
            globalIdx,
          );
          completedCount += 1;
          onProgress?.({
            type: 'store_done',
            marketplaceId: marketplace.id,
            domain: marketplace.domain,
            countryNamePl: marketplace.countryNamePl,
            offer,
            completedCount,
            totalCount,
          });
          return { globalIdx, offer };
        }),
      );

      for (const { globalIdx, offer } of batchOffers) {
        results[globalIdx] = offer;
      }

      if (!this.customFetchImpl && i + concurrency < totalCount) {
        await delay(140);
      }
    }

    const anyLiveImage =
      results.find((o) => o?.imageUrl)?.imageUrl ?? imageHint ?? null;

    const finalOffers = results.map((o) => ({
      ...o,
      imageUrl: o.imageUrl ?? anyLiveImage,
    }));

    if (!this.customFetchImpl) {
      this.offerCache.set(cacheKey, {
        expiresAt: Date.now() + 60_000,
        offers: finalOffers,
      });
    }

    return finalOffers;
  }

  private async fetchSingleMarketplaceOffer(
    marketplace: Marketplace,
    asin: string,
    config: DeliverySessionConfig | undefined,
    index: number,
  ): Promise<MarketplaceOffer> {
    const productUrl = `${buildProductUrl(marketplace.domain, asin)}?th=1&psc=1`;
    const startedAt = Date.now();

    for (let attempt = 0; attempt < 2; attempt++) {
      const userAgent =
        USER_AGENTS[(index + attempt) % USER_AGENTS.length]!;
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': marketplace.languageTag,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      };

      if (config?.cookieHeader?.trim()) {
        headers.Cookie = config.cookieHeader.trim();
      }

      try {
        const { status, html } = await this.downloadHtml(
          productUrl,
          headers,
          marketplace.id,
        );
        const responseTimeMs = Date.now() - startedAt;

        if (status === 404) {
          return {
            marketplaceId: marketplace.id,
            domain: marketplace.domain,
            asin,
            productUrl,
            status: 'not_found',
            title: null,
            imageUrl: null,
            currency: marketplace.currency,
            itemPrice: null,
            shippingQuote: null,
            shippingNote: 'Brak karty produktu (404) w tym sklepie',
            shipsToPoland: null,
            sellerName: null,
            fetchedAt: new Date().toISOString(),
            responseTimeMs,
            statusMessage: 'Brak w katalogu (HTTP 404)',
          };
        }

        // If Amazon rate-limited with 503/429 or served the temporary dog error page, retry once after 650ms
        if (
          (status === 503 ||
            status === 429 ||
            isDogOrErrorPageHtml(html) ||
            isCaptchaHtml(html)) &&
          attempt === 0 &&
          !this.customFetchImpl
        ) {
          await delay(650);
          continue;
        }

        if (status >= 500) {
          return {
            marketplaceId: marketplace.id,
            domain: marketplace.domain,
            asin,
            productUrl,
            status: 'error',
            title: null,
            imageUrl: null,
            currency: marketplace.currency,
            itemPrice: null,
            shippingQuote: null,
            shippingNote: `Sklep tymczasowo odrzucił zapytanie (HTTP ${status})`,
            shipsToPoland: null,
            sellerName: null,
            fetchedAt: new Date().toISOString(),
            responseTimeMs,
            statusMessage: `Tymczasowy błąd serwera (HTTP ${status})`,
          };
        }

        const parsed = parseProductPageHtml(
          html,
          marketplace,
          asin,
          responseTimeMs,
        );
        return {
          ...parsed,
          productUrl,
        };
      } catch (err) {
        if (attempt === 0 && !this.customFetchImpl) {
          await delay(500);
          continue;
        }
        const responseTimeMs = Date.now() - startedAt;
        const msg = err instanceof Error ? err.message : 'Błąd połączenia';
        return {
          marketplaceId: marketplace.id,
          domain: marketplace.domain,
          asin,
          productUrl,
          status: 'error',
          title: null,
          imageUrl: null,
          currency: marketplace.currency,
          itemPrice: null,
          shippingQuote: null,
          shippingNote: `Nie udało się pobrać strony (${msg})`,
          shipsToPoland: null,
          sellerName: null,
          fetchedAt: new Date().toISOString(),
          responseTimeMs,
          statusMessage: `Błąd sieci: ${msg}`,
        };
      }
    }

    return {
      marketplaceId: marketplace.id,
      domain: marketplace.domain,
      asin,
      productUrl,
      status: 'error',
      title: null,
      imageUrl: null,
      currency: marketplace.currency,
      itemPrice: null,
      shippingQuote: null,
      shippingNote: 'Przekroczono limit prób odczytu',
      shipsToPoland: null,
      sellerName: null,
      fetchedAt: new Date().toISOString(),
      responseTimeMs: Date.now() - startedAt,
      statusMessage: 'Błąd odczytu',
    };
  }

  async searchCatalogCandidates(
    query: string,
    marketplaceId: MarketplaceId = 'PL',
    config?: DeliverySessionConfig,
  ): Promise<{
    candidates: CatalogCandidate[];
    source: 'LIVE' | 'REFERENCE_FALLBACK';
    notice?: string;
  }> {
    const marketplace = MARKETPLACE_BY_ID[marketplaceId] ?? MARKETPLACE_BY_ID.PL;
    const searchUrl = buildSearchUrl(marketplace.domain, query);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const headers: Record<string, string> = {
          'User-Agent': USER_AGENTS[attempt % USER_AGENTS.length]!,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': marketplace.languageTag,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Upgrade-Insecure-Requests': '1',
        };
        if (config?.cookieHeader?.trim()) {
          headers.Cookie = config.cookieHeader.trim();
        }

        const { status, html } = await this.downloadHtml(
          searchUrl,
          headers,
          `search_${marketplace.id}`,
        );
        if (status >= 200 && status < 400) {
          const parsed = parseSearchResultsHtml(html, marketplace.id, 20);
          if (parsed.length > 0) {
            return {
              candidates: parsed.map((c) => ({
                ...c,
                productUrl: `${c.productUrl}?th=1&psc=1`,
              })),
              source: 'LIVE',
            };
          }
        }
        if (attempt === 0 && !this.customFetchImpl) {
          await delay(500);
        }
      } catch {
        if (attempt === 0 && !this.customFetchImpl) {
          await delay(500);
        }
      }
    }

    return {
      candidates: [],
      source: 'LIVE',
      notice: `Nie znaleziono wyników wyszukiwania w sklepie ${marketplace.domain} dla frazy „${query}” lub sklep wymusił weryfikację CAPTCHA.`,
    };
  }
}

// ============================================================================
// Deterministic Test Double ONLY for unit/integration tests (tests/*.test.ts)
// ============================================================================
const TEST_FIXTURE_OFFERS: Record<
  MarketplaceId,
  {
    itemPrice: number;
    shippingQuote: number;
    shippingNote: string;
  }
> = {
  PL: { itemPrice: 74.99, shippingQuote: 0, shippingNote: 'Darmowa dostawa Amazon.pl' },
  DE: { itemPrice: 12.99, shippingQuote: 5.49, shippingNote: 'Wysyłka do Polski: 5,49 €' },
  ES: { itemPrice: 11.49, shippingQuote: 6.99, shippingNote: 'Wysyłka do Polski: 6,99 €' },
  IT: { itemPrice: 12.2, shippingQuote: 7.29, shippingNote: 'Wysyłka do Polski: 7,29 €' },
  FR: { itemPrice: 14.99, shippingQuote: 7.49, shippingNote: 'Wysyłka do Polski: 7,49 €' },
  NL: { itemPrice: 15.49, shippingQuote: 6.49, shippingNote: 'Wysyłka do Polski: 6,49 €' },
  BE: { itemPrice: 15.99, shippingQuote: 7.49, shippingNote: 'Wysyłka do Polski: 7,49 €' },
  SE: { itemPrice: 159.0, shippingQuote: 79.0, shippingNote: 'Wysyłka do Polski: 79,00 kr' },
  UK: { itemPrice: 9.99, shippingQuote: 5.99, shippingNote: 'Wysyłka do Polski: £5.99' },
};

export class FixtureMarketplaceGateway implements MarketplaceGateway {
  async fetchOffersAcrossEurope(
    asin: string,
    _config?: DeliverySessionConfig,
    titleHint?: string,
    imageHint?: string,
    onProgress?: (event: MarketplaceScrapeProgressEvent) => void,
  ): Promise<MarketplaceOffer[]> {
    const upperAsin = asin.toUpperCase();
    const now = new Date().toISOString();
    const totalCount = MARKETPLACES.length;

    return MARKETPLACES.map((m, idx) => {
      const entry = TEST_FIXTURE_OFFERS[m.id];
      const offer: MarketplaceOffer = {
        marketplaceId: m.id,
        domain: m.domain,
        asin: upperAsin,
        productUrl: buildProductUrl(m.domain, upperAsin),
        status: 'available',
        title: titleHint ?? 'Carrie [Sissy Spacek] [Blu-ray]',
        imageUrl:
          imageHint ?? 'https://m.media-amazon.com/images/I/71dWftjAcKL._AC_UL320_.jpg',
        currency: m.currency,
        itemPrice: entry.itemPrice,
        shippingQuote: entry.shippingQuote,
        shippingNote: entry.shippingNote,
        shipsToPoland: true,
        sellerName: m.domain,
        fetchedAt: now,
        responseTimeMs: 15,
      };
      onProgress?.({
        type: 'store_done',
        marketplaceId: m.id,
        domain: m.domain,
        countryNamePl: m.countryNamePl,
        offer,
        completedCount: idx + 1,
        totalCount,
      });
      return offer;
    });
  }

  async searchCatalogCandidates(
    query: string,
    marketplaceId: MarketplaceId = 'PL',
  ): Promise<{
    candidates: CatalogCandidate[];
    source: 'LIVE' | 'REFERENCE_FALLBACK';
    notice?: string;
  }> {
    const market = MARKETPLACE_BY_ID[marketplaceId] ?? MARKETPLACE_BY_ID.PL;
    return {
      source: 'LIVE',
      candidates: [
        {
          asin: 'B0791VZ99Y',
          title: `Carrie [Sissy Spacek] [Blu-ray] (${query})`,
          imageUrl: 'https://m.media-amazon.com/images/I/71dWftjAcKL._AC_UL320_.jpg',
          previewPrice: 74.99,
          currency: 'PLN',
          previewPriceFormatted: '74,99 zł',
          rating: '4,7 z 5 gwiazdek',
          reviewCount: '3 412',
          productUrl: buildProductUrl(market.domain, 'B0791VZ99Y'),
          marketplaceId: market.id,
        },
      ],
    };
  }
}
