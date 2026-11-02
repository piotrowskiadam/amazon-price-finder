import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { MARKETPLACES } from './domain/marketplaces.js';
import type {
  CurrencyCode,
  DeliverySessionConfig,
  MarketplaceId,
} from './domain/types.js';
import {
  type ExchangeRateProvider,
  NbpExchangeRateProvider,
} from './modules/exchange-rate-provider.js';
import { resolveUserInput } from './modules/input-resolver.js';
import {
  HttpMarketplaceGateway,
  type MarketplaceGateway,
} from './modules/marketplace-gateway.js';
import { PriceComparisonOrchestrator } from './modules/price-comparison-orchestrator.js';

export interface AppDependencies {
  gateway?: MarketplaceGateway;
  exchangeRateProvider?: ExchangeRateProvider;
  publicDir?: string;
}

export function createApp(deps?: AppDependencies) {
  const gateway = deps?.gateway ?? new HttpMarketplaceGateway();
  const exchangeRateProvider =
    deps?.exchangeRateProvider ?? new NbpExchangeRateProvider();
  const orchestrator = new PriceComparisonOrchestrator({
    gateway,
    exchangeRateProvider,
  });
  const publicDir = deps?.publicDir ?? path.resolve(process.cwd(), 'public');
  const docsDir = path.resolve(process.cwd(), 'docs');

  const app = new Hono();

  app.get('/api/health', (c) =>
    c.json({
      status: 'ok',
      marketplacesCount: MARKETPLACES.length,
    }),
  );

  app.get('/api/marketplaces', (c) =>
    c.json({
      marketplaces: MARKETPLACES,
    }),
  );

  app.get('/api/rates', async (c) => {
    const customEur = Number.parseFloat(c.req.query('EUR') ?? '');
    const customGbp = Number.parseFloat(c.req.query('GBP') ?? '');
    const customSek = Number.parseFloat(c.req.query('SEK') ?? '');
    const overrides: Partial<Record<CurrencyCode, number>> = {};
    if (Number.isFinite(customEur) && customEur > 0) overrides.EUR = customEur;
    if (Number.isFinite(customGbp) && customGbp > 0) overrides.GBP = customGbp;
    if (Number.isFinite(customSek) && customSek > 0) overrides.SEK = customSek;

    const rates = await exchangeRateProvider.getExchangeRates(overrides);
    return c.json({ exchangeRates: rates });
  });

  app.post('/api/resolve', async (c) => {
    try {
      const body = (await c.req.json()) as {
        input?: string;
        marketplaceId?: MarketplaceId;
        config?: DeliverySessionConfig;
      };
      const resolved = resolveUserInput(body.input ?? '');

      if (resolved.kind === 'asin') {
        const report = await orchestrator.compareByAsin(resolved.asin, {
          config: body.config,
          originDomain: resolved.sourceDomain,
          titleHint: resolved.extractedSlug,
        });
        return c.json({
          kind: 'comparison',
          resolved,
          report,
        });
      }

      const searchResult = await orchestrator.searchCandidates(
        resolved.query,
        body.marketplaceId ?? 'PL',
        body.config,
      );
      return c.json({
        kind: 'candidates',
        resolved,
        searchResult,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Nieprawidłowe zapytanie wejściowe.';
      return c.json({ error: message }, 400);
    }
  });

  app.post('/api/compare', async (c) => {
    try {
      const body = (await c.req.json()) as {
        asin?: string;
        titleHint?: string;
        imageHint?: string;
        originDomain?: string;
        config?: DeliverySessionConfig;
      };
      const resolved = resolveUserInput(body.asin ?? '');
      if (resolved.kind !== 'asin') {
        return c.json(
          { error: 'Wymagany jest 10-znakowy kod ASIN lub bezpośredni link do produktu.' },
          400,
        );
      }

      const report = await orchestrator.compareByAsin(resolved.asin, {
        config: body.config,
        originDomain: body.originDomain ?? resolved.sourceDomain,
        titleHint: body.titleHint ?? resolved.extractedSlug,
        imageHint: body.imageHint,
      });

      return c.json({ report });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Błąd podczas porównywania cen.';
      return c.json({ error: message }, 400);
    }
  });

  app.post('/api/resolve-stream', async (c) => {
    try {
      const body = (await c.req.json()) as {
        input?: string;
        marketplaceId?: MarketplaceId;
        config?: DeliverySessionConfig;
      };
      const resolved = resolveUserInput(body.input ?? '');

      c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
      c.header('Cache-Control', 'no-cache');

      return stream(c, async (s) => {
        if (resolved.kind === 'asin') {
          await s.writeln(
            JSON.stringify({
              type: 'comparison_start',
              asin: resolved.asin,
              totalCount: MARKETPLACES.length,
            }),
          );

          const report = await orchestrator.compareByAsin(resolved.asin, {
            config: body.config,
            originDomain: resolved.sourceDomain,
            titleHint: resolved.extractedSlug,
            onProgress: (ev) => {
              void s.writeln(JSON.stringify(ev));
            },
          });

          await s.writeln(
            JSON.stringify({
              type: 'comparison_complete',
              resolved,
              report,
            }),
          );
          return;
        }

        await s.writeln(
          JSON.stringify({
            type: 'search_start',
            query: resolved.query,
            marketplaceId: body.marketplaceId ?? 'PL',
          }),
        );

        const searchResult = await orchestrator.searchCandidates(
          resolved.query,
          body.marketplaceId ?? 'PL',
          body.config,
        );

        await s.writeln(
          JSON.stringify({
            type: 'candidates_complete',
            resolved,
            searchResult,
          }),
        );
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Nieprawidłowe zapytanie wejściowe.';
      return c.json({ error: message }, 400);
    }
  });

  app.post('/api/compare-stream', async (c) => {
    try {
      const body = (await c.req.json()) as {
        asin?: string;
        titleHint?: string;
        imageHint?: string;
        originDomain?: string;
        config?: DeliverySessionConfig;
      };
      const resolved = resolveUserInput(body.asin ?? '');
      if (resolved.kind !== 'asin') {
        return c.json(
          { error: 'Wymagany jest 10-znakowy kod ASIN lub bezpośredni link do produktu.' },
          400,
        );
      }

      c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
      c.header('Cache-Control', 'no-cache');

      return stream(c, async (s) => {
        await s.writeln(
          JSON.stringify({
            type: 'comparison_start',
            asin: resolved.asin,
            totalCount: MARKETPLACES.length,
          }),
        );

        const report = await orchestrator.compareByAsin(resolved.asin, {
          config: body.config,
          originDomain: body.originDomain ?? resolved.sourceDomain,
          titleHint: body.titleHint ?? resolved.extractedSlug,
          imageHint: body.imageHint,
          onProgress: (ev) => {
            void s.writeln(JSON.stringify(ev));
          },
        });

        await s.writeln(
          JSON.stringify({
            type: 'comparison_complete',
            resolved,
            report,
          }),
        );
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Błąd podczas porównywania cen.';
      return c.json({ error: message }, 400);
    }
  });

  app.post('/api/search', async (c) => {
    try {
      const body = (await c.req.json()) as {
        query?: string;
        marketplaceId?: MarketplaceId;
        config?: DeliverySessionConfig;
      };
      if (!body.query || !body.query.trim()) {
        return c.json({ error: 'Wprowadź słowo kluczowe do wyszukania.' }, 400);
      }

      const searchResult = await orchestrator.searchCandidates(
        body.query.trim(),
        body.marketplaceId ?? 'PL',
        body.config,
      );

      return c.json({ searchResult });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Błąd podczas wyszukiwania produktów.';
      return c.json({ error: message }, 400);
    }
  });

  // Serve architectural diagram
  app.get('/diagram', async (c) => {
    try {
      const html = await readFile(
        path.join(docsDir, 'diagrams', 'architecture.html'),
        'utf-8',
      );
      return c.html(html);
    } catch {
      return c.text('Diagram not found', 404);
    }
  });

  // Serve static frontend files
  app.get('/', async (c) => {
    const html = await readFile(path.join(publicDir, 'index.html'), 'utf-8');
    return c.html(html);
  });

  app.get('/styles.css', async (c) => {
    const css = await readFile(path.join(publicDir, 'styles.css'), 'utf-8');
    return c.text(css, 200, { 'Content-Type': 'text/css; charset=utf-8' });
  });

  app.get('/app.js', async (c) => {
    const js = await readFile(path.join(publicDir, 'app.js'), 'utf-8');
    return c.text(js, 200, {
      'Content-Type': 'application/javascript; charset=utf-8',
    });
  });

  return app;
}
