const state = {
  currentReport: null,
  sortMode: 'landed', // 'landed' | 'item' | 'country'
  manualOverrides: new Map(), // key: marketplaceId -> { itemPrice?: number, shippingQuote?: number }
  hasCustomRateOverride: false,
  lastCandidateQuery: '',
  lastCandidateCount: 0,
  selectedCandidate: null,
};

const dom = {
  form: document.getElementById('resolve-form'),
  queryInput: document.getElementById('product-query-input'),
  queryError: document.getElementById('query-input-error'),
  originSelect: document.getElementById('search-origin-select'),
  submitBtn: document.getElementById('resolve-submit-btn'),
  postalCodeInput: document.getElementById('postal-code-input'),
  cookieHeaderInput: document.getElementById('cookie-header-input'),

  scrapeProgressPanel: document.getElementById('scrape-progress-panel'),
  scrapeProgressTitle: document.getElementById('scrape-progress-title'),
  scrapeProgressCounter: document.getElementById('scrape-progress-counter'),
  scrapeProgressTrack: document.getElementById('scrape-progress-track'),
  scrapeProgressFill: document.getElementById('scrape-progress-fill'),
  scrapeMarketChips: document.getElementById('scrape-market-chips'),

  rateEurInput: document.getElementById('rate-eur-input'),
  rateGbpInput: document.getElementById('rate-gbp-input'),
  rateSekInput: document.getElementById('rate-sek-input'),
  fxSourceBadge: document.getElementById('fx-source-badge'),
  fxDateLabel: document.getElementById('fx-date-label'),

  candidatesSection: document.getElementById('candidates-section'),
  candidatesHeading: document.getElementById('candidates-heading'),
  candidatesSubtitle: document.getElementById('candidates-subtitle'),
  candidatesCollapsibleBody: document.getElementById(
    'candidates-collapsible-body',
  ),
  candidatesNotice: document.getElementById('candidates-notice'),
  candidatesGrid: document.getElementById('candidates-grid'),
  toggleCandidatesBtn: document.getElementById('toggle-candidates-btn'),
  toggleCandidatesLabel: document.getElementById('toggle-candidates-label'),
  closeCandidatesBtn: document.getElementById('close-candidates-btn'),

  comparisonSection: document.getElementById('comparison-section'),
  comparisonHeading: document.getElementById('comparison-heading'),
  activeProductImage: document.getElementById('active-product-image'),
  activeAsinBadge: document.getElementById('active-asin-badge'),
  activeOriginBadge: document.getElementById('active-origin-badge'),
  activeTimestampBadge: document.getElementById('active-timestamp-badge'),

  verdictBestPrice: document.getElementById('verdict-best-price'),
  verdictBestStore: document.getElementById('verdict-best-store'),
  verdictBestItem: document.getElementById('verdict-best-item'),
  verdictBestItemStore: document.getElementById('verdict-best-item-store'),
  verdictPlDelta: document.getElementById('verdict-pl-delta'),
  verdictPlSub: document.getElementById('verdict-pl-sub'),

  comparisonTbody: document.getElementById('comparison-tbody'),
  resetOverridesBtn: document.getElementById('reset-overrides-btn'),
};

function formatPln(amount) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '—';
  }
  return `${amount.toFixed(2).replace('.', ',')} zł`;
}

function formatNative(amount, symbol) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '—';
  }
  const formatted = amount.toFixed(2).replace('.', ',');
  return symbol === '£' ? `£${amount.toFixed(2)}` : `${formatted} ${symbol}`;
}

function buildFallbackCoverDataUri(asin, title) {
  const shortAsin = String(asin || 'ASIN').slice(0, 10);
  const initials = String(title || 'AMZ')
    .replace(/[^A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż ]/g, '')
    .trim()
    .slice(0, 14);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="156" viewBox="0 0 120 156"><rect width="120" height="156" fill="#eef2f6"/><rect x="6" y="6" width="108" height="144" rx="4" fill="#ffffff" stroke="#141923" stroke-width="1.5"/><rect x="14" y="16" width="92" height="20" rx="2" fill="#141923"/><text x="60" y="30" fill="#7be0ad" font-family="monospace" font-size="10" font-weight="700" text-anchor="middle">${shortAsin}</text><text x="60" y="84" fill="#334155" font-family="sans-serif" font-size="11" font-weight="600" text-anchor="middle">${initials}</text><line x1="24" y1="114" x2="96" y2="114" stroke="#bf4520" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function getSelectedSpreadPct() {
  const checked = document.querySelector('input[name="fxSpreadPct"]:checked');
  const val = Number.parseFloat(checked ? checked.value : '0');
  return Number.isFinite(val) ? val : 0;
}

function getCustomRatesFromInputs() {
  const parseRate = (el) => {
    const val = Number.parseFloat(String(el.value).replace(',', '.'));
    return Number.isFinite(val) && val > 0 ? val : undefined;
  };
  return {
    PLN: 1.0,
    EUR: parseRate(dom.rateEurInput) ?? 4.3185,
    GBP: parseRate(dom.rateGbpInput) ?? 5.149,
    SEK: parseRate(dom.rateSekInput) ?? 0.3782,
  };
}

function getSessionConfig() {
  return {
    postalCode: dom.postalCodeInput.value.trim() || '00-001',
    cookieHeader: dom.cookieHeaderInput.value.trim() || undefined,
    fxSpreadPct: getSelectedSpreadPct(),
    customRates: state.hasCustomRateOverride
      ? getCustomRatesFromInputs()
      : undefined,
  };
}

function initScrapeProgress(mode, labelText) {
  if (!dom.scrapeProgressPanel) return;
  dom.scrapeProgressPanel.hidden = false;
  dom.scrapeProgressPanel.classList.remove('is-finished');
  dom.scrapeProgressTitle.textContent = labelText;

  if (mode === 'search') {
    dom.scrapeProgressCounter.textContent = 'Wyszukiwanie…';
    dom.scrapeProgressTrack.setAttribute('aria-valuenow', '3');
    dom.scrapeProgressFill.style.width = '35%';
    dom.scrapeMarketChips.hidden = true;
    return;
  }

  dom.scrapeMarketChips.hidden = false;
  dom.scrapeProgressCounter.textContent = '0 / 9 (0%)';
  dom.scrapeProgressTrack.setAttribute('aria-valuenow', '0');
  dom.scrapeProgressFill.style.width = '0%';

  const defaultLabels = {
    PL: 'PL · amazon.pl',
    DE: 'DE · amazon.de',
    ES: 'ES · amazon.es',
    IT: 'IT · amazon.it',
    FR: 'FR · amazon.fr',
    NL: 'NL · amazon.nl',
    BE: 'BE · amazon.com.be',
    SE: 'SE · amazon.se',
    UK: 'UK · amazon.co.uk',
  };

  dom.scrapeMarketChips.querySelectorAll('.scrape-chip').forEach((chip) => {
    const id = chip.getAttribute('data-market');
    chip.className = 'scrape-chip';
    chip.textContent = defaultLabels[id] || id;
  });
}

const MARKETPLACE_META = {
  PL: { id: 'PL', domain: 'amazon.pl', countryNamePl: 'Polska', currency: 'PLN', currencySymbol: 'zł', regionGroup: 'EU' },
  DE: { id: 'DE', domain: 'amazon.de', countryNamePl: 'Niemcy', currency: 'EUR', currencySymbol: '€', regionGroup: 'EU' },
  ES: { id: 'ES', domain: 'amazon.es', countryNamePl: 'Hiszpania', currency: 'EUR', currencySymbol: '€', regionGroup: 'EU' },
  IT: { id: 'IT', domain: 'amazon.it', countryNamePl: 'Włochy', currency: 'EUR', currencySymbol: '€', regionGroup: 'EU' },
  FR: { id: 'FR', domain: 'amazon.fr', countryNamePl: 'Francja', currency: 'EUR', currencySymbol: '€', regionGroup: 'EU' },
  NL: { id: 'NL', domain: 'amazon.nl', countryNamePl: 'Holandia', currency: 'EUR', currencySymbol: '€', regionGroup: 'EU' },
  BE: { id: 'BE', domain: 'amazon.com.be', countryNamePl: 'Belgia', currency: 'EUR', currencySymbol: '€', regionGroup: 'EU' },
  SE: { id: 'SE', domain: 'amazon.se', countryNamePl: 'Szwecja', currency: 'SEK', currencySymbol: 'kr', regionGroup: 'EU' },
  UK: { id: 'UK', domain: 'amazon.co.uk', countryNamePl: 'Wielka Brytania', currency: 'GBP', currencySymbol: '£', regionGroup: 'UK' },
};

function handleProgressEvent(ev) {
  if (!dom.scrapeProgressPanel) return;

  if (ev.type === 'comparison_start') {
    if (dom.comparisonSection) {
      dom.comparisonSection.hidden = false;
    }
    initScrapeProgress(
      'comparison',
      `Pobieranie rzeczywistych ofert i dostępności dla ASIN ${ev.asin} z 9 sklepów Amazon…`,
    );
    state.currentReport = {
      asin: ev.asin,
      canonicalTitle: `Pobieranie danych produktu (${ev.asin})…`,
      canonicalImageUrl: null,
      originDomain: null,
      queriedAt: new Date().toISOString(),
      fxSpreadPct: getSelectedSpreadPct(),
      postalCode: dom.postalCodeInput.value.trim() || '00-001',
      exchangeRates: null,
      bestOffer: null,
      polishOffer: null,
      maxSavingsVsPlStorePln: 0,
      offers: [],
    };
    recalculateReportClientSide();
    return;
  }

  if (ev.type === 'search_start') {
    initScrapeProgress(
      'search',
      `Przeszukiwanie katalogu Amazon (${ev.marketplaceId}) dla frazy „${ev.query}”…`,
    );
    return;
  }

  if (ev.type === 'store_start') {
    const chip = dom.scrapeMarketChips?.querySelector(
      `.scrape-chip[data-market="${ev.marketplaceId}"]`,
    );
    if (chip) {
      chip.className = 'scrape-chip is-loading';
      chip.textContent = `${ev.marketplaceId} · Pobieranie…`;
    }
    dom.scrapeProgressTitle.textContent = `Sprawdzanie dostępności i ceny w ${ev.domain} (${ev.countryNamePl})…`;
    return;
  }

  if (ev.type === 'store_done') {
    const pct = Math.round((ev.completedCount / ev.totalCount) * 100);
    dom.scrapeProgressCounter.textContent = `${ev.completedCount} / ${ev.totalCount} (${pct}%)`;
    dom.scrapeProgressTrack.setAttribute(
      'aria-valuenow',
      String(ev.completedCount),
    );
    dom.scrapeProgressFill.style.width = `${pct}%`;

    const chip = dom.scrapeMarketChips?.querySelector(
      `.scrape-chip[data-market="${ev.marketplaceId}"]`,
    );
    if (chip) {
      const offer = ev.offer;
      if (offer.status === 'available' && offer.itemPrice !== null) {
        chip.className = 'scrape-chip is-available';
        const sym =
          offer.currency === 'PLN'
            ? 'zł'
            : offer.currency === 'EUR'
              ? '€'
              : offer.currency === 'GBP'
                ? '£'
                : 'kr';
        chip.textContent = `${ev.marketplaceId} ✓ ${formatNative(offer.itemPrice, sym)}`;
      } else if (offer.status === 'not_found') {
        chip.className = 'scrape-chip is-unavailable';
        chip.textContent = `${ev.marketplaceId} · Brak (404)`;
      } else {
        chip.className = 'scrape-chip is-unavailable';
        chip.textContent = `${ev.marketplaceId} · Niedostępny`;
      }
    }

    if (state.currentReport && ev.offer) {
      const meta = MARKETPLACE_META[ev.marketplaceId];
      if (meta) {
        const existingIdx = state.currentReport.offers.findIndex(
          (r) => r.marketplaceId === ev.marketplaceId,
        );
        const partialRow = {
          ...ev.offer,
          marketplace: meta,
        };
        if (existingIdx !== -1) {
          state.currentReport.offers[existingIdx] = partialRow;
        } else {
          state.currentReport.offers.push(partialRow);
        }
        if (
          ev.offer.title &&
          (ev.marketplaceId === 'PL' ||
            state.currentReport.canonicalTitle.startsWith('Pobieranie'))
        ) {
          state.currentReport.canonicalTitle = ev.offer.title;
        }
        if (ev.offer.imageUrl && !state.currentReport.canonicalImageUrl) {
          state.currentReport.canonicalImageUrl = ev.offer.imageUrl;
        }
        recalculateReportClientSide();
      }
    }
  }
}

function finishScrapeProgress(summaryText) {
  if (!dom.scrapeProgressPanel) return;
  dom.scrapeProgressPanel.classList.add('is-finished');
  dom.scrapeProgressTitle.textContent = summaryText;
  dom.scrapeProgressFill.style.width = '100%';
  dom.scrapeProgressTrack.setAttribute('aria-valuenow', '9');
}

function updateFxBanner(exchangeRates) {
  if (!exchangeRates) return;
  dom.fxSourceBadge.textContent =
    exchangeRates.source === 'NBP_API'
      ? `NBP ${exchangeRates.tableNumber}`
      : exchangeRates.source === 'CUSTOM'
        ? 'Kurs własny / NBP'
        : 'NBP Tabela A (awaryjna)';
  dom.fxDateLabel.textContent = `Data tabeli: ${exchangeRates.effectiveDate}`;

  if (exchangeRates.ratesToPln) {
    if (exchangeRates.ratesToPln.EUR) {
      dom.rateEurInput.value = Number(exchangeRates.ratesToPln.EUR).toFixed(4);
    }
    if (exchangeRates.ratesToPln.GBP) {
      dom.rateGbpInput.value = Number(exchangeRates.ratesToPln.GBP).toFixed(4);
    }
    if (exchangeRates.ratesToPln.SEK) {
      dom.rateSekInput.value = Number(exchangeRates.ratesToPln.SEK).toFixed(4);
    }
  }
}

function recalculateReportClientSide() {
  if (!state.currentReport) return;

  const rates = getCustomRatesFromInputs();
  const spreadPct = getSelectedSpreadPct();

  const updatedOffers = state.currentReport.offers.map((origRow) => {
    const override = state.manualOverrides.get(origRow.marketplaceId) || {};
    const itemPrice =
      override.itemPrice !== undefined ? override.itemPrice : origRow.itemPrice;
    const shippingQuote =
      override.shippingQuote !== undefined
        ? override.shippingQuote
        : origRow.shippingQuote;

    const baseRate = rates[origRow.currency] ?? 1.0;
    const spreadMult = origRow.currency === 'PLN' ? 1.0 : 1 + spreadPct / 100;
    const effectiveExchangeRate = Number((baseRate * spreadMult).toFixed(4));

    const itemPricePln =
      itemPrice !== null && Number.isFinite(itemPrice)
        ? Math.round(itemPrice * effectiveExchangeRate * 100) / 100
        : null;

    const shippingQuotePln =
      itemPricePln !== null &&
      shippingQuote !== null &&
      Number.isFinite(shippingQuote) &&
      origRow.shipsToPoland !== false
        ? Math.round(shippingQuote * effectiveExchangeRate * 100) / 100
        : null;

    const landedPricePln =
      itemPricePln !== null && origRow.shipsToPoland !== false
        ? Math.round((itemPricePln + (shippingQuotePln ?? 0)) * 100) / 100
        : null;

    return {
      ...origRow,
      status: itemPrice !== null ? 'available' : origRow.status,
      itemPrice,
      shippingQuote,
      baseExchangeRate: baseRate,
      effectiveExchangeRate,
      itemPricePln,
      shippingQuotePln,
      landedPricePln,
    };
  });

  const availableWithLanded = updatedOffers.filter(
    (r) => r.landedPricePln !== null,
  );
  const minLanded =
    availableWithLanded.length > 0
      ? Math.min(...availableWithLanded.map((r) => r.landedPricePln))
      : null;
  const minItem =
    availableWithLanded.length > 0
      ? Math.min(...availableWithLanded.map((r) => r.itemPricePln))
      : null;

  const plRow = updatedOffers.find((r) => r.marketplaceId === 'PL') || null;
  const plLanded = plRow ? plRow.landedPricePln : null;

  let bestMarked = false;
  let bestItemMarked = false;

  const enriched = updatedOffers.map((row) => {
    const isBestLanded =
      !bestMarked &&
      minLanded !== null &&
      row.landedPricePln !== null &&
      Math.abs(row.landedPricePln - minLanded) < 0.005;
    if (isBestLanded) bestMarked = true;

    const isBestItemPrice =
      !bestItemMarked &&
      minItem !== null &&
      row.itemPricePln !== null &&
      Math.abs(row.itemPricePln - minItem) < 0.005;
    if (isBestItemPrice) bestItemMarked = true;

    const deltaFromBestPln =
      minLanded !== null && row.landedPricePln !== null
        ? Math.round((row.landedPricePln - minLanded) * 100) / 100
        : null;

    const deltaFromBestPct =
      minLanded !== null && minLanded > 0 && deltaFromBestPln !== null
        ? Math.round((deltaFromBestPln / minLanded) * 1000) / 10
        : null;

    const deltaFromPolandStorePln =
      plLanded !== null && row.landedPricePln !== null
        ? Math.round((row.landedPricePln - plLanded) * 100) / 100
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

  enriched.sort((a, b) => {
    if (state.sortMode === 'country') {
      return a.marketplace.countryNamePl.localeCompare(
        b.marketplace.countryNamePl,
        'pl',
      );
    }
    if (state.sortMode === 'item') {
      if (a.itemPricePln !== null && b.itemPricePln !== null) {
        return a.itemPricePln - b.itemPricePln;
      }
      if (a.itemPricePln !== null) return -1;
      if (b.itemPricePln !== null) return 1;
      return 0;
    }
    // Default: 'landed'
    if (a.landedPricePln !== null && b.landedPricePln !== null) {
      return a.landedPricePln - b.landedPricePln;
    }
    if (a.landedPricePln !== null) return -1;
    if (b.landedPricePln !== null) return 1;
    return 0;
  });

  renderComparisonReport({
    ...state.currentReport,
    fxSpreadPct: spreadPct,
    offers: enriched,
    bestOffer: enriched.find((r) => r.isBestLanded) || null,
    polishOffer: enriched.find((r) => r.marketplaceId === 'PL') || null,
  });
}

function renderComparisonReport(report) {
  dom.comparisonHeading.textContent = report.canonicalTitle;
  const fallbackImg = buildFallbackCoverDataUri(
    report.asin,
    report.canonicalTitle,
  );
  if (dom.activeProductImage) {
    dom.activeProductImage.src = report.canonicalImageUrl || fallbackImg;
    dom.activeProductImage.alt = `Zdjęcie produktu: ${report.canonicalTitle}`;
    dom.activeProductImage.onerror = () => {
      dom.activeProductImage.onerror = null;
      dom.activeProductImage.src = fallbackImg;
    };
  }
  dom.activeAsinBadge.textContent = `ASIN: ${report.asin}`;
  dom.activeOriginBadge.textContent = report.originDomain
    ? `Źródło: ${report.originDomain}`
    : 'Zakres: 9 rynków UE + UK';

  const timeStr = new Date(report.queriedAt).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  dom.activeTimestampBadge.textContent = `Odczyt: ${timeStr} · Kod PL: ${report.postalCode}`;

  const best = report.bestOffer;
  const bestItemRow =
    report.offers.find((r) => r.isBestItemPrice) || report.bestOffer;
  const plRow = report.polishOffer;

  if (best && best.landedPricePln !== null) {
    dom.verdictBestPrice.textContent = formatPln(best.landedPricePln);
    const shipInfo =
      best.shippingQuotePln !== null
        ? `w tym dostawa ${formatPln(best.shippingQuotePln)}`
        : 'dostawa liczona w koszyku';
    dom.verdictBestStore.textContent = `${best.marketplace.countryNamePl} (${best.domain}) · ${shipInfo}`;
  } else {
    dom.verdictBestPrice.textContent = 'Brak aktywnej oferty';
    dom.verdictBestStore.textContent =
      'Produkt niedostępny w BuyBox we wszystkich sklepach';
  }

  if (bestItemRow && bestItemRow.itemPricePln !== null) {
    dom.verdictBestItem.textContent = `${formatPln(bestItemRow.itemPricePln)} (${formatNative(bestItemRow.itemPrice, bestItemRow.marketplace.currencySymbol)})`;
    dom.verdictBestItemStore.textContent = `${bestItemRow.marketplace.countryNamePl} (${bestItemRow.domain})`;
  } else {
    dom.verdictBestItem.textContent = '—';
    dom.verdictBestItemStore.textContent = '—';
  }

  if (
    best &&
    plRow &&
    best.landedPricePln !== null &&
    plRow.landedPricePln !== null
  ) {
    const diff =
      Math.round((plRow.landedPricePln - best.landedPricePln) * 100) / 100;
    if (diff > 0.05) {
      dom.verdictPlDelta.textContent = `Oszczędzasz ${formatPln(diff)} vs amazon.pl`;
      dom.verdictPlSub.textContent = `Zakup w ${best.domain} jest tańszy niż na amazon.pl (${formatPln(plRow.landedPricePln)})`;
    } else {
      dom.verdictPlDelta.textContent =
        'amazon.pl najkorzystniejszy z dostawą';
      dom.verdictPlSub.textContent =
        bestItemRow && bestItemRow.marketplaceId !== 'PL'
          ? `Choć sam produkt w ${bestItemRow.domain} kosztuje ${formatPln(bestItemRow.itemPricePln)}, niższa dostawa w PL wygrywa.`
          : 'Polski sklep oferuje najniższą cenę całkowitą.';
    }
  } else {
    dom.verdictPlDelta.textContent = 'Porównanie międzynarodowe';
    dom.verdictPlSub.textContent =
      'Poniżej widoczne są wyłącznie rzeczywiste oferty pobrane ze stron Amazon';
  }

  dom.resetOverridesBtn.hidden = state.manualOverrides.size === 0;

  dom.comparisonTbody.replaceChildren();

  report.offers.forEach((row) => {
    const tr = document.createElement('tr');
    if (row.isBestLanded) {
      tr.classList.add('is-best-row');
    }

    const isAvailableWithPrice =
      row.itemPrice !== null && Number.isFinite(row.itemPrice);

    // 1. Store / Country header cell
    const th = document.createElement('th');
    th.scope = 'row';

    const storeInner = document.createElement('div');
    storeInner.className = 'store-cell-inner';

    const rowThumb = document.createElement('img');
    rowThumb.className = 'table-row-thumb';
    rowThumb.width = 40;
    rowThumb.height = 52;
    rowThumb.loading = 'lazy';
    rowThumb.alt = '';
    rowThumb.src = row.imageUrl || report.canonicalImageUrl || fallbackImg;
    rowThumb.onerror = () => {
      rowThumb.onerror = null;
      rowThumb.src = fallbackImg;
    };

    const badge = document.createElement('span');
    badge.className = 'country-code-badge';
    badge.textContent = row.marketplace.id;

    const meta = document.createElement('div');
    meta.className = 'store-meta';

    const domainRow = document.createElement('div');
    domainRow.className = 'store-domain-row';

    const domainSpan = document.createElement('span');
    domainSpan.className = 'store-domain';
    domainSpan.textContent = row.domain;

    const regionTag = document.createElement('span');
    regionTag.className = 'region-tag';
    regionTag.textContent =
      row.marketplace.regionGroup === 'UK' ? 'UK (Import)' : 'UE';

    domainRow.append(domainSpan, regionTag);

    const countryName = document.createElement('span');
    countryName.className = 'store-country-name';
    countryName.textContent = row.marketplace.countryNamePl;

    meta.append(domainRow, countryName);

    if (row.isBestLanded) {
      const winBadge = document.createElement('span');
      winBadge.className = 'winner-badge';
      winBadge.textContent = '#1 NAJNIŻSZA CENA Z DOSTAWĄ';
      meta.appendChild(winBadge);
    } else if (row.isBestItemPrice) {
      const itemBadge = document.createElement('span');
      itemBadge.className = 'winner-badge';
      itemBadge.textContent = 'NAJTAŃSZY SAM PRODUKT';
      meta.appendChild(itemBadge);
    }

    storeInner.append(rowThumb, badge, meta);
    th.appendChild(storeInner);

    // 2. Native ItemPrice cell
    const tdNativePrice = document.createElement('td');
    tdNativePrice.className = 'num-cell';

    if (isAvailableWithPrice) {
      const priceEditorWrap = document.createElement('div');
      priceEditorWrap.className = 'inline-money-editor';

      const priceInput = document.createElement('input');
      priceInput.type = 'text';
      priceInput.inputMode = 'decimal';
      priceInput.className = 'inline-money-input';
      priceInput.setAttribute(
        'aria-label',
        `Cena produktu w ${row.domain} (${row.currency})`,
      );
      priceInput.value = row.itemPrice.toFixed(2);

      priceInput.addEventListener('change', () => {
        const parsed = Number.parseFloat(priceInput.value.replace(',', '.'));
        const prev = state.manualOverrides.get(row.marketplaceId) || {};
        if (Number.isFinite(parsed) && parsed >= 0) {
          state.manualOverrides.set(row.marketplaceId, {
            ...prev,
            itemPrice: parsed,
          });
        }
        recalculateReportClientSide();
      });

      const currSuffix = document.createElement('span');
      currSuffix.className = 'currency-suffix';
      currSuffix.textContent = row.marketplace.currencySymbol;

      priceEditorWrap.append(priceInput, currSuffix);
      tdNativePrice.appendChild(priceEditorWrap);

      const rateSub = document.createElement('span');
      rateSub.className = 'sub-rate-note';
      rateSub.textContent =
        row.currency === 'PLN'
          ? 'Waluta bazowa PLN'
          : `1 ${row.currency} = ${row.effectiveExchangeRate.toFixed(4)} zł`;
      tdNativePrice.appendChild(rateSub);
    } else {
      const statusPill = document.createElement('span');
      statusPill.className =
        row.status === 'not_found'
          ? 'status-pill-not-found'
          : 'status-pill-unavailable';
      statusPill.textContent =
        row.status === 'not_found'
          ? 'Brak w katalogu (404)'
          : row.status === 'captcha_blocked'
            ? 'Wymagana CAPTCHA'
            : 'Niedostępny w BuyBox';
      tdNativePrice.appendChild(statusPill);

      const manualBtn = document.createElement('button');
      manualBtn.type = 'button';
      manualBtn.className = 'manual-price-trigger-btn';
      manualBtn.textContent = '+ Wpisz cenę ręcznie';
      manualBtn.addEventListener('click', () => {
        state.manualOverrides.set(row.marketplaceId, {
          itemPrice: 0,
          shippingQuote: 0,
        });
        recalculateReportClientSide();
      });
      tdNativePrice.appendChild(manualBtn);
    }

    // 3. ItemPrice in PLN
    const tdItemPln = document.createElement('td');
    tdItemPln.className = 'num-cell';
    const itemPlnSpan = document.createElement('span');
    itemPlnSpan.className = 'pln-amount';
    itemPlnSpan.textContent = formatPln(row.itemPricePln);
    tdItemPln.appendChild(itemPlnSpan);

    // 4. ShippingQuote to Poland (only editable when product has an active price)
    const tdShipping = document.createElement('td');
    tdShipping.className = 'num-cell';

    if (isAvailableWithPrice) {
      const shipEditorWrap = document.createElement('div');
      shipEditorWrap.className = 'inline-money-editor';

      const shipInput = document.createElement('input');
      shipInput.type = 'text';
      shipInput.inputMode = 'decimal';
      shipInput.className = 'inline-money-input';
      shipInput.setAttribute(
        'aria-label',
        `Koszt dostawy do Polski z ${row.domain} (${row.currency})`,
      );
      shipInput.value =
        row.shippingQuote !== null && Number.isFinite(row.shippingQuote)
          ? row.shippingQuote.toFixed(2)
          : '';
      shipInput.placeholder = 'Koszyk';

      shipInput.addEventListener('change', () => {
        const parsed = Number.parseFloat(shipInput.value.replace(',', '.'));
        const prev = state.manualOverrides.get(row.marketplaceId) || {};
        if (Number.isFinite(parsed) && parsed >= 0) {
          state.manualOverrides.set(row.marketplaceId, {
            ...prev,
            shippingQuote: parsed,
          });
        }
        recalculateReportClientSide();
      });

      const shipSuffix = document.createElement('span');
      shipSuffix.className = 'currency-suffix';
      shipSuffix.textContent = row.marketplace.currencySymbol;

      shipEditorWrap.append(shipInput, shipSuffix);
      tdShipping.appendChild(shipEditorWrap);

      const shipSub = document.createElement('span');
      shipSub.className = 'sub-rate-note';
      shipSub.textContent =
        row.shippingQuote === 0
          ? `Darmowa dostawa (0,00 zł) · ${row.shippingNote || ''}`
          : row.shippingQuote !== null
            ? `≈ ${formatPln(row.shippingQuotePln)} · ${row.shippingNote || ''}`
            : row.shippingNote || 'Koszt dostawy podawany w koszyku';
      tdShipping.appendChild(shipSub);
    } else {
      const shipDash = document.createElement('span');
      shipDash.className = 'pln-amount';
      shipDash.textContent = '—';
      tdShipping.appendChild(shipDash);

      const shipSub = document.createElement('span');
      shipSub.className = 'sub-rate-note';
      shipSub.textContent =
        row.shippingNote || 'Produkt aktualnie niedostępny w tym sklepie';
      tdShipping.appendChild(shipSub);
    }

    // 5. LandedPrice Total in PLN + Composition Bar
    const tdLanded = document.createElement('td');
    tdLanded.className = 'num-cell';

    const landedSpan = document.createElement('span');
    landedSpan.className = 'landed-total-amount';
    landedSpan.textContent = formatPln(row.landedPricePln);
    tdLanded.appendChild(landedSpan);

    if (row.landedPricePln && row.landedPricePln > 0) {
      const compBar = document.createElement('div');
      compBar.className = 'composition-bar';
      const itemSharePct = Math.min(
        100,
        Math.round(((row.itemPricePln ?? 0) / row.landedPricePln) * 100),
      );
      const shipSharePct = Math.max(0, 100 - itemSharePct);

      const itemSeg = document.createElement('div');
      itemSeg.className = 'comp-item-segment';
      itemSeg.style.width = `${itemSharePct}%`;

      const shipSeg = document.createElement('div');
      shipSeg.className = 'comp-ship-segment';
      shipSeg.style.width = `${shipSharePct}%`;

      compBar.append(itemSeg, shipSeg);
      tdLanded.appendChild(compBar);
    }

    // 6. Delta vs Best & vs PL
    const tdDelta = document.createElement('td');
    tdDelta.className = 'num-cell';

    const deltaPill = document.createElement('span');
    if (row.isBestLanded) {
      deltaPill.className = 'delta-pill delta-best';
      deltaPill.textContent = 'NAJTAŃSZY (0,00 zł)';
    } else if (row.deltaFromBestPln !== null) {
      deltaPill.className = 'delta-pill delta-higher';
      const sign = row.deltaFromBestPln > 0 ? '+' : '';
      deltaPill.textContent = `${sign}${formatPln(row.deltaFromBestPln)} (${sign}${row.deltaFromBestPct?.toFixed(1).replace('.', ',')}%)`;
    } else {
      deltaPill.className = 'delta-pill delta-higher';
      deltaPill.textContent = '—';
    }
    tdDelta.appendChild(deltaPill);

    if (row.marketplaceId !== 'PL' && row.deltaFromPolandStorePln !== null) {
      const plNote = document.createElement('span');
      plNote.className = 'pl-comparison-note';
      if (row.deltaFromPolandStorePln < -0.05) {
        plNote.textContent = `Taniej o ${formatPln(Math.abs(row.deltaFromPolandStorePln))} niż w PL`;
      } else if (row.deltaFromPolandStorePln > 0.05) {
        plNote.textContent = `Drożej o ${formatPln(row.deltaFromPolandStorePln)} niż w PL`;
      } else {
        plNote.textContent = 'Tyle samo co w PL';
      }
      tdDelta.appendChild(plNote);
    }

    // 7. Direct Action Link
    const tdAction = document.createElement('td');
    tdAction.className = 'action-cell';

    const link = document.createElement('a');
    link.href = row.productUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className =
      row.status === 'not_found'
        ? 'store-outbound-link is-muted-link'
        : 'store-outbound-link';
    link.textContent =
      row.status === 'not_found'
        ? `Sprawdź ${row.domain} (404) ↗`
        : `Otwórz ${row.domain} ↗`;

    tdAction.appendChild(link);

    tr.append(
      th,
      tdNativePrice,
      tdItemPln,
      tdShipping,
      tdLanded,
      tdDelta,
      tdAction,
    );
    dom.comparisonTbody.appendChild(tr);
  });
}

function setCandidatesCollapsed(collapsed, selectedCandidate = state.selectedCandidate) {
  if (!dom.candidatesSection) return;
  if (selectedCandidate !== undefined) {
    state.selectedCandidate = selectedCandidate;
  }

  dom.candidatesSection.classList.toggle('is-collapsed', collapsed);

  if (dom.toggleCandidatesBtn) {
    dom.toggleCandidatesBtn.setAttribute('aria-expanded', String(!collapsed));
  }
  if (dom.toggleCandidatesLabel) {
    dom.toggleCandidatesLabel.textContent = collapsed
      ? `Rozwiń listę wyników (${state.lastCandidateCount})`
      : 'Zwiń listę wyników';
  }
  if (dom.candidatesCollapsibleBody) {
    dom.candidatesCollapsibleBody.inert = collapsed;
    dom.candidatesCollapsibleBody.setAttribute(
      'aria-hidden',
      String(collapsed),
    );
  }

  if (collapsed && state.selectedCandidate) {
    const shortTitle =
      state.selectedCandidate.title.length > 78
        ? `${state.selectedCandidate.title.slice(0, 75)}…`
        : state.selectedCandidate.title;
    if (dom.candidatesHeading) {
      dom.candidatesHeading.textContent = `Wybrano produkt z listy wyników (${state.lastCandidateCount} pozycji dla „${state.lastCandidateQuery}”)`;
    }
    dom.candidatesSubtitle.textContent = `Aktywny wybór ASIN ${state.selectedCandidate.asin}: ${shortTitle}. Kliknij „Rozwiń listę wyników”, aby wybrać inny wariant.`;
  } else {
    if (dom.candidatesHeading) {
      dom.candidatesHeading.textContent =
        'Wybierz właściwy produkt z wyników wyszukiwania';
    }
    dom.candidatesSubtitle.textContent = `Znaleziono ${state.lastCandidateCount} pozycji dla frazy „${state.lastCandidateQuery}”. Kliknij produkt, aby porównać jego ceny i dostawę w 9 sklepach Amazon (UE i UK).`;
  }
}

function renderCandidates(query, searchResult) {
  dom.candidatesSection.hidden = false;
  const count = searchResult.candidates.length;
  state.lastCandidateQuery = query;
  state.lastCandidateCount = count;
  state.selectedCandidate = null;
  setCandidatesCollapsed(false, null);

  if (searchResult.notice) {
    dom.candidatesNotice.textContent = searchResult.notice;
    dom.candidatesNotice.hidden = false;
  } else {
    dom.candidatesNotice.hidden = true;
  }

  dom.candidatesGrid.replaceChildren();

  searchResult.candidates.forEach((cand) => {
    const item = document.createElement('article');
    item.className = 'candidate-item';
    item.setAttribute('role', 'listitem');

    const bodyRow = document.createElement('div');
    bodyRow.className = 'candidate-body';

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'candidate-thumb-wrap';

    const thumbImg = document.createElement('img');
    thumbImg.className = 'candidate-thumb';
    thumbImg.width = 76;
    thumbImg.height = 96;
    thumbImg.loading = 'lazy';
    thumbImg.alt = cand.title;
    const fallbackCandImg = buildFallbackCoverDataUri(cand.asin, cand.title);
    thumbImg.src = cand.imageUrl || fallbackCandImg;
    thumbImg.onerror = () => {
      thumbImg.onerror = null;
      thumbImg.src = fallbackCandImg;
    };
    thumbWrap.appendChild(thumbImg);

    const top = document.createElement('div');
    top.className = 'candidate-top';

    const metaRow = document.createElement('div');
    metaRow.className = 'candidate-meta-row';

    const asinBadge = document.createElement('span');
    asinBadge.className = 'candidate-asin';
    asinBadge.textContent = `ASIN: ${cand.asin}`;

    const ratingSpan = document.createElement('span');
    ratingSpan.className = 'candidate-rating';
    const cleanReviewCount = cand.reviewCount
      ? String(cand.reviewCount).replace(/^\(+|\)+$/g, '').trim()
      : '';
    ratingSpan.textContent = cand.rating
      ? `★ ${cand.rating}${cleanReviewCount ? ` (${cleanReviewCount})` : ''}`
      : 'Pozycja katalogowa';

    metaRow.append(asinBadge, ratingSpan);

    const h3 = document.createElement('h3');
    h3.className = 'candidate-title';
    h3.textContent = cand.title;

    top.append(metaRow, h3);
    bodyRow.append(thumbWrap, top);

    const bottom = document.createElement('div');
    bottom.className = 'candidate-bottom';

    const priceSpan = document.createElement('span');
    priceSpan.className = 'candidate-price';
    priceSpan.textContent = cand.previewPriceFormatted || 'Sprawdź cenę';

    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'candidate-pick-btn';
    pickBtn.textContent = 'Porównaj w 9 krajach →';
    pickBtn.addEventListener('click', () => {
      dom.candidatesGrid
        .querySelectorAll('.candidate-item')
        .forEach((card) => {
          card.classList.remove('is-selected-candidate');
          const btn = card.querySelector('.candidate-pick-btn');
          if (btn) btn.textContent = 'Porównaj w 9 krajach →';
        });
      item.classList.add('is-selected-candidate');
      pickBtn.textContent = 'Wybrano — porównywanie…';

      window.setTimeout(() => {
        setCandidatesCollapsed(true, cand);
      }, 150);

      compareSpecificCandidate(
        cand.asin,
        cand.title,
        `amazon.${cand.marketplaceId.toLowerCase()}`,
        cand.imageUrl,
      );
    });

    bottom.append(priceSpan, pickBtn);
    item.append(bodyRow, bottom);
    dom.candidatesGrid.appendChild(item);
  });
}

async function consumeNdjsonStream(response, onEvent) {
  if (!response.body) {
    throw new Error('Brak strumienia odpowiedzi z serwera.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        onEvent(parsed);
      } catch {
        // Ignore malformed partial line
      }
    }
  }

  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()));
    } catch {
      // Ignore
    }
  }
}

async function compareSpecificCandidate(
  asin,
  titleHint,
  originDomain,
  imageHint,
) {
  dom.submitBtn.disabled = true;
  state.manualOverrides.clear();

  try {
    const response = await fetch('/api/compare-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asin,
        titleHint,
        imageHint,
        originDomain,
        config: getSessionConfig(),
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Błąd porównywania produktu.');
    }

    await consumeNdjsonStream(response, (ev) => {
      handleProgressEvent(ev);
      if (ev.type === 'comparison_complete' && ev.report) {
        if (dom.comparisonSection) {
          dom.comparisonSection.hidden = false;
        }
        state.currentReport = ev.report;
        updateFxBanner(ev.report.exchangeRates);
        recalculateReportClientSide();
        const availCount = ev.report.offers.filter(
          (o) => o.status === 'available' && o.itemPrice !== null,
        ).length;
        finishScrapeProgress(
          `Zakończono odczyt 9 sklepów Amazon dla ASIN ${ev.report.asin} — aktywne oferty BuyBox w ${availCount} z 9 krajów.`,
        );
        document
          .getElementById('comparison-section')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  } catch (err) {
    dom.queryError.textContent =
      err instanceof Error ? err.message : 'Wystąpił błąd komunikacji.';
    dom.queryError.hidden = false;
  } finally {
    dom.submitBtn.disabled = false;
  }
}

async function handleResolveSubmit(rawInput) {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    dom.queryInput.setCustomValidity(
      'Wprowadź link z Amazon, kod ASIN lub słowo kluczowe.',
    );
    dom.queryError.textContent =
      'Wprowadź link z Amazon, kod ASIN lub słowo kluczowe.';
    dom.queryError.hidden = false;
    return;
  }

  dom.queryInput.setCustomValidity('');
  dom.queryError.hidden = true;
  dom.submitBtn.disabled = true;
  state.manualOverrides.clear();

  try {
    const response = await fetch('/api/resolve-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: trimmed,
        marketplaceId: dom.originSelect.value,
        config: getSessionConfig(),
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(
        errData.error || 'Nie udało się przetworzyć zapytania.',
      );
    }

    await consumeNdjsonStream(response, (ev) => {
      handleProgressEvent(ev);

      if (ev.type === 'comparison_complete' && ev.report) {
        dom.candidatesSection.hidden = true;
        if (dom.comparisonSection) {
          dom.comparisonSection.hidden = false;
        }
        state.currentReport = ev.report;
        updateFxBanner(ev.report.exchangeRates);
        recalculateReportClientSide();
        const availCount = ev.report.offers.filter(
          (o) => o.status === 'available' && o.itemPrice !== null,
        ).length;
        finishScrapeProgress(
          `Zakończono odczyt 9 sklepów Amazon dla ASIN ${ev.report.asin} — aktywne oferty BuyBox w ${availCount} z 9 krajów.`,
        );
      } else if (ev.type === 'candidates_complete' && ev.searchResult) {
        renderCandidates(ev.resolved.query, ev.searchResult);
        finishScrapeProgress(
          `Pobrano ${ev.searchResult.candidates.length} pozycji z katalogu Amazon dla frazy „${ev.resolved.query}”.`,
        );
      }
    });
  } catch (err) {
    dom.queryError.textContent =
      err instanceof Error ? err.message : 'Błąd komunikacji z serwerem.';
    dom.queryError.hidden = false;
  } finally {
    dom.submitBtn.disabled = false;
  }
}

// Validation timing per modern-web-guidance: forms (validate on blur, clear on input)
dom.queryInput.addEventListener('input', () => {
  dom.queryInput.setCustomValidity('');
  dom.queryError.hidden = true;
});

dom.queryInput.addEventListener('blur', () => {
  if (!dom.queryInput.value.trim()) {
    dom.queryInput.setCustomValidity(
      'Wprowadź link do produktu Amazon, kod ASIN lub nazwę produktu.',
    );
  }
});

// IME-safe Enter key handling
dom.queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.isComposing) {
    e.preventDefault();
  }
});

dom.form.addEventListener('submit', (e) => {
  e.preventDefault();
  handleResolveSubmit(dom.queryInput.value);
});

// Preset chips
document.querySelectorAll('.preset-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetInput = btn.getAttribute('data-input') || '';
    dom.queryInput.value = targetInput;
    handleResolveSubmit(targetInput);
  });
});

// Spread radio buttons & live FX inputs trigger immediate recalculation
document.querySelectorAll('input[name="fxSpreadPct"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    recalculateReportClientSide();
  });
});

[dom.rateEurInput, dom.rateGbpInput, dom.rateSekInput].forEach((input) => {
  input.addEventListener('change', () => {
    state.hasCustomRateOverride = true;
    dom.fxSourceBadge.textContent = 'Kurs własny / NBP';
    recalculateReportClientSide();
  });
});

// Sort buttons
document.querySelectorAll('.sort-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document
      .querySelectorAll('.sort-btn')
      .forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    state.sortMode = btn.getAttribute('data-sort') || 'landed';
    recalculateReportClientSide();
  });
});

dom.toggleCandidatesBtn?.addEventListener('click', () => {
  const isCurrentlyCollapsed =
    dom.candidatesSection.classList.contains('is-collapsed');
  setCandidatesCollapsed(!isCurrentlyCollapsed);
});

dom.closeCandidatesBtn.addEventListener('click', () => {
  dom.candidatesSection.hidden = true;
});

dom.resetOverridesBtn.addEventListener('click', () => {
  state.manualOverrides.clear();
  recalculateReportClientSide();
});

// Initial load: fetch live NBP exchange rates without auto-scraping a sample product
// (unless ?q= query parameter is explicitly provided in the URL)
fetch('/api/rates')
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (data?.exchangeRates) {
      updateFxBanner(data.exchangeRates);
    }
  })
  .catch(() => {
    // Keep default NBP fallback rates in inputs if offline
  });

const urlQueryParam = new URLSearchParams(window.location.search).get('q');
if (urlQueryParam && urlQueryParam.trim()) {
  dom.queryInput.value = urlQueryParam.trim();
  handleResolveSubmit(urlQueryParam.trim());
}
