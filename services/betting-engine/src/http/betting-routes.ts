import { IncomingMessage, ServerResponse } from 'http';
import { LedgerService } from '../wallet/ledger-service.ts';
import { BetPlacementService } from '../betting/bet-placement.ts';
import { CashoutService } from '../betting/cashout-service.ts';
import { SettlementEngine } from '../settlement/settlement-engine.ts';
import { FixtureResultingService } from '../settlement/fixture-resulting-service.ts';
import type { FixtureResultSubmission } from '../settlement/fixture-resulting-service.ts';
import { SettlementWorkerQueue } from '../settlement/settlement-worker.ts';
import type { PlaceBetRequest } from '../betting/bet-validator.ts';
import { QuoteError, QuoteService } from '../betting/quote-service.ts';
import { AcceptanceError, DurableAcceptanceService } from '../betting/durable-acceptance.ts';
import type { LegStatus } from '../betting/bet-placement.ts';
import { AuthMiddleware, AuthTokenManager, UserRole } from '../../../../packages/core-types/src/auth.ts';
import { toPublicError } from '../../../../packages/core-types/src/http-errors.ts';
import { PilotStore, pilotEnabled } from '../pilot/pilot-store.ts';
import { TraderOperationsService } from '../trader/trader-operations-service.ts';

export class BettingHttpRouter {
  private ledger: LedgerService;
  private betService: BetPlacementService;
  private cashoutService: CashoutService;
  private settlementEngine: SettlementEngine;
  private resultingService: FixtureResultingService;
  private workerQueue: SettlementWorkerQueue;
  private quoteService: QuoteService;
  private traderOps: TraderOperationsService;
  private durableService?: DurableAcceptanceService;
  private pilotStore?: PilotStore;
  private authAttempts = new Map<string,{count:number;since:number}>();
  private pilot(): PilotStore { return this.pilotStore ??= new PilotStore(); }

  constructor(quoteService?: QuoteService) {
    this.ledger = LedgerService.getInstance();
    this.betService = BetPlacementService.getInstance();
    this.cashoutService = CashoutService.getInstance();
    this.settlementEngine = SettlementEngine.getInstance();
    this.resultingService = FixtureResultingService.getInstance();
    this.workerQueue = SettlementWorkerQueue.getInstance();
    this.quoteService = quoteService ?? (pilotEnabled() ? new QuoteService({resolve: (f,m,s) => this.pilot().resolve(f,m,s)}) : new QuoteService());
    this.traderOps = TraderOperationsService.getInstance();
  }

  private durable(): DurableAcceptanceService | null {
    if (!process.env.DATABASE_URL || (process.env.NODE_ENV !== 'production' && process.env.XBET_ALLOW_VOLATILE_BETS === 'true')) return null;
    return (this.durableService ??= new DurableAcceptanceService());
  }

  public async close(): Promise<void> {
    if (this.durableService) await this.durableService.close();
    if (this.pilotStore) await this.pilotStore.close();
  }

  public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      if (pilotEnabled() && pathname.startsWith('/api/v1/auth/')) {
        if (req.method === 'POST' && ['/api/v1/auth/register','/api/v1/auth/login'].includes(pathname)) {
          const body = await this.parseJsonBody(req);
          if (this.authRateLimited(this.clientAddress(req), String(body.username || ''))) { this.sendJson(res,429,{error:'AUTH_RATE_LIMIT'}); return; }
          if (pathname.endsWith('/register')) {
            if (body.role || body.userId || (body.currencyCode && body.currencyCode !== 'PTS')) { this.sendJson(res,400,{error:'SERVER_IDENTITY_REQUIRED'}); return; }
            const user = await this.pilot().register(String(body.username||''),String(body.password||''));
            this.sendJson(res,201,{success:true,...await this.pilot().login(user.username,String(body.password))}); return;
          }
          this.sendJson(res,200,{success:true,...await this.pilot().login(String(body.username||''),String(body.password||''))}); return;
        }
        const auth = AuthMiddleware.requireAuth(req,res); if (!auth) return;
        const token = AuthMiddleware.extractToken(req)!;
        await this.pilot().validateSession(token,auth);
        if (pathname.endsWith('/logout') && req.method==='POST') { await this.pilot().logout(token); this.sendJson(res,200,{success:true}); return; }
        if (pathname.endsWith('/me') && req.method==='GET') { this.sendJson(res,200,{user:{id:auth.userId,username:auth.username,role:auth.role,currencyCode:'PTS'}}); return; }
        this.sendJson(res,404,{error:'NOT_FOUND'}); return;
      }
      // 1. Health check (Public)
      if (pathname === '/api/v1/health' && req.method === 'GET') {
        const durable = this.durable();
        if (durable) await durable.getBalance('__health__');
        this.sendJson(res, 200, {
          status: 'OK',
          service: 'Betting, Settlement & Wallet Engine',
          storage: durable ? 'POSTGRES_POINTS' : 'VOLATILE_DEMO',
          timestamp: new Date().toISOString(),
          workerStats: this.workerQueue.getStats(),
        });
        return;
      }

      const session = AuthMiddleware.requireAuth(req, res);
      if (!session) return;
      if (pilotEnabled()) await this.pilot().validateSession(AuthMiddleware.extractToken(req)!,session);
      const isAdmin = AuthTokenManager.isAuthorized(session.role, UserRole.ADMINISTRATOR);
      const isRiskManager = AuthTokenManager.isAuthorized(session.role, UserRole.RISK_MANAGER);
      const isTrader = session.role === UserRole.TRADER || isRiskManager || isAdmin;

      if (pilotEnabled()) {
        if (pathname==='/api/v1/account/protection' && ['GET','POST'].includes(req.method||'')) {
          this.sendJson(res,200,await this.pilot().protection(session.userId,req.method==='POST'?await this.parseJsonBody(req):undefined)); return;
        }
        if (pathname==='/api/v1/account/notifications' && req.method==='GET') {
          const notifications=(await this.pilot().pool.query('SELECT id,event_type,payload,created_at FROM points_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[session.userId])).rows;
          this.sendJson(res,200,{notifications}); return;
        }
        if (pathname==='/api/v1/settlement/reconciliation' && req.method==='GET') {
          if(!isRiskManager){this.sendJson(res,403,{error:'FORBIDDEN'});return;}
          this.sendJson(res,200,await this.pilot().reconciliation());return;
        }
        if (['/api/v1/trader/freeze/global','/api/v1/trader/freeze/fixture'].includes(pathname)&&req.method==='POST') {
          if(!isTrader){this.sendJson(res,403,{error:'FORBIDDEN'});return;}
          const body=await this.parseJsonBody(req);
          this.sendJson(res,200,{success:true,record:await this.pilot().freeze(session.userId,pathname.endsWith('/fixture')?String(body.fixtureId||''):null,body.frozen as boolean,String(body.reason||''))});return;
        }
        if(pathname==='/api/v1/trader/state' && req.method==='GET') {
          if(!isTrader){this.sendJson(res,403,{error:'FORBIDDEN'});return;}
          const control=(await this.pilot().pool.query('SELECT frozen FROM points_pilot_control WHERE id=1')).rows[0];
          const audit=(await this.pilot().pool.query('SELECT * FROM points_trader_audit_log ORDER BY created_at DESC LIMIT 20')).rows;
          this.sendJson(res,200,{control,fixtures:await this.pilot().fixtures(),audit});return;
        }
        if(pathname.startsWith('/api/v1/trader/')){this.sendJson(res,503,{error:'PILOT_FEATURE_DISABLED'});return;}
      }
      // 2. Get User Balance: GET /api/v1/wallet/balance/:userId
      if (pathname.startsWith('/api/v1/wallet/balance/') && req.method === 'GET') {
        const userId = pathname.replace('/api/v1/wallet/balance/', '');
        if (session.userId !== userId && !isAdmin) {
          this.sendJson(res, 403, { error: 'FORBIDDEN' });
          return;
        }

        const durable = this.durable();
        if (durable && !isAdmin && session.currencyCode !== 'PTS') {
          this.sendJson(res, 400, { error: 'POINTS_ONLY' }); return;
        }
        const balance = durable ? await durable.getBalance(userId) : this.ledger.getBalance(userId);
        this.sendJson(res, 200, { userId, currencyCode: durable ? 'PTS' : 'USD', balance });
        return;
      }

      // 3. User Deposit: POST /api/v1/wallet/deposit
      if (pathname === '/api/v1/wallet/deposit' && req.method === 'POST') {
        if (!isAdmin) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        if (this.durable()) { this.sendJson(res, 503, { error: 'PAYMENT_LEDGER_UNAVAILABLE' }); return; }
        const body = await this.parseJsonBody(req);
        const entry = this.ledger.deposit(String(body.userId), Number(body.amount), String(body.currencyCode || 'USD'));
        const newBalance = this.ledger.getBalance(String(body.userId), String(body.currencyCode || 'USD'));
        this.sendJson(res, 201, { success: true, journalEntryId: entry.id, newBalance });
        return;
      }

      // 3b. Admin Points Adjustment: POST /api/v1/admin/points/adjust
      //     Body: { userId, delta, reason?, currencyCode? }  (delta: +grant / -revoke)
      if (pathname === '/api/v1/admin/points/adjust' && req.method === 'POST') {
        if (!isAdmin) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const body = await this.parseJsonBody(req);
        const durable = this.durable();
        if (durable) {
          if (body.currencyCode && body.currencyCode !== 'PTS') {
            this.sendJson(res, 400, { error: 'POINTS_ONLY' }); return;
          }
          const result = await durable.adjustPoints(String(body.userId || ''), Number(body.delta), String(body.idempotencyKey || ''));
          this.sendJson(res, 200, { success: true, userId: String(body.userId), ...result });
          return;
        }
        const result = this.ledger.adminAdjustPoints(
          String(body.userId),
          Number(body.delta),
          String(body.reason || 'Admin adjustment'),
          String(body.currencyCode || 'PTS')
        );
        this.sendJson(res, 200, {
          success: true,
          userId: String(body.userId),
          journalEntryId: result.journalEntry.id,
          newBalance: result.newBalance,
        });
        return;
      }

      // 4. Issue a short-lived, server-priced quote for one selection.
      if (pathname === '/api/v1/bets/quote' && req.method === 'POST') {
        const durable = this.durable();
        if (durable && session.currencyCode !== 'PTS') { this.sendJson(res, 400, { error: 'POINTS_ONLY' }); return; }
        const body = await this.parseJsonBody(req);
        const quote = await this.quoteService.issue(
          session.userId, String(body.fixtureId || ''), String(body.marketId || ''), String(body.selectionId || '')
        );
        if (durable) await durable.issueQuote(quote);
        this.sendJson(res, 201, { quote });
        return;
      }

      // 5. Place Bet: POST /api/v1/bets/place
      if (pathname === '/api/v1/bets/place' && req.method === 'POST') {
        const durable = this.durable();
        if (durable && session.currencyCode !== 'PTS') { this.sendJson(res, 400, { error: 'POINTS_ONLY' }); return; }
        const body = await this.parseJsonBody(req);
        if (body.userId && session.userId !== body.userId) {
          this.sendJson(res, 403, { error: 'FORBIDDEN', message: 'Cannot place bets for another user' });
          return;
        }
        if (body.legs || body.submittedOdds || !body.quoteId || (body.betType && body.betType !== 'SINGLE')) {
          this.sendJson(res, 400, { error: 'SERVER_QUOTE_REQUIRED', message: 'Place a single bet using a server quoteId and stake.' });
          return;
        }
        const stake = Number(body.stake);
        if (!Number.isFinite(stake) || stake <= 0) {
          this.sendJson(res, 400, { error: 'INVALID_STAKE' });
          return;
        }
        if (durable) {
          const result = await durable.accept(
            session.userId, String(body.quoteId), String(body.idempotencyKey || ''), stake,
            (selection) => this.quoteService.revalidate(selection),
          );
          this.sendJson(res, 201, { success: true, ...result });
          return;
        }
        const quoted = await this.quoteService.consume(session.userId, String(body.quoteId));
        const request: PlaceBetRequest = {
          userId: session.userId,
          currencyCode: session.currencyCode,
          betType: 'SINGLE',
          stake,
          oddsTolerance: 'REJECT_ON_CHANGE',
          legs: [{
            fixtureId: quoted.fixtureId,
            fixtureName: quoted.fixtureName,
            marketId: quoted.marketId,
            marketName: quoted.marketName,
            selectionId: quoted.selectionId,
            selectionName: quoted.selectionName,
            submittedOdds: quoted.odds,
          }],
        };
        const ticket = this.betService.placeBet(request, () => quoted.odds);
        const remainingBalance = this.ledger.getBalance(session.userId, session.currencyCode);
        this.sendJson(res, 201, { success: true, ticket, remainingBalance });
        return;
      }

      // 6. Get Ticket: GET /api/v1/bets/tickets/:id
      if (pathname.startsWith('/api/v1/bets/tickets/') && req.method === 'GET') {
        const slipId = pathname.replace('/api/v1/bets/tickets/', '');
        const durable = this.durable();
        const ticket = durable ? await durable.getTicket(slipId) : this.betService.getTicket(slipId);
        if (ticket && ticket.userId !== session.userId && !isAdmin) {
          this.sendJson(res, 403, { error: 'FORBIDDEN' });
          return;
        }
        if (ticket) {
          this.sendJson(res, 200, { ticket });
        } else {
          this.sendJson(res, 404, { error: 'Ticket not found' });
        }
        return;
      }

      // 6. Get User Tickets: GET /api/v1/bets/user/:userId
      if (pathname.startsWith('/api/v1/bets/user/') && req.method === 'GET') {
        const userId = pathname.replace('/api/v1/bets/user/', '');
        if (userId !== session.userId && !isAdmin) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const durable = this.durable();
        const tickets = durable ? await durable.getUserTickets(userId) : this.betService.getUserTickets(userId);
        this.sendJson(res, 200, { tickets, count: tickets.length });
        return;
      }

      // 7. Get Cashout Quote: GET /api/v1/bets/:slipId/cashout
      if (pathname.startsWith('/api/v1/bets/') && pathname.endsWith('/cashout') && req.method === 'GET') {
        const parts = pathname.split('/');
        const slipId = parts[4];
        const ticket = this.betService.getTicket(slipId);
        if (!ticket || ticket.userId !== session.userId) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const quote = this.cashoutService.getCashoutQuote(slipId);
        this.sendJson(res, 200, { success: true, quote });
        return;
      }

      // 7b. Execute Cashout: POST /api/v1/bets/cashout
      if (pathname === '/api/v1/bets/cashout' && req.method === 'POST') {
        if (this.durable()) { this.sendJson(res, 503, { error: 'DURABLE_CASHOUT_UNAVAILABLE' }); return; }
        const body = await this.parseJsonBody(req);
        const ticket = this.betService.getTicket(String(body.slipId));
        if (!ticket || ticket.userId !== session.userId) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const pct = body.cashoutPercentage !== undefined && !Number.isNaN(Number(body.cashoutPercentage))
          ? Number(body.cashoutPercentage)
          : 1.0;
        const expectedAmt = body.expectedAmount !== undefined && !Number.isNaN(Number(body.expectedAmount))
          ? Number(body.expectedAmount)
          : undefined;
        const cashedOutSlip = this.cashoutService.executeCashout(String(body.slipId), expectedAmt, pct);
        const newBalance = this.ledger.getBalance(cashedOutSlip.userId, cashedOutSlip.currencyCode);
        this.sendJson(res, 200, { success: true, ticket: cashedOutSlip, newBalance });
        return;
      }

      // 8. Submit Fixture Result (Backoffice / Risk Manager): POST /api/v1/settlement/fixture-result
      if (pathname === '/api/v1/settlement/fixture-result' && req.method === 'POST') {
        if (!isRiskManager) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        if (pilotEnabled()) {
          const body=await this.parseJsonBody(req);
          this.sendJson(res,200,{success:true,summary:await this.pilot().settle(body,session.userId)});return;
        }
        if (this.durable()) { this.sendJson(res, 503, { error: 'DURABLE_SETTLEMENT_UNAVAILABLE' }); return; }

        const body = (await this.parseJsonBody(req)) as unknown as FixtureResultSubmission;
        const summary = this.resultingService.submitFixtureResult(body);
        this.sendJson(res, 200, { success: true, summary });
        return;
      }

      // 9. Manually Settle Specific Ticket: POST /api/v1/settlement/settle-ticket
      if (pathname === '/api/v1/settlement/settle-ticket' && req.method === 'POST') {
        if (!isRiskManager) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        if (this.durable()) { this.sendJson(res, 503, { error: 'DURABLE_SETTLEMENT_UNAVAILABLE' }); return; }

        const body = (await this.parseJsonBody(req)) as { slipId: string; resolutions: Record<string, LegStatus> };
        const resolutionMap = new Map<string, LegStatus>(Object.entries(body.resolutions || {}));
        const settledSlip = this.settlementEngine.settleBetSlip(body.slipId, resolutionMap);
        this.sendJson(res, 200, { success: true, ticket: settledSlip });
        return;
      }

      // 10. Run Reconciliation Sweep: POST /api/v1/settlement/sweep
      if (pathname === '/api/v1/settlement/sweep' && req.method === 'POST') {
        if (!isRiskManager) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        if (this.durable()) { this.sendJson(res, 503, { error: 'DURABLE_SETTLEMENT_UNAVAILABLE' }); return; }
        const sweptCount = this.workerQueue.runReconciliationSweep();
        this.sendJson(res, 200, { success: true, enqueuedCount: sweptCount, stats: this.workerQueue.getStats() });
        return;
      }

      // 11. Get Unsettled Tickets: GET /api/v1/settlement/unsettled
      if (pathname === '/api/v1/settlement/unsettled' && req.method === 'GET') {
        if (!isRiskManager) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        if (this.durable()) { this.sendJson(res, 503, { error: 'DURABLE_SETTLEMENT_UNAVAILABLE' }); return; }
        const tickets = this.betService.getUnsettledTickets();
        this.sendJson(res, 200, { tickets, count: tickets.length });
        return;
      }

      // 12. Get Settlement Worker Stats: GET /api/v1/settlement/stats
      if (pathname === '/api/v1/settlement/stats' && req.method === 'GET') {
        if (!isRiskManager) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        if (this.durable()) { this.sendJson(res, 503, { error: 'DURABLE_SETTLEMENT_UNAVAILABLE' }); return; }
        this.sendJson(res, 200, { stats: this.workerQueue.getStats() });
        return;
      }

      // 13. Get DLQ (Dead Letter Queue): GET /api/v1/settlement/dlq
      if (pathname === '/api/v1/settlement/dlq' && req.method === 'GET') {
        if (!isAdmin) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        if (this.durable()) { this.sendJson(res, 503, { error: 'DURABLE_SETTLEMENT_UNAVAILABLE' }); return; }
        this.sendJson(res, 200, { dlq: this.workerQueue.getDLQ() });
        return;
      }

      // 14. Trader & Operations Console: GET /api/v1/trader/health-summary
      if (pathname === '/api/v1/trader/health-summary' && req.method === 'GET') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const summary = this.traderOps.getOperationalHealthSummary();
        this.sendJson(res, 200, { success: true, summary });
        return;
      }

      // 15. Trader Global Emergency Freeze: POST /api/v1/trader/freeze/global
      if (pathname === '/api/v1/trader/freeze/global' && req.method === 'POST') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const body = await this.parseJsonBody(req);
        const record = this.traderOps.setGlobalEmergencyFreeze(
          session.username,
          Boolean(body.frozen),
          String(body.reason || 'Manual emergency freeze')
        );
        this.sendJson(res, 200, { success: true, record });
        return;
      }

      // 16. Trader Fixture Freeze: POST /api/v1/trader/freeze/fixture
      if (pathname === '/api/v1/trader/freeze/fixture' && req.method === 'POST') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const body = await this.parseJsonBody(req);
        const record = this.traderOps.setFixtureFreeze(
          session.username,
          String(body.fixtureId),
          Boolean(body.frozen),
          String(body.reason || 'Manual fixture freeze'),
          body.durationSeconds !== undefined ? Number(body.durationSeconds) : undefined
        );
        this.sendJson(res, 200, { success: true, record });
        return;
      }

      // 17. Trader Market Freeze: POST /api/v1/trader/freeze/market
      if (pathname === '/api/v1/trader/freeze/market' && req.method === 'POST') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const body = await this.parseJsonBody(req);
        const record = this.traderOps.setMarketFreeze(
          session.username,
          String(body.fixtureId),
          String(body.marketType),
          Boolean(body.frozen),
          String(body.reason || 'Manual market freeze'),
          body.durationSeconds !== undefined ? Number(body.durationSeconds) : undefined
        );
        this.sendJson(res, 200, { success: true, record });
        return;
      }

      // 18. Trader Price Shading Override: POST /api/v1/trader/override/shading
      if (pathname === '/api/v1/trader/override/shading' && req.method === 'POST') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const body = await this.parseJsonBody(req);
        const record = this.traderOps.setPriceShadingOverride(
          session.username,
          String(body.fixtureId),
          String(body.marketType),
          String(body.selection),
          Number(body.multiplier),
          String(body.reason || 'Manual shading override'),
          Number(body.durationSeconds || 300)
        );
        this.sendJson(res, 200, { success: true, record });
        return;
      }

      // 19. Trader Target Margin Override: POST /api/v1/trader/override/margin
      if (pathname === '/api/v1/trader/override/margin' && req.method === 'POST') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const body = await this.parseJsonBody(req);
        const record = this.traderOps.setMarginOverride(
          session.username,
          String(body.fixtureId),
          Number(body.targetMargin),
          String(body.reason || 'Manual margin adjustment'),
          Number(body.durationSeconds || 600)
        );
        this.sendJson(res, 200, { success: true, record });
        return;
      }

      // 20. Trader Audit Log: GET /api/v1/trader/audit-log
      if (pathname === '/api/v1/trader/audit-log' && req.method === 'GET') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50;
        const actor = url.searchParams.get('actor') || undefined;
        const action = (url.searchParams.get('action') as any) || undefined;
        const logs = this.traderOps.getAuditLog({ limit, actor, action });
        this.sendJson(res, 200, { success: true, count: logs.length, logs });
        return;
      }

      // 21. Post-Match Tribunal Preview: POST /api/v1/trader/tribunal/preview
      if (pathname === '/api/v1/trader/tribunal/preview' && req.method === 'POST') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const body = await this.parseJsonBody(req);
        const preview = this.traderOps.previewTribunalReversal(
          String(body.fixtureId),
          body.revisedScore as { home: number; away: number }
        );
        this.sendJson(res, 200, { success: true, preview });
        return;
      }

      // 22. Post-Match Tribunal Commit: POST /api/v1/trader/tribunal/commit
      if (pathname === '/api/v1/trader/tribunal/commit' && req.method === 'POST') {
        if (!isTrader) { this.sendJson(res, 403, { error: 'FORBIDDEN' }); return; }
        const body = await this.parseJsonBody(req);
        const report = await this.traderOps.executeTribunalCorrection(
          session.username,
          String(body.fixtureId),
          body.revisedScore as { home: number; away: number },
          String(body.reason || 'Tribunal result correction')
        );
        this.sendJson(res, 200, { success: true, report });
        return;
      }

      // 404 Not Found
      this.sendJson(res, 404, { error: 'Not Found', path: pathname });
    } catch (err: unknown) {
      if (err instanceof QuoteError) {
        this.sendJson(res, err.statusCode, { error: err.code });
        return;
      }
      if (err instanceof AcceptanceError) {
        this.sendJson(res, err.statusCode, { error: err.code });
        return;
      }
      const failure = toPublicError(err, 'betting-engine');
      this.sendJson(res, failure.status, failure.body);
    }
  }

  /** Client address for rate limiting; proxy headers are honoured only when XBET_TRUST_PROXY=true. */
  private clientAddress(req: IncomingMessage): string {
    const forwarded = req.headers['x-real-ip'];
    if (process.env.XBET_TRUST_PROXY === 'true' && typeof forwarded === 'string' && forwarded.trim()) return forwarded.trim();
    return req.socket?.remoteAddress || 'local';
  }

  /**
   * Fixed one-minute windows per client address and per username, so one noisy
   * client (or a shared proxy address) cannot lock every other user out.
   */
  private authRateLimited(address: string, username: string): boolean {
    const now = Date.now();
    for (const [key, value] of this.authAttempts) if (now - value.since > 60000) this.authAttempts.delete(key);
    const keys: Array<[string, number]> = [[`ip:${address}`, 30]];
    if (username) keys.push([`user:${username.trim().toLowerCase()}`, 10]);
    let limited = false;
    for (const [key, limit] of keys) {
      const attempts = this.authAttempts.get(key) || { count: 0, since: now };
      attempts.count++;
      this.authAttempts.set(key, attempts);
      if (attempts.count > limit) limited = true;
    }
    // Bound memory by evicting the oldest windows rather than rejecting everyone.
    for (const key of this.authAttempts.keys()) {
      if (this.authAttempts.size <= 10000) break;
      this.authAttempts.delete(key);
    }
    return limited;
  }

  private parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = '';
      let bytes = 0;
      req.on('data', (chunk) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 65536) { reject(new AcceptanceError('BODY_TOO_LARGE', 413)); return; }
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          reject(new Error('INVALID_JSON_BODY'));
        }
      });
      req.on('error', reject);
    });
  }

  private sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload, null, 2));
  }
}
