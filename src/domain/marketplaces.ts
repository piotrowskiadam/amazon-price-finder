import type { Marketplace, MarketplaceId } from './types.js';

export const MARKETPLACES: readonly Marketplace[] = [
  {
    id: 'PL',
    domain: 'amazon.pl',
    countryNamePl: 'Polska',
    countryCodeIso: 'PL',
    currency: 'PLN',
    currencySymbol: 'zł',
    languageTag: 'pl-PL,pl;q=0.9,en;q=0.8',
    regionGroup: 'EU',
    defaultShippingToPlEstimate: 0,
  },
  {
    id: 'DE',
    domain: 'amazon.de',
    countryNamePl: 'Niemcy',
    countryCodeIso: 'DE',
    currency: 'EUR',
    currencySymbol: '€',
    languageTag: 'de-DE,de;q=0.9,pl;q=0.8,en;q=0.7',
    regionGroup: 'EU',
    defaultShippingToPlEstimate: 5.99,
  },
  {
    id: 'ES',
    domain: 'amazon.es',
    countryNamePl: 'Hiszpania',
    countryCodeIso: 'ES',
    currency: 'EUR',
    currencySymbol: '€',
    languageTag: 'es-ES,es;q=0.9,en;q=0.8',
    regionGroup: 'EU',
    defaultShippingToPlEstimate: 7.49,
  },
  {
    id: 'IT',
    domain: 'amazon.it',
    countryNamePl: 'Włochy',
    countryCodeIso: 'IT',
    currency: 'EUR',
    currencySymbol: '€',
    languageTag: 'it-IT,it;q=0.9,en;q=0.8',
    regionGroup: 'EU',
    defaultShippingToPlEstimate: 7.49,
  },
  {
    id: 'FR',
    domain: 'amazon.fr',
    countryNamePl: 'Francja',
    countryCodeIso: 'FR',
    currency: 'EUR',
    currencySymbol: '€',
    languageTag: 'fr-FR,fr;q=0.9,en;q=0.8',
    regionGroup: 'EU',
    defaultShippingToPlEstimate: 7.99,
  },
  {
    id: 'NL',
    domain: 'amazon.nl',
    countryNamePl: 'Holandia',
    countryCodeIso: 'NL',
    currency: 'EUR',
    currencySymbol: '€',
    languageTag: 'nl-NL,nl;q=0.9,en;q=0.8',
    regionGroup: 'EU',
    defaultShippingToPlEstimate: 6.99,
  },
  {
    id: 'BE',
    domain: 'amazon.com.be',
    countryNamePl: 'Belgia',
    countryCodeIso: 'BE',
    currency: 'EUR',
    currencySymbol: '€',
    languageTag: 'fr-BE,nl-BE;q=0.9,en;q=0.8',
    regionGroup: 'EU',
    defaultShippingToPlEstimate: 7.49,
  },
  {
    id: 'SE',
    domain: 'amazon.se',
    countryNamePl: 'Szwecja',
    countryCodeIso: 'SE',
    currency: 'SEK',
    currencySymbol: 'kr',
    languageTag: 'sv-SE,sv;q=0.9,en;q=0.8',
    regionGroup: 'EU',
    defaultShippingToPlEstimate: 79.0,
  },
  {
    id: 'UK',
    domain: 'amazon.co.uk',
    countryNamePl: 'Wielka Brytania',
    countryCodeIso: 'GB',
    currency: 'GBP',
    currencySymbol: '£',
    languageTag: 'en-GB,en;q=0.9',
    regionGroup: 'UK',
    defaultShippingToPlEstimate: 6.49,
  },
] as const;

export const MARKETPLACE_BY_ID: Record<MarketplaceId, Marketplace> = Object.fromEntries(
  MARKETPLACES.map((m) => [m.id, m]),
) as Record<MarketplaceId, Marketplace>;

export function findMarketplaceByDomain(hostname: string): Marketplace | undefined {
  const clean = hostname.toLowerCase().replace(/^www\./, '');
  return MARKETPLACES.find((m) => clean === m.domain || clean.endsWith(`.${m.domain}`));
}

export function buildProductUrl(domain: string, asin: string): string {
  return `https://www.${domain}/dp/${encodeURIComponent(asin.toUpperCase())}`;
}

export function buildSearchUrl(domain: string, query: string): string {
  return `https://www.${domain}/s?k=${encodeURIComponent(query.trim())}`;
}
