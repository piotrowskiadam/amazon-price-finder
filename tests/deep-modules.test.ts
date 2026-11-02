import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { MARKETPLACE_BY_ID } from '../src/domain/marketplaces.js';
import { StaticExchangeRateProvider } from '../src/modules/exchange-rate-provider.js';
import { resolveUserInput } from '../src/modules/input-resolver.js';
import { FixtureMarketplaceGateway } from '../src/modules/marketplace-gateway.js';
import {
  parseLocalizedMoney,
  parseProductPageHtml,
  parseSearchResultsHtml,
} from '../src/modules/marketplace-parser.js';
import { PriceComparisonOrchestrator } from '../src/modules/price-comparison-orchestrator.js';

describe('InputResolver deep module', () => {
  it('extracts ASIN, domain, and human-readable slug from amazon.pl URL', () => {
    const resolved = resolveUserInput(
      'https://www.amazon.pl/Carrie-Sissy-Spacek/dp/B0791VZ99Y?th=1&psc=1',
    );
    assert.equal(resolved.kind, 'asin');
    assert.equal(resolved.asin, 'B0791VZ99Y');
    assert.equal(resolved.sourceDomain, 'amazon.pl');
    assert.equal(resolved.sourceMarketplaceId, 'PL');
    assert.equal(resolved.extractedSlug, 'Carrie Sissy Spacek');
  });

  it('extracts ASIN from amazon.co.uk and amazon.de gp/product URLs', () => {
    const uk = resolveUserInput('https://www.amazon.co.uk/gp/product/B09XS7JWHH/ref=ox_sc_act');
    assert.equal(uk.kind, 'asin');
    assert.equal(uk.asin, 'B09XS7JWHH');
    assert.equal(uk.sourceMarketplaceId, 'UK');

    const de = resolveUserInput('amazon.de/dp/b08n5wrwnw');
    assert.equal(de.kind, 'asin');
    assert.equal(de.asin, 'B08N5WRWNW');
    assert.equal(de.sourceMarketplaceId, 'DE');
  });

  it('recognizes standalone 10-character ASIN and treats phrases as keyword queries', () => {
    const rawAsin = resolveUserInput('b0791vz99y');
    assert.equal(rawAsin.kind, 'asin');
    assert.equal(rawAsin.asin, 'B0791VZ99Y');

    const keyword = resolveUserInput('Carrie Sissy Spacek Blu-ray');
    assert.equal(keyword.kind, 'keyword');
    assert.equal(keyword.query, 'Carrie Sissy Spacek Blu-ray');
  });
});

describe('MarketplaceParser deep module', () => {
  it('parses localized money across PLN, EUR, GBP, and SEK formats', () => {
    assert.equal(parseLocalizedMoney('74,99 zł'), 74.99);
    assert.equal(parseLocalizedMoney('1 299,00 zł'), 1299.0);
    assert.equal(parseLocalizedMoney('1.249,99 €'), 1249.99);
    assert.equal(parseLocalizedMoney('£14.99'), 14.99);
    assert.equal(parseLocalizedMoney('1,299.50'), 1299.5);
    assert.equal(parseLocalizedMoney('159,00 kr'), 159.0);
  });

  it('parses Amazon product HTML with price and cross-border shipping quote', () => {
    const sampleHtml = `
      <html>
        <body>
          <span id="productTitle"> Carrie [Sissy Spacek] [Blu-ray] </span>
          <img id="landingImage" src="https://m.media-amazon.com/images/I/carrie.jpg" />
          <div id="corePriceDisplay_desktop_feature_div">
            <span class="a-price"><span class="a-offscreen">11,49 €</span></span>
          </div>
          <div id="mir-layout-DELIVERY_BLOCK">
            <span data-csa-c-delivery-price="6,99 €">Dostawa za 6,99 € do Polski</span>
          </div>
        </body>
      </html>
    `;
    const offer = parseProductPageHtml(sampleHtml, MARKETPLACE_BY_ID.ES, 'B0791VZ99Y', 120);
    assert.equal(offer.status, 'available');
    assert.equal(offer.title, 'Carrie [Sissy Spacek] [Blu-ray]');
    assert.equal(offer.imageUrl, 'https://m.media-amazon.com/images/I/carrie.jpg');
    assert.equal(offer.itemPrice, 11.49);
    assert.equal(offer.shippingQuote, 6.99);
    assert.equal(offer.currency, 'EUR');
  });

  it('parses search results HTML into up to 20 CatalogCandidate items', () => {
    const searchHtml = `
      <div>
        <div data-component-type="s-search-result" data-asin="B0791VZ99Y">
          <h2><span>Carrie [Sissy Spacek] [Blu-ray]</span></h2>
          <img class="s-image" src="https://example.com/1.jpg" />
          <span class="a-price"><span class="a-offscreen">74,99 zł</span></span>
          <span class="a-icon-alt">4,7 z 5 gwiazdek</span>
        </div>
        <div data-component-type="s-search-result" data-asin="B09XS7JWHH">
          <h2><span>Sony WH-1000XM5</span></h2>
          <span class="a-price"><span class="a-offscreen">1 299,00 zł</span></span>
        </div>
      </div>
    `;
    const results = parseSearchResultsHtml(searchHtml, 'PL', 20);
    assert.equal(results.length, 2);
    assert.equal(results[0]?.asin, 'B0791VZ99Y');
    assert.equal(results[0]?.imageUrl, 'https://example.com/1.jpg');
    assert.equal(results[0]?.previewPrice, 74.99);
    assert.equal(results[1]?.asin, 'B09XS7JWHH');
    assert.equal(results[1]?.previewPrice, 1299.0);
  });

  it('never reports a price when product is "Currently unavailable" (#outOfStock) even if format swatches exist', () => {
    const unavailableHtml = `
      <html>
        <body>
          <div id="dp">
            <span id="productTitle">Palladium Baggy Women's Boots, Black, EU 46</span>
            <div id="availability">
              <script>P.when("A", "load").execute("aod-assets-loaded", function(){});</script>
              <span>Currently unavailable. We don't know when or if this item will be back in stock.</span>
            </div>
            <div id="outOfStock">
              <span>Currently unavailable.</span>
            </div>
            <div id="tmmSwatches">
              <li class="a-button-selected"><span class="a-color-base">£74.67</span></li>
            </div>
          </div>
        </body>
      </html>
    `;
    const offer = parseProductPageHtml(unavailableHtml, MARKETPLACE_BY_ID.UK, 'B077Z3JQMF', 95);
    assert.equal(offer.status, 'out_of_stock');
    assert.equal(offer.itemPrice, null);
    assert.equal(offer.shippingQuote, null);
  });

  it('marks Amazon dog / 503 error pages as not_found with null price', () => {
    const dogHtml = `
      <html>
        <head><title>Amazon.se Ett oväntat fel har inträffat.</title></head>
        <body>
          <div id="h">
            <img src="https://images-na.ssl-images-amazon.com/images/G/46/error/title-sv._TTD_.jpg" />
            <img id="d" alt="Hundar från Amazon" />
          </div>
        </body>
      </html>
    `;
    const offer = parseProductPageHtml(dogHtml, MARKETPLACE_BY_ID.SE, 'B077Z3JQMF', 50);
    assert.equal(offer.status, 'not_found');
    assert.equal(offer.itemPrice, null);
  });
});

describe('PriceComparisonOrchestrator & HTTP API', () => {
  it('computes PLN LandedPrice across all 9 EU/UK marketplaces and ranks best deal', async () => {
    const orchestrator = new PriceComparisonOrchestrator({
      gateway: new FixtureMarketplaceGateway(),
      exchangeRateProvider: new StaticExchangeRateProvider({
        EUR: 4.3,
        GBP: 5.1,
        SEK: 0.38,
      }),
    });

    const report = await orchestrator.compareByAsin('B0791VZ99Y', {
      originDomain: 'amazon.pl',
    });

    assert.equal(report.asin, 'B0791VZ99Y');
    assert.equal(report.offers.length, 9);
    assert.ok(report.bestOffer);
    assert.equal(report.bestOffer.isBestLanded, true);
    // PL is 74.99 PLN; ES is (11.49 + 6.99) * 4.30 = 79.46 PLN; PL should win when shipping is included!
    assert.equal(report.bestOffer.marketplaceId, 'PL');
    // Best item price (without shipping) is ES (11.49 * 4.30 = 49.41 PLN)
    const esRow = report.offers.find((r) => r.marketplaceId === 'ES');
    assert.ok(esRow);
    assert.equal(esRow.isBestItemPrice, true);
    assert.equal(esRow.itemPricePln, 49.41);
  });

  it('serves /api/resolve for URL and keyword inputs', async () => {
    const app = createApp({
      gateway: new FixtureMarketplaceGateway(),
      exchangeRateProvider: new StaticExchangeRateProvider(),
    });

    const urlRes = await app.request('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: 'https://www.amazon.pl/Carrie-Sissy-Spacek/dp/B0791VZ99Y',
      }),
    });
    assert.equal(urlRes.status, 200);
    const urlJson = (await urlRes.json()) as { kind: string; report: { asin: string } };
    assert.equal(urlJson.kind, 'comparison');
    assert.equal(urlJson.report.asin, 'B0791VZ99Y');

    const kwRes = await app.request('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: 'Carrie',
      }),
    });
    assert.equal(kwRes.status, 200);
    const kwJson = (await kwRes.json()) as {
      kind: string;
      searchResult: { candidates: Array<{ asin: string }> };
    };
    assert.equal(kwJson.kind, 'candidates');
    assert.ok(kwJson.searchResult.candidates.length > 0);
  });
});
