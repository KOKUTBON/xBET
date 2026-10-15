import { PilotStore, pilotEnabled } from './pilot/pilot-store.ts';
import { createServer } from 'http';
import { BettingHttpRouter } from './http/betting-routes.ts';
import { LedgerService } from './wallet/ledger-service.ts';
import { SettlementWorkerQueue } from './settlement/settlement-worker.ts';

async function bootstrap() {
  if ((process.env.NODE_ENV === 'production' || process.env.XBET_PILOT_MODE === 'true') && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for production betting');
  }
  console.log('================================================================');
  console.log('  💰 xBET Platform - Betting, Settlement & Wallet Engine');
  console.log('================================================================');

  const port = parseInt(process.env.PORT || '4001', 10);
  const host = process.env.HOST || '0.0.0.0';

  // Initialize Ledger Service
  const ledger = LedgerService.getInstance();

  // Start Automated Settlement Worker & Background Reconciliation Sweeper
  const workerQueue = SettlementWorkerQueue.getInstance();
  workerQueue.startSweeper(15000); // 15-second reconciliation sweep interval

  const pilot = pilotEnabled() ? new PilotStore() : null;
  if (pilot) await pilot.bootstrapAdmin();
  let relaying=false;
  const relayTimer=pilot?setInterval(async()=>{if(relaying)return;relaying=true;try{await pilot.relay();}catch(error){console.error('[PilotOutbox]',error);}finally{relaying=false;}},500):null;
  relayTimer?.unref();
  const router = new BettingHttpRouter();
  const server = createServer((req, res) => {
    router.handleRequest(req, res);
  });

  server.listen(port, host, () => {
    console.log(`[HTTP] Betting & Settlement API listening on http://${host}:${port}`);
    console.log(`[Health] Check status at http://${host}:${port}/api/v1/health`);
    console.log(`[Wallet] Query balance at http://${host}:${port}/api/v1/wallet/balance/:userId`);
  });

  const shutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    workerQueue.stopSweeper();
    if(relayTimer)clearInterval(relayTimer);
    server.close(async () => {
      await router.close();
      if(pilot)await pilot.close();
      console.log('[Server] Betting service stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Fatal] Failed to bootstrap Betting Engine:', err);
  process.exit(1);
});
