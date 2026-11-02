import type { CurrencyCode, ExchangeRateTable } from '../domain/types.js';

export interface ExchangeRateProvider {
  getExchangeRates(
    customOverrides?: Partial<Record<CurrencyCode, number>>,
  ): Promise<ExchangeRateTable>;
}

export const DEFAULT_FALLBACK_RATES: Record<CurrencyCode, number> = {
  PLN: 1.0,
  EUR: 4.3185,
  GBP: 5.149,
  SEK: 0.3782,
};

interface NbpTableResponse {
  table: string;
  no: string;
  effectiveDate: string;
  rates: Array<{
    currency: string;
    code: string;
    mid: number;
  }>;
}

export class NbpExchangeRateProvider implements ExchangeRateProvider {
  private cachedTable: ExchangeRateTable | null = null;
  private cacheExpiresAt = 0;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: { cacheTtlMs?: number; fetchImpl?: typeof fetch }) {
    this.cacheTtlMs = options?.cacheTtlMs ?? 30 * 60 * 1000;
    this.fetchImpl = options?.fetchImpl ?? fetch;
  }

  async getExchangeRates(
    customOverrides?: Partial<Record<CurrencyCode, number>>,
  ): Promise<ExchangeRateTable> {
    const baseTable = await this.fetchOrGetCachedBaseTable();

    if (!customOverrides || Object.keys(customOverrides).length === 0) {
      return baseTable;
    }

    const mergedRates: Record<CurrencyCode, number> = {
      ...baseTable.ratesToPln,
      PLN: 1.0,
    };

    let hasOverride = false;
    for (const code of ['EUR', 'GBP', 'SEK'] as const) {
      const val = customOverrides[code];
      if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
        mergedRates[code] = val;
        hasOverride = true;
      }
    }

    return hasOverride
      ? {
          ...baseTable,
          source: 'CUSTOM',
          ratesToPln: mergedRates,
        }
      : baseTable;
  }

  private async fetchOrGetCachedBaseTable(): Promise<ExchangeRateTable> {
    const now = Date.now();
    if (this.cachedTable && now < this.cacheExpiresAt) {
      return this.cachedTable;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await this.fetchImpl(
        'https://api.nbp.pl/api/exchangerates/tables/A/?format=json',
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`NBP HTTP ${response.status}`);
      }

      const payload = (await response.json()) as NbpTableResponse[];
      const table = payload[0];
      if (!table || !Array.isArray(table.rates)) {
        throw new Error('Malformed NBP Table A payload');
      }

      const ratesToPln: Record<CurrencyCode, number> = { ...DEFAULT_FALLBACK_RATES };
      for (const entry of table.rates) {
        if (entry.code === 'EUR' || entry.code === 'GBP' || entry.code === 'SEK') {
          ratesToPln[entry.code] = Number(entry.mid.toFixed(4));
        }
      }

      const resolved: ExchangeRateTable = {
        source: 'NBP_API',
        tableNumber: table.no,
        effectiveDate: table.effectiveDate,
        fetchedAt: new Date().toISOString(),
        ratesToPln,
      };

      this.cachedTable = resolved;
      this.cacheExpiresAt = now + this.cacheTtlMs;
      return resolved;
    } catch {
      return {
        source: 'FALLBACK',
        tableNumber: 'Tabela A (awaryjna)',
        effectiveDate: new Date().toISOString().slice(0, 10),
        fetchedAt: new Date().toISOString(),
        ratesToPln: { ...DEFAULT_FALLBACK_RATES },
      };
    }
  }
}

export class StaticExchangeRateProvider implements ExchangeRateProvider {
  private readonly rates: Record<CurrencyCode, number>;

  constructor(rates: Partial<Record<CurrencyCode, number>> = {}) {
    this.rates = {
      ...DEFAULT_FALLBACK_RATES,
      ...rates,
      PLN: 1.0,
    };
  }

  async getExchangeRates(
    customOverrides?: Partial<Record<CurrencyCode, number>>,
  ): Promise<ExchangeRateTable> {
    return {
      source: customOverrides && Object.keys(customOverrides).length > 0 ? 'CUSTOM' : 'NBP_API',
      tableNumber: '085/A/NBP/2026',
      effectiveDate: '2026-11-02',
      fetchedAt: '2026-11-02T05:00:00.000Z',
      ratesToPln: {
        ...this.rates,
        ...(customOverrides ?? {}),
        PLN: 1.0,
      },
    };
  }
}
