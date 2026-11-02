import * as cheerio from 'cheerio';
import { buildProductUrl, MARKETPLACE_BY_ID } from '../domain/marketplaces.js';
import type {
  CatalogCandidate,
  CurrencyCode,
  Marketplace,
  MarketplaceId,
  MarketplaceOffer,
} from '../domain/types.js';
import { DEFAULT_FALLBACK_RATES } from './exchange-rate-provider.js';

const FREE_SHIPPING_WORDS = [
  'free delivery',
  'free shipping',
  'gratis bezorging',
  'gratis levering',
  'gratis leverans',
  'fri frakt',
  'darmowa dostawa',
  'bezpłatna dostawa',
  'za darmo',
  'kostenlose lieferung',
  'gratis lieferung',
  'livraison gratuite',
  'entrega gratis',
  'envío gratis',
  'consegna gratuita',
  'spedizione gratuita',
];

const NO_SHIPPING_TO_DEST_PATTERNS = [
  /cannot be shipped to your selected delivery location/i,
  /this item cannot be shipped/i,
  /nie może zostać wysłany do wybranej lokalizacji/i,
  /ten przedmiot nie może zostać dostarczony/i,
  /kann nicht an den ausgewählten lieferort/i,
  /cet article ne peut pas être livré/i,
  /no se puede enviar a la ubicación/i,
  /non può essere spedito/i,
  /kan niet worden bezorgd/i,
  /kan inte levereras till din valda leveransplats/i,
];

const CAPTCHA_PATTERNS = [
  /validateCaptcha/i,
  /api-services-support@amazon\./i,
  /Type the characters you see in this image/i,
  /Enter the characters you see below/i,
  /Podaj znaki widoczne na obrazku/i,
  /Geben Sie die Zeichen unten ein/i,
  /Saisissez les caractères que vous voyez/i,
  /Introduce los caracteres que se muestran/i,
  /Inserisci i caratteri visualizzati/i,
];

const DOG_OR_ERROR_PAGE_PATTERNS = [
  /images-na\.ssl-images-amazon\.com\/images\/G\/\d+\/error\//i,
  /Hundar från Amazon/i,
  /Dogs of Amazon/i,
  /Hunde von Amazon/i,
  /Chiens d'Amazon/i,
  /Perros de Amazon/i,
  /Cani di Amazon/i,
  /Psy z Amazon/i,
  /kunde vi inte hitta den sidan/i,
  /Ett oväntat fel har inträffat/i,
  /Nie możemy znaleźć tej strony/i,
  /Sorry! We couldn't find that page/i,
  /Tut uns Leid!\s*Während Ihrer Eingabe ist ein Fehler/i,
];

const OUT_OF_STOCK_PATTERNS = [
  /currently unavailable/i,
  /we don't know when or if this item will be back in stock/i,
  /obecnie niedostępny/i,
  /produkt aktualnie niedostępny/i,
  /nie wiemy, kiedy ani czy ten produkt będzie ponownie dostępny/i,
  /derzeit nicht verfügbar/i,
  /ob und wann dieser artikel wieder vorrätig sein wird/i,
  /actuellement indisponible/i,
  /nous ne savons pas quand cet article sera de nouveau approvisionné/i,
  /no disponible temporalmente/i,
  /no disponible\./i,
  /no sabemos si este producto volverá a estar disponible/i,
  /attualmente non disponibile/i,
  /non sappiamo se o quando l'articolo sarà di nuovo disponibile/i,
  /momenteel niet verkrijgbaar/i,
  /we weten niet of en wanneer dit item weer op voorraad is/i,
  /tillfälligt slut/i,
  /för närvarande inte tillgänglig/i,
  /vi vet inte när eller om denna vara kommer att finnas i lager igen/i,
  /temporarily out of stock/i,
];

const UNQUALIFIED_BUYBOX_PATTERNS = [
  /see all buying options/i,
  /no featured offers available/i,
  /zobacz wszystkie opcje zakupu/i,
  /brak wyróżnionych ofert/i,
  /alle kaufoptionen anzeigen/i,
  /keine hervorgehobenen angebote verfügbar/i,
  /ver todas las opciones de compra/i,
  /no hay ofertas destacadas disponibles/i,
  /visualizza tutte le opzioni di acquisto/i,
  /nessuna offerta in evidenza disponibile/i,
  /voir toutes les options d'achat/i,
  /aucune offre mise en avant disponible/i,
  /bekijk alle koopopties/i,
  /geen aanbevolen aanbiedingen beschikbaar/i,
  /se alla köpalternativ/i,
  /inga utvalda erbjudanden tillgängliga/i,
];

function extractCleanText($: cheerio.CheerioAPI, selector: string): string {
  const clone = $(selector).clone();
  clone.find('script, style, noscript').remove();
  return clone.text().replace(/\s+/g, ' ').trim();
}

/**
 * Parses a localized European/UK price string into a floating-point number.
 */
export function parseLocalizedMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\u00a0/g, ' ').trim();
  const match = cleaned.match(/(\d[\d\s.,]*\d|\d)/);
  if (!match || !match[1]) return null;

  let numStr = match[1].replace(/\s+/g, '');
  const lastComma = numStr.lastIndexOf(',');
  const lastDot = numStr.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    } else {
      numStr = numStr.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const afterComma = numStr.slice(lastComma + 1);
    if (afterComma.length <= 2) {
      numStr = numStr.replace(',', '.');
    } else {
      numStr = numStr.replace(/,/g, '');
    }
  } else if (lastDot !== -1) {
    const afterDot = numStr.slice(lastDot + 1);
    if (afterDot.length === 3 && numStr.indexOf('.') !== lastDot) {
      numStr = numStr.replace(/\./g, '');
    }
  }

  const parsed = Number.parseFloat(numStr);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

/**
 * Detects if a raw price string explicitly specifies a currency that differs
 * from the marketplace's default currency (e.g. Amazon geo-IP showing PLN on amazon.de).
 */
export function detectCurrencyInRawText(
  raw: string | null | undefined,
  defaultCurrency: CurrencyCode,
): CurrencyCode {
  if (!raw) return defaultCurrency;
  if (/\bPLN\b|zł/i.test(raw)) return 'PLN';
  if (/\bEUR\b|€/i.test(raw)) return 'EUR';
  if (/\bGBP\b|£/i.test(raw)) return 'GBP';
  if (/\bSEK\b|\bkr\b/i.test(raw)) return 'SEK';
  return defaultCurrency;
}

function normalizeAmountToMarketplaceCurrency(
  amount: number,
  detectedCurrency: CurrencyCode,
  targetCurrency: CurrencyCode,
): number {
  if (detectedCurrency === targetCurrency) return amount;
  const detectedToPln = DEFAULT_FALLBACK_RATES[detectedCurrency] ?? 1.0;
  const targetToPln = DEFAULT_FALLBACK_RATES[targetCurrency] ?? 1.0;
  const amountInPln = amount * detectedToPln;
  return Math.round((amountInPln / targetToPln) * 100) / 100;
}

function extractProductImageUrl($: cheerio.CheerioAPI): string | null {
  const directAttrs = [
    $('#landingImage').attr('data-old-hires'),
    $('#landingImage').attr('src'),
    $('#imgBlkFront').attr('data-old-hires'),
    $('#imgBlkFront').attr('src'),
    $('#ebooksImgBlkFront').attr('src'),
    $('#main-image').attr('src'),
    $('#imgTagWrapperId img').first().attr('data-old-hires'),
    $('#imgTagWrapperId img').first().attr('src'),
    $('meta[property="og:image"]').attr('content'),
  ];

  for (const candidate of directAttrs) {
    if (candidate && /^https?:\/\//i.test(candidate.trim())) {
      return candidate.trim();
    }
  }

  const dynamicJson =
    $('#landingImage').attr('data-a-dynamic-image') ||
    $('#imgBlkFront').attr('data-a-dynamic-image') ||
    $('#imgTagWrapperId img').first().attr('data-a-dynamic-image');

  if (dynamicJson) {
    try {
      const parsed = JSON.parse(dynamicJson) as Record<string, unknown>;
      const firstUrl = Object.keys(parsed).find((u) => /^https?:\/\//i.test(u));
      if (firstUrl) return firstUrl;
    } catch {
      // Ignore malformed JSON
    }
  }

  return null;
}

export function isCaptchaHtml(html: string): boolean {
  return CAPTCHA_PATTERNS.some((rx) => rx.test(html));
}

export function isDogOrErrorPageHtml(html: string): boolean {
  return DOG_OR_ERROR_PAGE_PATTERNS.some((rx) => rx.test(html));
}

export function parseProductPageHtml(
  html: string,
  marketplace: Marketplace,
  asin: string,
  responseTimeMs = 0,
): MarketplaceOffer {
  const productUrl = buildProductUrl(marketplace.domain, asin);
  const fetchedAt = new Date().toISOString();

  if (isCaptchaHtml(html)) {
    return {
      marketplaceId: marketplace.id,
      domain: marketplace.domain,
      asin,
      productUrl,
      status: 'captcha_blocked',
      title: null,
      imageUrl: null,
      currency: marketplace.currency,
      itemPrice: null,
      shippingQuote: null,
      shippingNote:
        'Sklep wymusił weryfikację CAPTCHA — użyj przycisku bezpośredniego lub wpisz cenę ręcznie',
      shipsToPoland: null,
      sellerName: null,
      fetchedAt,
      responseTimeMs,
      statusMessage: 'Ochrona anty-bot Amazon (CAPTCHA)',
    };
  }

  if (isDogOrErrorPageHtml(html)) {
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
      shippingNote: 'Brak strony produktu w tym sklepie (404 / strona niedostępna)',
      shipsToPoland: null,
      sellerName: null,
      fetchedAt,
      responseTimeMs,
      statusMessage: 'Brak strony w tym sklepie (404)',
    };
  }

  const $ = cheerio.load(html);

  const title =
    extractCleanText($, '#productTitle') ||
    extractCleanText($, '#title') ||
    $('meta[name="title"]').attr('content')?.trim() ||
    null;

  const imageUrl = extractProductImageUrl($);

  if (!title) {
    return {
      marketplaceId: marketplace.id,
      domain: marketplace.domain,
      asin,
      productUrl,
      status: 'not_found',
      title: null,
      imageUrl,
      currency: marketplace.currency,
      itemPrice: null,
      shippingQuote: null,
      shippingNote: 'Produkt nie występuje w katalogu tego sklepu',
      shipsToPoland: null,
      sellerName: null,
      fetchedAt,
      responseTimeMs,
      statusMessage: 'Brak w katalogu sklepu',
    };
  }

  // Strictly check out-of-stock / unqualified BuyBox BEFORE reading any prices
  const availabilityText = extractCleanText(
    $,
    '#availability, #availabilityInsideBuyBox_feature_div',
  );
  const outOfStockBoxText = extractCleanText(
    $,
    '#outOfStock, #outOfStockBuyBox_feature_div',
  );
  const unqualifiedBoxText = extractCleanText(
    $,
    '#unqualifiedBuyBox, #fod-cx-box',
  );

  const isExplicitlyOutOfStock =
    outOfStockBoxText.length > 0 ||
    OUT_OF_STOCK_PATTERNS.some((rx) => rx.test(availabilityText)) ||
    OUT_OF_STOCK_PATTERNS.some((rx) => rx.test(outOfStockBoxText));

  const hasActiveBuyBoxControls =
    $(
      '#add-to-cart-button, #buy-now-button, input[name="submit.add-to-cart"], input[name="submit.buy-now"], #desktop_qualifiedBuyBox, #qualifiedBuybox',
    ).length > 0;

  const isFullAmazonDocument =
    html.length > 5000 ||
    $('#dp, #dp-container, #ppd, #centerCol, #buybox').length > 0;

  const isUnqualifiedOnly =
    !hasActiveBuyBoxControls &&
    (unqualifiedBoxText.length > 0 ||
      UNQUALIFIED_BUYBOX_PATTERNS.some((rx) => rx.test(unqualifiedBoxText)) ||
      (isFullAmazonDocument && !hasActiveBuyBoxControls));

  const sellerName =
    extractCleanText($, '#sellerProfileTriggerId') ||
    extractCleanText(
      $,
      '#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sold by"]',
    ) ||
    null;

  if (isExplicitlyOutOfStock || isUnqualifiedOnly) {
    const reasonNote = isExplicitlyOutOfStock
      ? 'Produkt aktualnie niedostępny (Currently unavailable)'
      : 'Brak aktywnej oferty w BuyBox (brak wysyłki lub wyboru sprzedawcy)';

    return {
      marketplaceId: marketplace.id,
      domain: marketplace.domain,
      asin,
      productUrl,
      status: 'out_of_stock',
      title,
      imageUrl,
      currency: marketplace.currency,
      itemPrice: null,
      shippingQuote: null,
      shippingNote: reasonNote,
      shipsToPoland: null,
      sellerName,
      fetchedAt,
      responseTimeMs,
      statusMessage: isExplicitlyOutOfStock
        ? 'Produkt niedostępny'
        : 'Brak oferty w BuyBox',
    };
  }

  // Strictly scoped to the primary BuyBox / corePrice of the active product
  // (never #tmmSwatches or secondary carousels)
  const priceSelectors = [
    '#desktop_qualifiedBuyBox .priceToPay .a-offscreen',
    '#desktop_qualifiedBuyBox .a-price .a-offscreen',
    '#qualifiedBuybox .priceToPay .a-offscreen',
    '#qualifiedBuybox .a-price .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .apexPriceToPay .a-offscreen',
    '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
    '#buybox .priceToPay .a-offscreen',
    '#buybox .a-price .a-offscreen',
    '#corePrice_feature_div .priceToPay .a-offscreen',
    '#corePrice_feature_div .a-price .a-offscreen',
    '#newBuyBoxPrice',
    '#price_inside_buybox',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
  ];

  let itemPrice: number | null = null;
  for (const sel of priceSelectors) {
    const rawText = extractCleanText($, sel);
    const parsed = parseLocalizedMoney(rawText);
    if (parsed !== null && parsed > 0) {
      const detectedCurrency = detectCurrencyInRawText(rawText, marketplace.currency);
      itemPrice = normalizeAmountToMarketplaceCurrency(
        parsed,
        detectedCurrency,
        marketplace.currency,
      );
      break;
    }
  }

  if (itemPrice === null) {
    const whole = $(
      '#corePriceDisplay_desktop_feature_div .a-price-whole, #corePrice_feature_div .a-price-whole',
    )
      .first()
      .text()
      .replace(/[^\d]/g, '');
    const fraction = $(
      '#corePriceDisplay_desktop_feature_div .a-price-fraction, #corePrice_feature_div .a-price-fraction',
    )
      .first()
      .text()
      .replace(/[^\d]/g, '');
    const symbolText = $(
      '#corePriceDisplay_desktop_feature_div .a-price-symbol, #corePrice_feature_div .a-price-symbol',
    )
      .first()
      .text()
      .trim();

    if (whole) {
      const combined = `${whole}.${fraction || '00'}`;
      const val = Number.parseFloat(combined);
      if (Number.isFinite(val) && val > 0) {
        const detectedCurrency = detectCurrencyInRawText(symbolText, marketplace.currency);
        itemPrice = normalizeAmountToMarketplaceCurrency(
          val,
          detectedCurrency,
          marketplace.currency,
        );
      }
    }
  }

  if (itemPrice === null) {
    return {
      marketplaceId: marketplace.id,
      domain: marketplace.domain,
      asin,
      productUrl,
      status: 'out_of_stock',
      title,
      imageUrl,
      currency: marketplace.currency,
      itemPrice: null,
      shippingQuote: null,
      shippingNote: 'Brak aktywnej ceny w BuyBox',
      shipsToPoland: null,
      sellerName,
      fetchedAt,
      responseTimeMs,
      statusMessage: 'Brak ceny w BuyBox',
    };
  }

  // Extract ShippingQuote & Delivery Location from #glow-ingress-block
  let shippingQuote: number | null = null;
  let shippingNote: string | null = null;
  let shipsToPoland: boolean | null = null;

  const glowLocationRaw = extractCleanText(
    $,
    '#ContextualIngressPtLabel_deliveryShortLine, #glow-ingress-block',
  );
  const glowLocationClean = glowLocationRaw
    .replace(
      /Zaktualizuj lokalizację|Update location|Standort aktualisieren|Actualizar ubicación|Aggiorna posizione|Mettre à jour l'emplacement|Locatie bijwerken|Uppdatera plats/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();

  const csaDeliveryAttr = $(
    '#mir-layout-DELIVERY_BLOCK [data-csa-c-delivery-price], [data-csa-c-delivery-price]',
  )
    .first()
    .attr('data-csa-c-delivery-price');

  const deliveryBlockText = [
    extractCleanText($, '#mir-layout-DELIVERY_BLOCK'),
    extractCleanText($, '#deliveryBlockMessage'),
    extractCleanText($, '#price-shipping-message'),
    extractCleanText($, '#exports_desktop_qualifiedBuybox_tlc_feature_div'),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (NO_SHIPPING_TO_DEST_PATTERNS.some((rx) => rx.test(deliveryBlockText))) {
    shipsToPoland = false;
    shippingNote = 'Brak wysyłki do wybranej lokalizacji (PL)';
  } else if (csaDeliveryAttr) {
    const lowerAttr = csaDeliveryAttr.toLowerCase();
    if (
      lowerAttr === 'free' ||
      lowerAttr === 'gratis' ||
      lowerAttr === 'darmowa' ||
       lowerAttr === 'kostenlos' ||
      lowerAttr === 'gratuite' ||
      lowerAttr === 'gratuita' ||
      FREE_SHIPPING_WORDS.some((w) => lowerAttr.includes(w))
    ) {
      shippingQuote = 0;
      shipsToPoland = true;
      shippingNote = glowLocationClean
        ? `Darmowa dostawa (${glowLocationClean})`
        : `Darmowa dostawa (${csaDeliveryAttr.trim()})`;
    } else {
      const parsedShipping = parseLocalizedMoney(csaDeliveryAttr);
      if (parsedShipping !== null) {
        const detectedCurr = detectCurrencyInRawText(csaDeliveryAttr, marketplace.currency);
        shippingQuote = normalizeAmountToMarketplaceCurrency(
          parsedShipping,
          detectedCurr,
          marketplace.currency,
        );
        shipsToPoland = true;
        shippingNote = glowLocationClean
          ? `Dostawa: ${csaDeliveryAttr.trim()} (${glowLocationClean})`
          : `Dostawa: ${csaDeliveryAttr.trim()}`;
      }
    }
  }

  if (shippingQuote === null && shipsToPoland !== false && deliveryBlockText) {
    const lowerText = deliveryBlockText.toLowerCase();
    if (FREE_SHIPPING_WORDS.some((w) => lowerText.includes(w))) {
      shippingQuote = 0;
      shipsToPoland = true;
      shippingNote = glowLocationClean
        ? `Darmowa dostawa (${glowLocationClean})`
        : 'Darmowa dostawa';
    } else {
      const parsedFromBlock = parseLocalizedMoney(deliveryBlockText);
      if (parsedFromBlock !== null) {
        const detectedCurr = detectCurrencyInRawText(deliveryBlockText, marketplace.currency);
        shippingQuote = normalizeAmountToMarketplaceCurrency(
          parsedFromBlock,
          detectedCurr,
          marketplace.currency,
        );
        shipsToPoland = true;
        shippingNote = glowLocationClean
          ? `${deliveryBlockText.slice(0, 65)} (${glowLocationClean})`
          : deliveryBlockText.slice(0, 80);
      }
    }
  }

  return {
    marketplaceId: marketplace.id,
    domain: marketplace.domain,
    asin,
    productUrl,
    status: 'available',
    title,
    imageUrl,
    currency: marketplace.currency,
    itemPrice,
    shippingQuote,
    shippingNote:
      shippingNote ??
      (glowLocationClean
        ? `Koszt dostawy wg koszyka (${glowLocationClean})`
        : 'Koszt dostawy zależny od adresu w koszyku (możesz wpisać ręcznie)'),
    shipsToPoland,
    sellerName,
    fetchedAt,
    responseTimeMs,
  };
}

export function parseSearchResultsHtml(
  html: string,
  marketplaceId: MarketplaceId,
  limit = 20,
): CatalogCandidate[] {
  const marketplace = MARKETPLACE_BY_ID[marketplaceId];
  const $ = cheerio.load(html);
  const candidates: CatalogCandidate[] = [];
  const seenAsins = new Set<string>();

  $('div[data-component-type="s-search-result"][data-asin], div.s-result-item[data-asin]').each(
    (_, el) => {
      if (candidates.length >= limit) return false;
      const asin = ($(el).attr('data-asin') ?? '').trim().toUpperCase();
      if (!asin || asin.length !== 10 || seenAsins.has(asin)) return;

      const imgEl = $(el).find('img.s-image').first();
      const title =
        $(el).find('h2 span').first().text().trim() ||
        $(el).find('h2').first().text().trim() ||
        imgEl.attr('alt')?.trim() ||
        '';
      if (!title) return;

      seenAsins.add(asin);

      let imageUrl = imgEl.attr('src')?.trim() ?? null;
      if (!imageUrl) {
        const srcset = imgEl.attr('srcset')?.trim();
        if (srcset) {
          imageUrl = srcset.split(',')[0]?.trim().split(/\s+/)[0] ?? null;
        }
      }

      const rawPrice = $(el).find('.a-price .a-offscreen').first().text().trim();
      const previewPrice = parseLocalizedMoney(rawPrice);
      const rating = $(el).find('span.a-icon-alt').first().text().trim() || null;
      const reviewCount =
        $(el).find('span.a-size-base.s-underline-text').first().text().trim() ||
        $(el).find('a[href*="#customerReviews"] span').first().text().trim() ||
        null;

      candidates.push({
        asin,
        title,
        imageUrl,
        previewPrice,
        currency: marketplace.currency,
        previewPriceFormatted: rawPrice || null,
        rating,
        reviewCount,
        productUrl: buildProductUrl(marketplace.domain, asin),
        marketplaceId,
      });
    },
  );

  return candidates;
}
