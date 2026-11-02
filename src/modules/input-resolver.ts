import { findMarketplaceByDomain } from '../domain/marketplaces.js';
import type { ResolvedInput } from '../domain/types.js';

const ASIN_PATTERNS: readonly RegExp[] = [
  /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN|product|d)\/([A-Z0-9]{10})(?:[/?&#]|$)/i,
  /[?&]asin=([A-Z0-9]{10})(?:[&#]|$)/i,
];

const STANDALONE_ASIN_REGEX = /^(B[A-Z0-9]{9}|[0-9]{9}[0-9X])$/i;

/**
 * Deep module: resolves any user input (Amazon URL across any EU/UK domain,
 * standalone 10-char ASIN/ISBN-10, or free-text search query) into a strongly
 * typed ResolvedInput.
 */
export function resolveUserInput(rawInput: string): ResolvedInput {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Wprowadź link z Amazon, kod ASIN lub frazę wyszukiwania.');
  }

  // 1. Check if input is or contains an HTTP/HTTPS URL or amazon domain path
  if (/^(https?:\/\/|(?:www\.)?amazon\.[a-z.]{2,6}\/)/i.test(trimmed)) {
    const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(normalizedUrl);
      const fullPathAndQuery = `${parsed.pathname}${parsed.search}`;

      for (const pattern of ASIN_PATTERNS) {
        const match = fullPathAndQuery.match(pattern);
        if (match && match[1]) {
          const asin = match[1].toUpperCase();
          const marketplace = findMarketplaceByDomain(parsed.hostname);
          const slugMatch = parsed.pathname.match(/^\/([^/]+)\/(?:dp|gp\/product)\//i);
          const extractedSlug = slugMatch?.[1]
            ? decodeURIComponent(slugMatch[1]).replace(/[-_]+/g, ' ').trim()
            : undefined;

          return {
            kind: 'asin',
            asin,
            sourceDomain: marketplace?.domain ?? parsed.hostname.replace(/^www\./i, ''),
            sourceMarketplaceId: marketplace?.id,
            extractedSlug,
          };
        }
      }

      // Check if URL is an Amazon search URL (?k=...)
      const searchParam = parsed.searchParams.get('k') ?? parsed.searchParams.get('field-keywords');
      if (searchParam && searchParam.trim()) {
        return {
          kind: 'keyword',
          query: searchParam.trim(),
        };
      }
    } catch {
      // Fall through to regex extraction on malformed URLs
    }
  }

  // 2. Fallback regex scan if someone pasted a partial URL or text containing /dp/ASIN
  for (const pattern of ASIN_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return {
        kind: 'asin',
        asin: match[1].toUpperCase(),
      };
    }
  }

  // 3. Standalone ASIN (starts with B + 9 alphanumerics, or 10-digit ISBN)
  if (STANDALONE_ASIN_REGEX.test(trimmed)) {
    return {
      kind: 'asin',
      asin: trimmed.toUpperCase(),
    };
  }

  // 4. Otherwise treat as a keyword search query
  return {
    kind: 'keyword',
    query: trimmed,
  };
}
