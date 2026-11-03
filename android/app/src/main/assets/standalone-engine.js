// Standalone client-side scraping & parsing engine for the Android APK
// Uses the native Kotlin HTTP bridge (window.EuroAmazonAndroid) + browser DOMParser

const MARKETPLACES = [
  {
    id: 'PL',
    domain: 'amazon.pl',
    countryNamePl: 'Polska',
    currency: 'PLN',
    currencySymbol: 'zł',
    regionGroup: 'EU',
    languageTag: 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  {
    id: 'DE',
    domain: 'amazon.de',
    countryNamePl: 'Niemcy',
    currency: 'EUR',
    currencySymbol: '€',
    regionGroup: 'EU',
    languageTag: 'de-DE,de;q=0.9,en-GB;q=0.8,en;q=0.7',
  },
  {
    id: 'ES',
    domain: 'amazon.es',
    countryNamePl: 'Hiszpania',
    currency: 'EUR',
    currencySymbol: '€',
    regionGroup: 'EU',
    languageTag: 'es-ES,es;q=0.9,en;q=0.7',
  },
  {
    id: 'IT',
    domain: 'amazon.it',
    countryNamePl: 'Włochy',
    currency: 'EUR',
    currencySymbol: '€',
    regionGroup: 'EU',
    languageTag: 'it-IT,it;q=0.9,en;q=0.7',
  },
  {
    id: 'FR',
    domain: 'amazon.fr',
    countryNamePl: 'Francja',
    currency: 'EUR',
    currencySymbol: '€',
    regionGroup: 'EU',
    languageTag: 'fr-FR,fr;q=0.9,en;q=0.7',
  },
  {
    id: 'NL',
    domain: 'amazon.nl',
    countryNamePl: 'Holandia',
    currency: 'EUR',
    currencySymbol: '€',
    regionGroup: 'EU',
    languageTag: 'nl-NL,nl;q=0.9,en;q=0.7',
  },
  {
    id: 'BE',
    domain: 'amazon.com.be',
    countryNamePl: 'Belgia',
    currency: 'EUR',
    currencySymbol: '€',
    regionGroup: 'EU',
    languageTag: 'fr-BE,nl-BE;q=0.9,en;q=0.7',
  },
  {
    id: 'SE',
    domain: 'amazon.se',
    countryNamePl: 'Szwecja',
    currency: 'SEK',
    currencySymbol: 'kr',
    regionGroup: 'EU',
    languageTag: 'sv-SE,sv;q=0.9,en;q=0.7',
  },
  {
    id: 'UK',
    domain: 'amazon.co.uk',
    countryNamePl: 'Wielkiej Brytanii',
    currency: 'GBP',
    currencySymbol: '£',
    regionGroup: 'UK',
    languageTag: 'en-GB,en;q=0.9',
  },
];

const MARKETPLACE_BY_ID = Object.fromEntries(
  MARKETPLACES.map((m) => [m.id, m]),
);

const DEFAULT_FALLBACK_RATES = {
  PLN: 1.0,
  EUR: 4.3185,
  GBP: 5.149,
  SEK: 0.3782,
};

const ASIN_PATTERNS = [
  /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN|product|d)\/([A-Z0-9]{10})(?:[/?&#]|$)/i,
  /[?&]asin=([A-Z0-9]{10})(?:[&#]|$)/i,
];

const STANDALONE_ASIN_REGEX = /^(B[A-Z0-9]{9}|[0-9]{9}[0-9X])$/i;

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

let nextReqId = 1;
const pendingFetches = new Map();

if (typeof window !== 'undefined') {
  window.__resolveAndroidFetch = (reqId, payload) => {
    const entry = pendingFetches.get(reqId);
    if (!entry) return;
    pendingFetches.delete(reqId);
    entry.resolve(payload);
  };
}

export function isAndroidStandaloneMode() {
  return (
    typeof window !== 'undefined' &&
    typeof window.EuroAmazonAndroid !== 'undefined' &&
    typeof window.EuroAmazonAndroid.startHttpFetch === 'function'
  );
}

function nativeHttpFetch(url, domain, acceptLanguage, cookieHeader) {
  return new Promise((resolve, reject) => {
    if (!isAndroidStandaloneMode()) {
      reject(new Error('Brak mostka natywnego Androida.'));
      return;
    }
    const reqId = nextReqId++;
    const timer = setTimeout(() => {
      if (pendingFetches.has(reqId)) {
        pendingFetches.delete(reqId);
        resolve({ status: 0, body: '', error: 'Przekroczono czas oczekiwania' });
      }
    }, 12000);

    pendingFetches.set(reqId, {
      resolve: (res) => {
        clearTimeout(timer);
        resolve(res);
      },
    });

    try {
      window.EuroAmazonAndroid.startHttpFetch(
        reqId,
        url,
        domain || '',
        acceptLanguage || 'pl-PL,pl;q=0.9,en;q=0.8',
        cookieHeader || '',
      );
    } catch (err) {
      clearTimeout(timer);
      pendingFetches.delete(reqId);
      resolve({
        status: 0,
        body: '',
        error: err instanceof Error ? err.message : 'Błąd wywołania natywnego',
      });
    }
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function resolveUserInputClient(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Wprowadź link z Amazon, kod ASIN lub frazę wyszukiwania.');
  }

  if (/^(https?:\/\/|(?:www\.)?amazon\.[a-z.]{2,6}\/)/i.test(trimmed)) {
    const normalizedUrl = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    try {
      const parsed = new URL(normalizedUrl);
      const fullPathAndQuery = `${parsed.pathname}${parsed.search}`;

      for (const pattern of ASIN_PATTERNS) {
        const match = fullPathAndQuery.match(pattern);
        if (match && match[1]) {
          const asin = match[1].toUpperCase();
          const cleanHost = parsed.hostname.toLowerCase().replace(/^www\./, '');
          const market = MARKETPLACES.find((m) => m.domain === cleanHost);
          const slugMatch = parsed.pathname.match(
            /^\/([^/]+)\/(?:dp|gp\/product)\//i,
          );
          const extractedSlug = slugMatch?.[1]
            ? decodeURIComponent(slugMatch[1]).replace(/[-_]+/g, ' ').trim()
            : undefined;

          return {
            kind: 'asin',
            asin,
            sourceDomain: market?.domain ?? cleanHost,
            sourceMarketplaceId: market?.id,
            extractedSlug,
          };
        }
      }

      const searchParam =
        parsed.searchParams.get('k') ??
        parsed.searchParams.get('field-keywords');
      if (searchParam && searchParam.trim()) {
        return { kind: 'keyword', query: searchParam.trim() };
      }
    } catch {
      // Fall through
    }
  }

  for (const pattern of ASIN_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return { kind: 'asin', asin: match[1].toUpperCase() };
    }
  }

  if (STANDALONE_ASIN_REGEX.test(trimmed)) {
    return { kind: 'asin', asin: trimmed.toUpperCase() };
  }

  return { kind: 'keyword', query: trimmed };
}

export async function fetchExchangeRatesClient(customOverrides) {
  try {
    const res = await nativeHttpFetch(
      'https://api.nbp.pl/api/exchangerates/tables/A/?format=json',
      'api.nbp.pl',
      'pl-PL,pl;q=0.9',
      '',
    );
    if (res.status === 200 && res.body) {
      const tables = JSON.parse(res.body);
      const table = tables?.[0];
      if (table && Array.isArray(table.rates)) {
        const rateMap = { ...DEFAULT_FALLBACK_RATES };
        for (const r of table.rates) {
          if (r.code === 'EUR' || r.code === 'GBP' || r.code === 'SEK') {
            rateMap[r.code] = Number(r.mid.toFixed(4));
          }
        }
        return applyRateOverrides(
          {
            source: 'NBP_API',
            tableNumber: table.no,
            effectiveDate: table.effectiveDate,
            ratesToPln: rateMap,
          },
          customOverrides,
        );
      }
    }
  } catch {
    // Fallback below
  }

  return applyRateOverrides(
    {
      source: 'FALLBACK_REFERENCE',
      tableNumber: 'Tabela A (awaryjna)',
      effectiveDate: new Date().toISOString().slice(0, 10),
      ratesToPln: { ...DEFAULT_FALLBACK_RATES },
    },
    customOverrides,
  );
}

function applyRateOverrides(snapshot, customOverrides) {
  if (!customOverrides) return snapshot;
  const merged = { ...snapshot.ratesToPln };
  let hasCustom = false;
  for (const code of ['EUR', 'GBP', 'SEK']) {
    const val = customOverrides[code];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      merged[code] = val;
      hasCustom = true;
    }
  }
  return {
    ...snapshot,
    source: hasCustom ? 'CUSTOM' : snapshot.source,
    ratesToPln: merged,
  };
}

function parseLocalizedMoney(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/\u00a0/g, ' ').trim();
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
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * 100) / 100
    : null;
}

function detectCurrencyInRawText(raw, defaultCurrency) {
  if (!raw) return defaultCurrency;
  if (/\bPLN\b|zł/i.test(raw)) return 'PLN';
  if (/\bEUR\b|€/i.test(raw)) return 'EUR';
  if (/\bGBP\b|£/i.test(raw)) return 'GBP';
  if (/\bSEK\b|\bkr\b/i.test(raw)) return 'SEK';
  return defaultCurrency;
}

function normalizeAmountToMarketplaceCurrency(
  amount,
  detectedCurrency,
  targetCurrency,
) {
  if (detectedCurrency === targetCurrency) return amount;
  const detectedToPln = DEFAULT_FALLBACK_RATES[detectedCurrency] ?? 1.0;
  const targetToPln = DEFAULT_FALLBACK_RATES[targetCurrency] ?? 1.0;
  const amountInPln = amount * detectedToPln;
  return Math.round((amountInPln / targetToPln) * 100) / 100;
}

function extractCleanTextFromDoc(doc, selector) {
  const nodes = doc.querySelectorAll(selector);
  if (!nodes.length) return '';
  const parts = [];
  nodes.forEach((node) => {
    const clone = node.cloneNode(true);
    clone
      .querySelectorAll('script, style, noscript')
      .forEach((el) => el.remove());
    const txt = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt) parts.push(txt);
  });
  return parts.join(' ').trim();
}

function extractProductImageUrlFromDoc(doc) {
  const selectors = [
    ['#landingImage', 'data-old-hires'],
    ['#landingImage', 'src'],
    ['#imgBlkFront', 'data-old-hires'],
    ['#imgBlkFront', 'src'],
    ['#ebooksImgBlkFront', 'src'],
    ['#main-image', 'src'],
    ['#imgTagWrapperId img', 'data-old-hires'],
    ['#imgTagWrapperId img', 'src'],
    ['meta[property="og:image"]', 'content'],
  ];

  for (const [sel, attr] of selectors) {
    const val = doc.querySelector(sel)?.getAttribute(attr)?.trim();
    if (val && /^https?:\/\//i.test(val)) return val;
  }

  const dynJson =
    doc.querySelector('#landingImage')?.getAttribute('data-a-dynamic-image') ||
    doc.querySelector('#imgBlkFront')?.getAttribute('data-a-dynamic-image') ||
    doc
      .querySelector('#imgTagWrapperId img')
      ?.getAttribute('data-a-dynamic-image');

  if (dynJson) {
    try {
      const parsed = JSON.parse(dynJson);
      const firstUrl = Object.keys(parsed).find((u) => /^https?:\/\//i.test(u));
      if (firstUrl) return firstUrl;
    } catch {
      // Ignore
    }
  }
  return null;
}

function parseProductDom(html, marketplace, asin, responseTimeMs) {
  const productUrl = `https://www.${marketplace.domain}/dp/${asin}`;
  const fetchedAt = new Date().toISOString();

  if (CAPTCHA_PATTERNS.some((rx) => rx.test(html))) {
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

  if (DOG_OR_ERROR_PAGE_PATTERNS.some((rx) => rx.test(html))) {
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
      shippingNote:
        'Brak strony produktu w tym sklepie (404 / strona niedostępna)',
      shipsToPoland: null,
      sellerName: null,
      fetchedAt,
      responseTimeMs,
      statusMessage: 'Brak strony w tym sklepie (404)',
    };
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title =
    extractCleanTextFromDoc(doc, '#productTitle') ||
    extractCleanTextFromDoc(doc, '#title') ||
    doc.querySelector('meta[name="title"]')?.getAttribute('content')?.trim() ||
    null;

  const imageUrl = extractProductImageUrlFromDoc(doc);

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

  const availabilityText = extractCleanTextFromDoc(
    doc,
    '#availability, #availabilityInsideBuyBox_feature_div',
  );
  const outOfStockBoxText = extractCleanTextFromDoc(
    doc,
    '#outOfStock, #outOfStockBuyBox_feature_div',
  );
  const unqualifiedBoxText = extractCleanTextFromDoc(
    doc,
    '#unqualifiedBuyBox, #fod-cx-box',
  );

  const isExplicitlyOutOfStock =
    outOfStockBoxText.length > 0 ||
    OUT_OF_STOCK_PATTERNS.some((rx) => rx.test(availabilityText)) ||
    OUT_OF_STOCK_PATTERNS.some((rx) => rx.test(outOfStockBoxText));

  const hasActiveBuyBoxControls =
    doc.querySelectorAll(
      '#add-to-cart-button, #buy-now-button, input[name="submit.add-to-cart"], input[name="submit.buy-now"], #desktop_qualifiedBuyBox, #qualifiedBuybox',
    ).length > 0;

  const isFullAmazonDocument =
    html.length > 5000 ||
    doc.querySelectorAll('#dp, #dp-container, #ppd, #centerCol, #buybox')
      .length > 0;

  const isUnqualifiedOnly =
    !hasActiveBuyBoxControls &&
    (unqualifiedBoxText.length > 0 ||
      UNQUALIFIED_BUYBOX_PATTERNS.some((rx) => rx.test(unqualifiedBoxText)) ||
      (isFullAmazonDocument && !hasActiveBuyBoxControls));

  const sellerName =
    extractCleanTextFromDoc(doc, '#sellerProfileTriggerId') ||
    extractCleanTextFromDoc(
      doc,
      '#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sold by"]',
    ) ||
    null;

  if (isExplicitlyOutOfStock || isUnqualifiedOnly) {
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
      shippingNote: isExplicitlyOutOfStock
        ? 'Produkt aktualnie niedostępny (Currently unavailable)'
        : 'Brak aktywnej oferty w BuyBox (brak wysyłki lub wyboru sprzedawcy)',
      shipsToPoland: null,
      sellerName,
      fetchedAt,
      responseTimeMs,
      statusMessage: isExplicitlyOutOfStock
        ? 'Produkt niedostępny'
        : 'Brak oferty w BuyBox',
    };
  }

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

  let itemPrice = null;
  for (const sel of priceSelectors) {
    const firstEl = doc.querySelector(sel);
    const rawText = firstEl ? (firstEl.textContent || '').trim() : '';
    const parsed = parseLocalizedMoney(rawText);
    if (parsed !== null && parsed > 0) {
      const detectedCurrency = detectCurrencyInRawText(
        rawText,
        marketplace.currency,
      );
      itemPrice = normalizeAmountToMarketplaceCurrency(
        parsed,
        detectedCurrency,
        marketplace.currency,
      );
      break;
    }
  }

  if (itemPrice === null) {
    const whole = (
      doc.querySelector(
        '#corePriceDisplay_desktop_feature_div .a-price-whole, #corePrice_feature_div .a-price-whole',
      )?.textContent || ''
    ).replace(/[^\d]/g, '');
    const fraction = (
      doc.querySelector(
        '#corePriceDisplay_desktop_feature_div .a-price-fraction, #corePrice_feature_div .a-price-fraction',
      )?.textContent || ''
    ).replace(/[^\d]/g, '');
    const symbolText = (
      doc.querySelector(
        '#corePriceDisplay_desktop_feature_div .a-price-symbol, #corePrice_feature_div .a-price-symbol',
      )?.textContent || ''
    ).trim();

    if (whole) {
      const val = Number.parseFloat(`${whole}.${fraction || '00'}`);
      if (Number.isFinite(val) && val > 0) {
        const detectedCurrency = detectCurrencyInRawText(
          symbolText,
          marketplace.currency,
        );
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

  let shippingQuote = null;
  let shippingNote = null;
  let shipsToPoland = null;

  const glowLocationRaw = extractCleanTextFromDoc(
    doc,
    '#ContextualIngressPtLabel_deliveryShortLine, #glow-ingress-block',
  );
  const glowLocationClean = glowLocationRaw
    .replace(
      /Zaktualizuj lokalizację|Update location|Standort aktualisieren|Actualizar ubicación|Aggiorna posizione|Mettre à jour l'emplacement|Locatie bijwerken|Uppdatera plats/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();

  const csaDeliveryAttr = doc
    .querySelector(
      '#mir-layout-DELIVERY_BLOCK [data-csa-c-delivery-price], [data-csa-c-delivery-price]',
    )
    ?.getAttribute('data-csa-c-delivery-price');

  const deliveryBlockText = [
    extractCleanTextFromDoc(doc, '#mir-layout-DELIVERY_BLOCK'),
    extractCleanTextFromDoc(doc, '#deliveryBlockMessage'),
    extractCleanTextFromDoc(doc, '#price-shipping-message'),
    extractCleanTextFromDoc(
      doc,
      '#exports_desktop_qualifiedBuybox_tlc_feature_div',
    ),
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
        const detectedCurr = detectCurrencyInRawText(
          csaDeliveryAttr,
          marketplace.currency,
        );
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
        const detectedCurr = detectCurrencyInRawText(
          deliveryBlockText,
          marketplace.currency,
        );
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

function parseAodOffersDom(aodHtml, marketplace) {
  if (!aodHtml || aodHtml.length < 200) return null;
  const doc = new DOMParser().parseFromString(aodHtml, 'text/html');
  const offerEls = doc.querySelectorAll(
    '#aod-pinned-offer, #aod-offer-list #aod-offer, .aod-offer',
  );
  const candidates = [];

  for (const el of offerEls) {
    const rawPriceText = (
      el.querySelector('.a-price .a-offscreen, .aok-offscreen')?.textContent || ''
    ).trim();

    let itemPrice = null;
    const parsedPrice = parseLocalizedMoney(rawPriceText);
    if (parsedPrice !== null && parsedPrice > 0) {
      const detectedCurr = detectCurrencyInRawText(
        rawPriceText,
        marketplace.currency,
      );
      itemPrice = normalizeAmountToMarketplaceCurrency(
        parsedPrice,
        detectedCurr,
        marketplace.currency,
      );
    } else {
      const whole = (
        el.querySelector('.a-price-whole')?.textContent || ''
      ).replace(/[^\d]/g, '');
      const frac = (
        el.querySelector('.a-price-fraction')?.textContent || ''
      ).replace(/[^\d]/g, '');
      const sym = (
        el.querySelector('.a-price-symbol')?.textContent || ''
      ).trim();
      if (whole) {
        const val = Number.parseFloat(`${whole}.${frac || '00'}`);
        if (Number.isFinite(val) && val > 0) {
          const detectedCurr = detectCurrencyInRawText(
            sym,
            marketplace.currency,
          );
          itemPrice = normalizeAmountToMarketplaceCurrency(
            val,
            detectedCurr,
            marketplace.currency,
          );
        }
      }
    }

    if (itemPrice === null || itemPrice <= 0) continue;

    const csaDeliveryAttr = el
      .querySelector('[data-csa-c-delivery-price]')
      ?.getAttribute('data-csa-c-delivery-price');
    const deliveryBlockText = (
      el.querySelector('#mir-layout-DELIVERY_BLOCK, #deliveryBlockMessage')
        ?.textContent || ''
    )
      .replace(/\s+/g, ' ')
      .trim();

    let shippingQuote = null;
    let shipsToPoland = null;
    let shippingDetail = 'Dostawa wg koszyka';

    if (NO_SHIPPING_TO_DEST_PATTERNS.some((rx) => rx.test(deliveryBlockText))) {
      shipsToPoland = false;
      shippingDetail = 'Brak wysyłki do PL';
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
        shippingDetail = 'Darmowa dostawa';
      } else {
        const parsedShip = parseLocalizedMoney(csaDeliveryAttr);
        if (parsedShip !== null) {
          const detectedCurr = detectCurrencyInRawText(
            csaDeliveryAttr,
            marketplace.currency,
          );
          shippingQuote = normalizeAmountToMarketplaceCurrency(
            parsedShip,
            detectedCurr,
            marketplace.currency,
          );
          shipsToPoland = true;
          shippingDetail = `Dostawa: ${csaDeliveryAttr.trim()}`;
        }
      }
    }

    if (shippingQuote === null && shipsToPoland !== false && deliveryBlockText) {
      const lowerText = deliveryBlockText.toLowerCase();
      if (FREE_SHIPPING_WORDS.some((w) => lowerText.includes(w))) {
        shippingQuote = 0;
        shipsToPoland = true;
        shippingDetail = 'Darmowa dostawa';
      } else {
        const parsedFromBlock = parseLocalizedMoney(deliveryBlockText);
        if (parsedFromBlock !== null) {
          const detectedCurr = detectCurrencyInRawText(
            deliveryBlockText,
            marketplace.currency,
          );
          shippingQuote = normalizeAmountToMarketplaceCurrency(
            parsedFromBlock,
            detectedCurr,
            marketplace.currency,
          );
          shipsToPoland = true;
          shippingDetail = deliveryBlockText.slice(0, 55);
        }
      }
    }

    const sellerName =
      (
        el.querySelector(
          '#aod-offer-soldBy a.a-link-normal, #aod-offer-soldBy span.a-color-base',
        )?.textContent || ''
      )
        .replace(/\s+/g, ' ')
        .trim() ||
      (
        el.querySelector('#aod-offer-shipsFrom span.a-color-base')
          ?.textContent || ''
      )
        .replace(/\s+/g, ' ')
        .trim() ||
      null;

    candidates.push({
      itemPrice,
      shippingQuote,
      shippingDetail,
      shipsToPoland,
      sellerName,
    });
  }

  if (candidates.length === 0) return null;

  const shippable = candidates.filter((c) => c.shipsToPoland !== false);
  const pool = shippable.length > 0 ? shippable : candidates;

  pool.sort((a, b) => {
    const totalA = a.itemPrice + (a.shippingQuote ?? 0);
    const totalB = b.itemPrice + (b.shippingQuote ?? 0);
    return totalA - totalB;
  });

  const best = pool[0];
  const sellerLabel = best.sellerName
    ? `Marketplace: ${best.sellerName}`
    : 'Oferta Marketplace';
  const countLabel =
    candidates.length > 1 ? ` (najtańsza z ${candidates.length} ofert)` : '';

  return {
    itemPrice: best.itemPrice,
    shippingQuote: best.shippingQuote,
    shippingNote: `${sellerLabel}${countLabel} · ${best.shippingDetail}`,
    shipsToPoland: best.shipsToPoland,
    sellerName: best.sellerName
      ? `${best.sellerName} (Marketplace)`
      : 'Marketplace',
    offerCount: candidates.length,
  };
}

async function fetchSingleStoreOnAndroid(marketplace, asin, config) {
  const productUrl = `https://www.${marketplace.domain}/dp/${asin}?th=1&psc=1`;
  const startedAt = Date.now();

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await nativeHttpFetch(
      productUrl,
      marketplace.domain,
      marketplace.languageTag,
      config?.cookieHeader || '',
    );
    const responseTimeMs = Date.now() - startedAt;

    if (res.status === 404) {
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

    if (
      (res.status === 503 ||
        res.status === 429 ||
        res.status === 0 ||
        DOG_OR_ERROR_PAGE_PATTERNS.some((rx) => rx.test(res.body || '')) ||
        CAPTCHA_PATTERNS.some((rx) => rx.test(res.body || ''))) &&
      attempt === 0
    ) {
      await delay(650);
      continue;
    }

    if (res.status >= 500 || res.status === 0) {
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
        shippingNote: res.error
          ? `Nie udało się pobrać strony (${res.error})`
          : `Sklep tymczasowo odrzucił zapytanie (HTTP ${res.status})`,
        shipsToPoland: null,
        sellerName: null,
        fetchedAt: new Date().toISOString(),
        responseTimeMs,
        statusMessage: `Błąd połączenia (${res.status || 'sieć'})`,
      };
    }

    const htmlBody = res.body || '';
    const parsed = parseProductDom(
      htmlBody,
      marketplace,
      asin,
      responseTimeMs,
    );

    const hasAodDrawerInHtml =
      htmlBody.includes('all-offers-display-params') ||
      htmlBody.includes('buybox-see-all-buying-choices') ||
      htmlBody.includes('show-all-offers-display') ||
      htmlBody.includes('dynamic-aod-ingress-box');

    if (
      (parsed.status === 'out_of_stock' &&
        parsed.statusMessage === 'Brak oferty w BuyBox') ||
      (parsed.status === 'out_of_stock' && hasAodDrawerInHtml)
    ) {
      const aodUrl = `https://www.${marketplace.domain}/gp/product/ajax/aodAjaxMain/ref=dp_aod_unknown_mbc?asin=${asin}&pc=dp`;
      const aodRes = await nativeHttpFetch(
        aodUrl,
        marketplace.domain,
        marketplace.languageTag,
        config?.cookieHeader || '',
      );
      if (aodRes.status >= 200 && aodRes.status < 400 && aodRes.body) {
        const aodOffer = parseAodOffersDom(aodRes.body, marketplace);
        if (aodOffer) {
          return {
            ...parsed,
            productUrl: `${productUrl}&aod=1`,
            status: 'available',
            itemPrice: aodOffer.itemPrice,
            shippingQuote: aodOffer.shippingQuote,
            shippingNote: aodOffer.shippingNote,
            shipsToPoland: aodOffer.shipsToPoland,
            sellerName: aodOffer.sellerName,
            responseTimeMs: Date.now() - startedAt,
            statusMessage: undefined,
          };
        }
      }
    }

    return {
      ...parsed,
      productUrl,
    };
  }
}

export async function compareByAsinOnAndroid(asin, options, onEvent) {
  const cleanAsin = String(asin).trim().toUpperCase();
  const config = options?.config || {};
  const totalCount = MARKETPLACES.length;
  let completedCount = 0;

  onEvent({
    type: 'comparison_start',
    asin: cleanAsin,
    totalCount,
  });

  const exchangeRatesPromise = fetchExchangeRatesClient(config.customRates);
  const rawOffers = new Array(totalCount);
  const concurrency = 2;

  for (let i = 0; i < totalCount; i += concurrency) {
    const batch = MARKETPLACES.slice(i, i + concurrency);
    for (const marketplace of batch) {
      onEvent({
        type: 'store_start',
        marketplaceId: marketplace.id,
        domain: marketplace.domain,
        countryNamePl: marketplace.countryNamePl,
        completedCount,
        totalCount,
      });
    }

    const batchResults = await Promise.all(
      batch.map(async (marketplace, batchIdx) => {
        const globalIdx = i + batchIdx;
        const offer = await fetchSingleStoreOnAndroid(
          marketplace,
          cleanAsin,
          config,
        );
        completedCount += 1;
        onEvent({
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

    for (const { globalIdx, offer } of batchResults) {
      rawOffers[globalIdx] = offer;
    }

    if (i + concurrency < totalCount) {
      await delay(140);
    }
  }

  const exchangeRates = await exchangeRatesPromise;
  const anyLiveImage =
    rawOffers.find((o) => o?.imageUrl)?.imageUrl ?? options?.imageHint ?? null;
  const canonicalTitle =
    rawOffers.find((o) => o?.marketplaceId === 'PL' && o.title)?.title ||
    rawOffers.find((o) => o?.title)?.title ||
    options?.titleHint ||
    `Produkt Amazon (${cleanAsin})`;

  const fxSpreadPct =
    typeof config.fxSpreadPct === 'number' && Number.isFinite(config.fxSpreadPct)
      ? Math.max(0, Math.min(15, config.fxSpreadPct))
      : 0;

  const offers = rawOffers.map((o) => {
    const marketplace = MARKETPLACE_BY_ID[o.marketplaceId];
    const baseRate = exchangeRates.ratesToPln[o.currency] ?? 1.0;
    const spreadMult = o.currency === 'PLN' ? 1.0 : 1 + fxSpreadPct / 100;
    const effectiveExchangeRate = Number((baseRate * spreadMult).toFixed(4));
    const itemPricePln =
      o.itemPrice !== null
        ? Math.round(o.itemPrice * effectiveExchangeRate * 100) / 100
        : null;
    const shippingQuotePln =
      itemPricePln !== null &&
      o.shippingQuote !== null &&
      o.shipsToPoland !== false
        ? Math.round(o.shippingQuote * effectiveExchangeRate * 100) / 100
        : null;
    const landedPricePln =
      itemPricePln !== null && o.shipsToPoland !== false
        ? Math.round((itemPricePln + (shippingQuotePln ?? 0)) * 100) / 100
        : null;

    return {
      ...o,
      imageUrl: o.imageUrl ?? anyLiveImage,
      marketplace,
      baseExchangeRate: baseRate,
      effectiveExchangeRate,
      itemPricePln,
      shippingQuotePln,
      landedPricePln,
      deltaFromBestPln: null,
      deltaFromBestPct: null,
      deltaFromPolandStorePln: null,
      isBestLanded: false,
      isBestItemPrice: false,
    };
  });

  const report = {
    asin: cleanAsin,
    canonicalTitle,
    canonicalImageUrl: anyLiveImage,
    originDomain: options?.originDomain ?? null,
    queriedAt: new Date().toISOString(),
    fxSpreadPct,
    postalCode: config.postalCode || '00-001',
    exchangeRates,
    bestOffer: null,
    polishOffer: offers.find((r) => r.marketplaceId === 'PL') || null,
    maxSavingsVsPlStorePln: null,
    offers,
  };

  onEvent({
    type: 'comparison_complete',
    kind: 'comparison',
    report,
  });
}

export async function searchCandidatesOnAndroid(
  query,
  marketplaceId = 'PL',
  config,
  onEvent,
) {
  const marketplace = MARKETPLACE_BY_ID[marketplaceId] ?? MARKETPLACE_BY_ID.PL;
  onEvent({
    type: 'search_start',
    query,
    marketplaceId: marketplace.id,
  });

  const searchUrl = `https://www.${marketplace.domain}/s?k=${encodeURIComponent(query.trim())}`;
  const res = await nativeHttpFetch(
    searchUrl,
    marketplace.domain,
    marketplace.languageTag,
    config?.cookieHeader || '',
  );

  const candidates = [];
  const seenAsins = new Set();

  if (res.status === 200 && res.body) {
    const doc = new DOMParser().parseFromString(res.body, 'text/html');
    const items = doc.querySelectorAll(
      'div[data-component-type="s-search-result"][data-asin], div.s-result-item[data-asin]',
    );

    for (const el of items) {
      if (candidates.length >= 20) break;
      const asin = (el.getAttribute('data-asin') || '').trim().toUpperCase();
      if (!asin || asin.length !== 10 || seenAsins.has(asin)) continue;

      const imgEl = el.querySelector('img.s-image');
      const title =
        (el.querySelector('h2 span')?.textContent || '').trim() ||
        (el.querySelector('h2')?.textContent || '').trim() ||
        (imgEl?.getAttribute('alt') || '').trim();
      if (!title) continue;

      seenAsins.add(asin);

      let imageUrl = imgEl?.getAttribute('src')?.trim() || null;
      if (!imageUrl) {
        const srcset = imgEl?.getAttribute('srcset')?.trim();
        if (srcset) {
          imageUrl = srcset.split(',')[0]?.trim().split(/\s+/)[0] || null;
        }
      }

      const rawPrice = (
        el.querySelector('.a-price .a-offscreen')?.textContent || ''
      ).trim();
      const previewPrice = parseLocalizedMoney(rawPrice);
      const rating =
        (el.querySelector('span.a-icon-alt')?.textContent || '').trim() || null;
      const reviewCount =
        (
          el.querySelector('span.a-size-base.s-underline-text')?.textContent ||
          el.querySelector('a[href*="#customerReviews"] span')?.textContent ||
          ''
        ).trim() || null;

      candidates.push({
        asin,
        title,
        imageUrl,
        previewPrice,
        currency: marketplace.currency,
        previewPriceFormatted: rawPrice || null,
        rating,
        reviewCount,
        productUrl: `https://www.${marketplace.domain}/dp/${asin}`,
        marketplaceId: marketplace.id,
      });
    }
  }

  const searchResult = {
    candidates,
    source: 'LIVE',
    notice:
      candidates.length === 0
        ? `Nie udało się pobrać listy wyników dla „${query}” z ${marketplace.domain}. Wklej bezpośredni link do produktu lub kod ASIN.`
        : undefined,
  };

  onEvent({
    type: 'candidates_complete',
    kind: 'candidates',
    resolved: { kind: 'keyword', query },
    searchResult,
  });
}
