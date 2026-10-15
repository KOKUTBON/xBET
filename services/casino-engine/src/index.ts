import { createServer } from 'http';
import { CasinoHttpRouter } from './http/casino-routes.ts';
import { WalletAdapter } from './seamless-wallet/wallet-adapter.ts';

async function bootstrap() {
  if ((process.env.NODE_ENV === 'production' || process.env.XBET_PILOT_MODE === 'true') && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for production casino');
  }
  if(process.env.XBET_PILOT_MODE==='true' && !/^[a-f0-9]{64}$/i.test(process.env.RNG_SEED_KEY || ''))throw new Error('RNG_SEED_KEY must be 64 hex characters for the points pilot');
  console.log('================================================================');
  console.log('  🎰 xBET Modern Platform - Casino RGS & Virtual Games Engine');
  console.log('================================================================');

  const port = parseInt(process.env.PORT || '4002', 10);
  const host = process.env.HOST || '0.0.0.0';

  // Initialize Wallet Adapter (uses HTTP to betting-engine if BETTING_ENGINE_URL is set, else in-memory)
  const wallet = WalletAdapter.getInstance();

  const router = new CasinoHttpRouter();
  const server = createServer((req, res) => {
    router.handleRequest(req, res);
  });

  server.listen(port, host, () => {
    console.log(`[HTTP] Casino RGS & Virtual API listening on http://${host}:${port}`);
    console.log(`[Health] Check status at http://${host}:${port}/api/v1/health`);
    console.log(`[Catalog] Games catalog at http://${host}:${port}/api/v1/casino/games`);
    console.log(`[Virtual] Virtual racing at http://${host}:${port}/api/v1/virtual-sports/races`);
  });

  const shutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    server.close(async () => {
      await router.close();
      console.log('[Server] Casino RGS service stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Fatal] Failed to bootstrap Casino Engine:', err);
  process.exit(1);
});
