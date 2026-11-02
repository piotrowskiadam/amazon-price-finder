import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number.parseInt(process.env.PORT ?? '3456', 10);
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(
      `[Amazon Price Finder EU/UK] Serwer uruchomiony pod adresem: http://localhost:${info.port}`,
    );
  },
);
