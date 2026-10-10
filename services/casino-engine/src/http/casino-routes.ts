import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { SeamlessWalletAdapter } from '../seamless-wallet/wallet-adapter.ts';
import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import { BlackjackEngine } from '../games/blackjack.ts';
import { EuropeanRouletteEngine } from '../games/roulette.ts';
import { BaccaratEngine } from '../games/baccarat.ts';
import { SlotMachineEngine } from '../games/slots.ts';
import { CaribbeanStudPokerEngine } from '../games/stud-poker.ts';
import { HighLowEngine } from '../games/high-low.ts';
import { ScratchCardEngine } from '../games/scratch.ts';
import { KenoEngine } from '../games/keno.ts';
import { BingoEngine } from '../games/bingo.ts';
import { VirtualRacingEngine } from '../games/virtual-racing.ts';
import { LiveCasinoAggregator } from '../live-casino/live-casino-aggregator.ts';
import { AviatorEngine } from '../games/aviator.ts';
import { PlinkoEngine } from '../games/plinko.ts';
import { LuckyBallsEngine } from '../games/lucky-balls.ts';
import { ClassicSlotEngine } from '../games/classic-slots.ts';
import { AuthMiddleware, AuthTokenManager, UserRole } from '../../../../packages/core-types/src/auth.ts';
import { toPublicError } from '../../../../packages/core-types/src/http-errors.ts';
import { PilotStore, pilotEnabled } from '../../../betting-engine/src/pilot/pilot-store.ts';
import { PilotRouletteService } from '../durable/pilot-roulette.ts';
import { AcceptanceError } from '../../../betting-engine/src/betting/durable-acceptance.ts';
import { DurableCasinoService, CasinoError } from '../durable/durable-casino-service.ts';
import type { RouletteBet } from '../games/roulette.ts';

export class CasinoHttpRouter {
  private pilotStore?: PilotStore;
  private pilotRoulette?: PilotRouletteService;
  private wallet: SeamlessWalletAdapter;
  private virtualRacing: VirtualRacingEngine;
  private liveCasino: LiveCasinoAggregator;
  private aviator: AviatorEngine;
  private durableService: DurableCasinoService;
  private parsedBodies = new WeakMap<IncomingMessage, Record<string, unknown>>();

  constructor() {
    this.wallet = SeamlessWalletAdapter.getInstance();
    this.virtualRacing = VirtualRacingEngine.getInstance();
    this.liveCasino = LiveCasinoAggregator.getInstance();
    this.aviator = AviatorEngine.getInstance();
    this.durableService = DurableCasinoService.getInstance();
  }

  public async close(): Promise<void> {
    await this.durableService.close();
    await this.pilotStore?.close();
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
      // 1. Health check
      if (pathname === '/api/v1/health' && req.method === 'GET') {
        this.sendJson(res, 200, {
          status: 'OK',
          service: 'Casino RGS & Virtual Games Engine',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 2. Games Catalog: GET /api/v1/casino/games
      if (pathname === '/api/v1/casino/games' && req.method === 'GET') {
        const games = [
          { id: '1', gameCode: 'aviator_crash', slug: 'aviator', title: 'Aviator Crash', category: 'CRASH', rtpPercentage: 97.0, minBet: 0.2, maxBet: 1000.0, isFeatured: true },
          { id: '2', gameCode: 'plinko', slug: 'plinko', title: 'Plinko Pegboard', category: 'INSTANT', rtpPercentage: 97.0, minBet: 0.2, maxBet: 500.0, isFeatured: true },
          { id: '3', gameCode: 'lucky_balls_6', slug: 'lucky-balls', title: 'Lucky 6 Balls', category: 'LOTTERY', rtpPercentage: 95.5, minBet: 0.5, maxBet: 500.0, isFeatured: true },
          { id: '4', gameCode: 'dogs_racing', slug: 'dogs', title: 'Dogs Video Racing', category: 'VIRTUAL_SPORTS', rtpPercentage: 95.0, minBet: 0.5, maxBet: 1000.0, isFeatured: true },
          { id: '5', gameCode: 'ancient_treasure', slug: 'ancient-treasure', title: 'Ancient Treasure Deluxe', category: 'SLOT', rtpPercentage: 95.1, minBet: 0.1, maxBet: 100.0, isFeatured: true },
          { id: '6', gameCode: 'blazing_sevens', slug: 'blazing-sevens', title: 'Blazing Sevens Deluxe', category: 'SLOT', rtpPercentage: 95.6, minBet: 0.1, maxBet: 100.0, isFeatured: true },
          { id: '7', gameCode: 'fortune_charm', slug: 'fortune-charm', title: 'Fortune Charm', category: 'SLOT', rtpPercentage: 95.1, minBet: 0.1, maxBet: 100.0, isFeatured: true },
          { id: '8', gameCode: 'roulette_european', slug: 'roulette', title: 'European Roulette', category: 'TABLE', rtpPercentage: 97.3, minBet: 0.5, maxBet: 2000.0, isFeatured: true },
          { id: '9', gameCode: 'blackjack_classic', slug: 'blackjack', title: 'European Blackjack', category: 'TABLE', rtpPercentage: 99.5, minBet: 1.0, maxBet: 1000.0, isFeatured: true },
          { id: '10', gameCode: 'live_casino_studios', slug: 'livecasino', title: 'Live Casino Studios (B2B)', category: 'LIVE_DEALER', rtpPercentage: 98.5, minBet: 1.0, maxBet: 5000.0, isFeatured: true },
        ];
        const enabledGames=pilotEnabled()?games.filter(game=>game.slug==='roulette'):games;
        this.sendJson(res, 200, { games:enabledGames, count:enabledGames.length });
        return;
      }


      const session = AuthMiddleware.requireAuth(req, res);
      if (!session) return;
      if(pilotEnabled()){
        this.pilotStore ??= new PilotStore();
        await this.pilotStore.validateSession(AuthMiddleware.extractToken(req)!,session);
        this.pilotRoulette ??= new PilotRouletteService(this.pilotStore);
        if(pathname==='/api/v1/casino/roulette/commitment' && req.method==='POST'){
          const body=await this.parseJsonBody(req);
          this.sendJson(res,201,{commitment:await this.pilotRoulette.prepare(session.userId,String(body.idempotencyKey||''))});return;
        }
        if(pathname==='/api/v1/casino/play/roulette' && req.method==='POST'){
          const body=await this.parseJsonBody(req);
          if(body.userId && body.userId!==session.userId){this.sendJson(res,403,{error:'FORBIDDEN'});return;}
          const result=await this.pilotRoulette.play({userId:session.userId,idempotencyKey:String(body.idempotencyKey||''),commitmentId:String(body.commitmentId||''),clientSeed:String(body.clientSeed||''),bets:body.bets as RouletteBet[]});
          this.sendJson(res,200,{success:true,result,newBalance:result.balanceAfter});return;
        }
        if(!pathname.startsWith('/api/v1/casino/rounds/') && pathname!=='/api/v1/casino/verify'){
          this.sendJson(res,503,{error:'PILOT_FEATURE_DISABLED'});return;
        }
      }
      const isDurableSupported =
        pathname === '/api/v1/casino/play/roulette' ||
        pathname === '/api/v1/casino/verify' ||
        pathname.startsWith('/api/v1/casino/rounds/') ||
        pathname === '/api/v1/virtual-sports/bet' ||
        pathname === '/api/v1/virtual-sports/verify' ||
        pathname.startsWith('/api/v1/virtual-sports/races');

      if (!isDurableSupported && process.env.DATABASE_URL && (process.env.NODE_ENV === 'production' || process.env.XBET_ALLOW_VOLATILE_CASINO !== 'true')) {
        this.sendJson(res, 503, { error: 'GAME_NOT_DURABLE_YET' });
        return;
      }
      const isAdmin = AuthTokenManager.isAuthorized(session.role, UserRole.ADMINISTRATOR);
      const operatorRoutes = new Set([
        '/api/wallet/admin-adjust', '/api/wallet/seed', '/api/wallet/debit', '/api/v1/rgs/wager',
        '/api/wallet/credit', '/api/v1/rgs/payout', '/api/wallet/rollback',
        '/api/v1/virtual-sports/simulate', '/api/v1/casino/play/aviator/round',
      ]);
      const operatorRoute = operatorRoutes.has(pathname);
      if (operatorRoute && !isAdmin) {
        this.sendJson(res, 403, { error: 'FORBIDDEN' });
        return;
      }
      if (req.method === 'GET' && url.searchParams.has('userId') && url.searchParams.get('userId') !== session.userId && !isAdmin) {
        this.sendJson(res, 403, { error: 'FORBIDDEN' });
        return;
      }
      if (req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        if (!operatorRoute) {
          if (body.userId !== undefined && String(body.userId) !== session.userId) {
            this.sendJson(res, 403, { error: 'FORBIDDEN' });
            return;
          }
          body.userId = session.userId;
        }
      }

      // 3. Launch Session: POST /api/v1/casino/sessions/launch
      if (pathname === '/api/v1/casino/sessions/launch' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const sessionToken = this.wallet.createSession(String(body.userId), String(body.gameCode), String(body.currencyCode || 'USD'));
        this.sendJson(res, 200, { success: true, sessionToken, launchUrl: `/casino/${body.gameCode}/index.html?session=${sessionToken}` });
        return;
      }

      // 4. Play Blackjack: POST /api/v1/casino/play/blackjack
      if (pathname === '/api/v1/casino/play/blackjack' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const action = String(body.action || 'DEAL').toUpperCase();
        const wager = Number(body.wager || 10.0);
        const userId = String(body.userId);

        const seeds = ProvablyFairRNG.generateSeedPair();
        let result;

        if (action === 'DEAL') {
          // Debit wager via Seamless Wallet
          this.wallet.processWager(userId, 'round_bj', 'blackjack_classic', wager);
          result = BlackjackEngine.deal({
            userId,
            wager,
            serverSeed: seeds.serverSeed,
            clientSeed: seeds.clientSeed,
            nonce: 1,
          });
          if (result.isCompleted) {
            this.wallet.processPayout(userId, result.roundId, 'blackjack_classic', wager, result.payout);
          }
        } else if (action === 'HIT') {
          result = BlackjackEngine.hit(body.gameState as Record<string, unknown>, wager, userId, String(body.roundId));
          if (result.isCompleted) {
            this.wallet.processPayout(userId, result.roundId, 'blackjack_classic', wager, result.payout);
          }
        } else if (action === 'STAND') {
          result = BlackjackEngine.stand(body.gameState as Record<string, unknown>, wager, userId, String(body.roundId));
          this.wallet.processPayout(userId, result.roundId, 'blackjack_classic', wager, result.payout);
        } else {
          throw new Error(`Unknown blackjack action: ${action}`);
        }

        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 5. Play European Roulette: POST /api/v1/casino/play/roulette
      if (pathname === '/api/v1/casino/play/roulette' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const bets = body.bets as RouletteBet[];
        const idempotencyKey = String(body.idempotencyKey || `key-roulette-${session.userId}-${Date.now()}`);
        const clientSeed = body.clientSeed ? String(body.clientSeed) : undefined;

        const result = await this.durableService.playRoulette({
          userId: session.userId,
          idempotencyKey,
          bets,
          clientSeed,
          currencyCode: session.currencyCode,
        });

        this.sendJson(res, 200, { success: true, result, newBalance: result.balanceAfter });
        return;
      }

      // 5b. Verify Casino Round: POST /api/v1/casino/verify
      if (pathname === '/api/v1/casino/verify' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const serverSeed = String(body.serverSeed || '');
        const clientSeed = String(body.clientSeed || '');
        const nonce = Number(body.nonce || 1);
        const bets = body.bets as RouletteBet[];

        const verification = this.durableService.verifyRound({
          serverSeed,
          clientSeed,
          nonce,
          bets,
        });

        this.sendJson(res, 200, { success: true, verification });
        return;
      }

      // 5c. Get Durable Round: GET /api/v1/casino/rounds/:id
      if (pathname.startsWith('/api/v1/casino/rounds/') && req.method === 'GET') {
        const roundId = pathname.replace('/api/v1/casino/rounds/', '');
        const round = await this.durableService.getRound(roundId);
        if (!round) {
          this.sendJson(res, 404, { error: 'ROUND_NOT_FOUND' });
          return;
        }
        if (round.userId !== session.userId && !isAdmin) {
          this.sendJson(res, 403, { error: 'FORBIDDEN' });
          return;
        }
        this.sendJson(res, 200, { round });
        return;
      }

      // 6. Play Baccarat: POST /api/v1/casino/play/baccarat
      if (pathname === '/api/v1/casino/play/baccarat' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 10.0);
        const betSide = (body.betSide || 'PLAYER') as 'PLAYER' | 'BANKER' | 'TIE';

        this.wallet.processWager(userId, 'rnd_baccarat', 'baccarat_pro', wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = BaccaratEngine.play({
          userId,
          betSide,
          wager,
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        this.wallet.processPayout(userId, result.roundId, 'baccarat_pro', wager, result.payout);
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 7. Play Slots: POST /api/v1/casino/play/slots
      if (pathname === '/api/v1/casino/play/slots' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 5.0);

        this.wallet.processWager(userId, 'rnd_slots', 'slot_fruits', wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = SlotMachineEngine.spin({
          userId,
          wager,
          gameCode: String(body.gameCode || 'slot_fruits'),
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        this.wallet.processPayout(userId, result.roundId, result.gameCode, wager, result.payout);
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 7b. Play Caribbean Stud Poker: POST /api/v1/casino/play/stud
      if (pathname === '/api/v1/casino/play/stud' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const action = String(body.action || 'DEAL').toUpperCase();
        const userId = String(body.userId);
        const anteWager = Number(body.wager || body.anteWager || 10.0);

        const seeds = ProvablyFairRNG.generateSeedPair();
        let result;

        if (action === 'DEAL') {
          this.wallet.processWager(userId, 'rnd_stud', 'stud', anteWager);
          result = CaribbeanStudPokerEngine.deal({
            userId,
            anteWager,
            serverSeed: seeds.serverSeed,
            clientSeed: seeds.clientSeed,
            nonce: 1,
          });
        } else if (action === 'CALL') {
          const callWager = anteWager * 2;
          this.wallet.processWager(userId, 'rnd_stud_call', 'stud', callWager);
          result = CaribbeanStudPokerEngine.call(body.gameState as Record<string, unknown>, userId, String(body.roundId));
          if (result.payout > 0) {
            this.wallet.processPayout(userId, result.roundId, 'stud', anteWager + callWager, result.payout);
          }
        } else if (action === 'FOLD') {
          result = CaribbeanStudPokerEngine.fold(body.gameState as Record<string, unknown>, userId, String(body.roundId));
        } else {
          throw new Error(`Unknown stud action: ${action}`);
        }

        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 7c. Play High-Low: POST /api/v1/casino/play/highlow
      if (pathname === '/api/v1/casino/play/highlow' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 10.0);
        const choice = (String(body.choice || 'HIGHER').toUpperCase()) as 'HIGHER' | 'LOWER';

        this.wallet.processWager(userId, 'rnd_highlow', 'highlow', wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = HighLowEngine.play({
          userId,
          choice,
          wager,
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        if (result.payout > 0) {
          this.wallet.processPayout(userId, result.roundId, 'highlow', wager, result.payout);
        }
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 7d. Play Scratch: POST /api/v1/casino/play/scratch
      if (pathname === '/api/v1/casino/play/scratch' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 5.0);

        this.wallet.processWager(userId, 'rnd_scratch', 'scratch', wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = ScratchCardEngine.play({
          userId,
          wager,
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        if (result.payout > 0) {
          this.wallet.processPayout(userId, result.roundId, 'scratch', wager, result.payout);
        }
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 7e. Play Keno: POST /api/v1/casino/play/keno
      if (pathname === '/api/v1/casino/play/keno' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 5.0);
        const pickedNumbers = (body.pickedNumbers as number[]) || [3, 7, 18, 24, 55];

        this.wallet.processWager(userId, 'rnd_keno', 'keno', wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = KenoEngine.play({
          userId,
          pickedNumbers,
          wager,
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        if (result.payout > 0) {
          this.wallet.processPayout(userId, result.roundId, 'keno', wager, result.payout);
        }
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 7f. Play Bingo: POST /api/v1/casino/play/bingo
      if (pathname === '/api/v1/casino/play/bingo' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 5.0);

        this.wallet.processWager(userId, 'rnd_bingo', 'bingo', wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = BingoEngine.play({
          userId,
          wager,
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        if (result.payout > 0) {
          this.wallet.processPayout(userId, result.roundId, 'bingo', wager, result.payout);
        }
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 8. Virtual Sports Races: GET /api/v1/virtual-sports/races
      if (pathname === '/api/v1/virtual-sports/races' && req.method === 'GET') {
        const races = this.virtualRacing.getUpcomingRaces().map(({serverSeed,replay,...race})=>race);
        this.sendJson(res, 200, { races });
        return;
      }

      // 8b. Virtual Sports Place Bet: POST /api/v1/virtual-sports/bet
      if (pathname === '/api/v1/virtual-sports/bet' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = session.userId;
        const raceId = String(body.raceId);
        const runnerNumber = Number(body.runnerNumber);
        const betType = (String(body.betType || 'WIN').toUpperCase()) as any;
        const forecastSecondRunner = body.forecastSecondRunner ? Number(body.forecastSecondRunner) : undefined;
        const wager = Number(body.wager || 10.0);
        const idempotencyKey = String(body.idempotencyKey || `key-vrace-${userId}-${Date.now()}`);
        const clientSeed = body.clientSeed ? String(body.clientSeed) : undefined;

        const round = await this.durableService.playVirtualRaceBet({
          userId,
          idempotencyKey,
          raceId,
          runnerNumber,
          betType,
          forecastSecondRunner,
          wager,
          clientSeed,
          currencyCode: session.currencyCode,
        });

        const betResult = round.betResult;
        const race = round.race;
        const result = race.result!;

        this.sendJson(res, 200, {
          success: true,
          roundId: round.roundId,
          ticket: {
            userId,
            raceId,
            raceName: race.name,
            runnerNumber,
            betType,
            wager,
            placedAt: new Date().toISOString(),
          },
          won: betResult.won,
          payout: betResult.payout,
          profit: round.profit,
          message: betResult.message,
          winner: { number: result.winner.number, name: result.winner.name },
          finishOrder: result.finishOrder,
          newBalance: round.balanceAfter,
          balanceAfter: round.balanceAfter,
          serverSeedHash: round.serverSeedHash,
          serverSeed: round.serverSeed,
          replay: round.replay,
        });
        return;
      }

      // 8b-2. Virtual Sports Race Replay: GET /api/v1/virtual-sports/races/:id/replay
      if (pathname.startsWith('/api/v1/virtual-sports/races/') && pathname.endsWith('/replay') && req.method === 'GET') {
        const parts = pathname.split('/');
        const raceId = parts[parts.length - 2];
        const replay = this.virtualRacing.getRaceReplay(raceId);
        if (!replay) {
          this.sendJson(res, 404, { error: 'REPLAY_NOT_FOUND' });
          return;
        }
        this.sendJson(res, 200, { success: true, replay });
        return;
      }

      // 8b-3. Virtual Sports Verification: POST /api/v1/virtual-sports/verify
      if (pathname === '/api/v1/virtual-sports/verify' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const raceId = String(body.raceId || '');
        const serverSeed = String(body.serverSeed || '');
        const clientSeed = String(body.clientSeed || '');
        const nonce = Number(body.nonce || 1);

        const verification = this.durableService.verifyVirtualRace({
          raceId,
          serverSeed,
          clientSeed,
          nonce,
        });

        this.sendJson(res, 200, { success: true, verification });
        return;
      }

      // 8c. Virtual Sports Simulate & Settle: POST /api/v1/virtual-sports/simulate
      if (pathname === '/api/v1/virtual-sports/simulate' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const raceId = String(body.raceId);
        const serverSeed = body.serverSeed ? String(body.serverSeed) : ProvablyFairRNG.generateServerSeed();
        const clientSeed = body.clientSeed ? String(body.clientSeed) : 'client_admin';
        const nonce = body.nonce ? Number(body.nonce) : 1;
        const race = this.virtualRacing.simulateRace(raceId, serverSeed, clientSeed, nonce);

        let betResult = undefined;
        let newBalance = undefined;

        if (body.bet) {
          const bet = body.bet as any;
          betResult = this.virtualRacing.settleBet(bet, race);
          if (betResult.won && betResult.payout > 0) {
            this.wallet.processPayout(bet.userId, betResult.betId, 'virtual_racing', bet.wager, betResult.payout);
          }
          newBalance = this.wallet.getBalance(bet.userId);
        }

        this.sendJson(res, 200, { success: true, race, betResult, newBalance, replay: race.replay });
        return;
      }

      // 8d. Live Casino Launcher: POST /api/v1/live-casino/launch
      if (pathname === '/api/v1/live-casino/launch' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const session = this.liveCasino.createLaunchSession({
          userId: String(body.userId || 'usr-live-player'),
          gameCode: String(body.gameCode || 'live_roulette_vip'),
          provider: (String(body.provider || 'STUDIO_ONE').toUpperCase()) as any,
          currencyCode: String(body.currencyCode || 'USD'),
          locale: String(body.locale || 'eng'),
        });
        this.sendJson(res, 200, { success: true, session });
        return;
      }

      // 8e. Live Casino Studios: GET /api/v1/live-casino/studios
      if (pathname === '/api/v1/live-casino/studios' && req.method === 'GET') {
        const studios = [
          { provider: 'STUDIO_ONE', name: 'Live Studio One', tablesCount: 48, status: 'ONLINE', featuredGames: ['Electric Roulette', 'Wild Wheel Time', 'Unlimited Blackjack'] },
          { provider: 'STUDIO_TWO', name: 'Live Studio Two', tablesCount: 36, status: 'ONLINE', featuredGames: ['Giant Roulette', 'Fortune City', 'Candy Fortune'] },
          { provider: 'STUDIO_THREE', name: 'Live Studio Three', tablesCount: 24, status: 'ONLINE', featuredGames: ['Open Blackjack', 'Andar Bahar', 'Dragon Tiger'] },
          { provider: 'STUDIO_FOUR', name: 'Live Studio Four', tablesCount: 18, status: 'ONLINE', featuredGames: ['European Roulette Live', 'Classic Live Casino'] },
          { provider: 'STUDIO_SIX', name: 'Live Studio Six', tablesCount: 16, status: 'ONLINE', featuredGames: ['Baccarat Squeeze', 'Dragon Tiger Live'] },
          { provider: 'STUDIO_SEVEN', name: 'Live Studio Seven', tablesCount: 12, status: 'ONLINE', featuredGames: ['Live Roulette Gold', 'Heritage Roulette'] },
          { provider: 'STUDIO_EIGHT', name: 'Live Studio Eight', tablesCount: 10, status: 'ONLINE', featuredGames: ['Magic Card Live', 'Classic Baccarat'] },
        ];
        this.sendJson(res, 200, { studios });
        return;
      }

      // 8f. Live Casino Config
      if ((pathname === '/api/v1/live-casino/config' || pathname === '/mobileapi/Games/LiveCasinoConfig.js') && req.method === 'GET') {
        const config = {
          url: {
            Url1: { name: 'Live Studio One', img: 'studio-one.jpg', status: '1', prodName: 'StudioOne' },
            Url2: { name: 'Live Studio Six', img: 'studio-six.jpg', status: '1', prodName: 'StudioSix' },
            Url3: { name: 'Live Studio Seven', img: 'studio-seven.jpg', status: '1', prodName: 'StudioSeven' },
            Url4: { name: 'Live Studio Four', img: 'studio-four.jpg', status: '1', prodName: 'StudioFour' },
            Url5: { name: 'Live Studio Eight', img: 'studio-eight.jpg', status: '1', prodName: 'StudioEight' },
          },
          poker: {
            Url1: { name: 'Poker', img: 'poker.jpg', status: '1', prodName: 'texas_holdem' },
          },
        };
        this.sendJson(res, 200, config);
        return;
      }

      // 8g. Aviator / Crash Game - Create Round: POST /api/v1/casino/play/aviator/round
      if (pathname === '/api/v1/casino/play/aviator/round' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const round = this.aviator.createRound(
          body.serverSeed ? String(body.serverSeed) : undefined,
          body.clientSeed ? String(body.clientSeed) : undefined,
          body.nonce ? Number(body.nonce) : undefined
        );
        this.sendJson(res, 200, {
          success: true,
          roundId: round.roundId,
          crashMultiplier: round.crashMultiplier,
          durationMs: round.durationMs,
          startTime: round.startTime,
        });
        return;
      }

      // 8h. Aviator / Crash Game - Place Bet: POST /api/v1/casino/play/aviator/bet
      if (pathname === '/api/v1/casino/play/aviator/bet' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const roundId = String(body.roundId);
        const wager = Number(body.wager || 10.0);
        const autoCashoutMultiplier = body.autoCashoutMultiplier ? Number(body.autoCashoutMultiplier) : undefined;

        this.wallet.processWager(userId, `aviator_bet_${Date.now()}`, 'aviator_crash', wager);
        const bet = this.aviator.placeBet({ roundId, userId, wager, autoCashoutMultiplier });
        const newBalance = this.wallet.getBalance(userId);

        this.sendJson(res, 200, { success: true, bet, newBalance });
        return;
      }

      // 8i. Aviator / Crash Game - Cashout: POST /api/v1/casino/play/aviator/cashout
      if (pathname === '/api/v1/casino/play/aviator/cashout' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const roundId = String(body.roundId);
        const betId = String(body.betId);
        const currentMultiplier = Number(body.currentMultiplier || 1.5);

        if (this.aviator.getBet(roundId, betId)?.userId !== session.userId) {
          this.sendJson(res, 403, { error: 'FORBIDDEN' });
          return;
        }

        const result = this.aviator.cashOut({ roundId, betId, currentMultiplier });
        if (result.won && result.payout > 0) {
          this.wallet.processPayout(result.bet.userId, `aviator_payout_${Date.now()}`, 'aviator_crash', result.bet.wager, result.payout);
        }
        const newBalance = this.wallet.getBalance(result.bet.userId);

        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 8j. Play Plinko: POST /api/v1/casino/play/plinko
      if (pathname === '/api/v1/casino/play/plinko' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 5.0);
        const rows = body.rows ? Number(body.rows) : 8;
        const risk = (String(body.risk || 'MEDIUM').toUpperCase()) as any;
        const roundId = `rnd_plinko_${randomUUID()}`;

        this.wallet.processWager(userId, roundId, 'plinko', wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = PlinkoEngine.drop({
          userId,
          wager,
          rows,
          risk,
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        if (result.payout > 0) {
          this.wallet.processPayout(userId, result.roundId, 'plinko', wager, result.payout);
        }
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 8k. Play Lucky Balls (Lucky 6): POST /api/v1/casino/play/lucky-balls
      if (pathname === '/api/v1/casino/play/lucky-balls' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 10.0);
        const pickedNumbers = (body.pickedNumbers as number[]) || [5, 12, 23, 34, 41, 47];
        const roundId = `rnd_lucky_balls_${randomUUID()}`;

        this.wallet.processWager(userId, roundId, 'lucky_balls_6', wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = LuckyBallsEngine.draw({
          userId,
          pickedNumbers,
          wager,
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        if (result.payout > 0) {
          this.wallet.processPayout(userId, result.roundId, 'lucky_balls_6', wager, result.payout);
        }
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 8l. Play Classic 5x3 Slots: POST /api/v1/casino/play/classic-slots
      if (pathname === '/api/v1/casino/play/classic-slots' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const wager = Number(body.wager || 10.0);
        const gameCode = String(body.gameCode || 'ancient_treasure');
        const lines = body.lines ? Number(body.lines) : 10;
        const roundId = `rnd_classic_${randomUUID()}`;

        this.wallet.processWager(userId, roundId, gameCode, wager);
        const seeds = ProvablyFairRNG.generateSeedPair();
        const result = ClassicSlotEngine.spin({
          userId,
          wager,
          gameCode,
          lines,
          serverSeed: seeds.serverSeed,
          clientSeed: seeds.clientSeed,
          nonce: 1,
        });

        if (result.payout > 0) {
          this.wallet.processPayout(userId, result.roundId, gameCode, wager, result.payout);
        }
        const newBalance = this.wallet.getBalance(userId);
        this.sendJson(res, 200, { success: true, result, newBalance });
        return;
      }

      // 9. Standard Seamless Wallet API Callbacks (for 3rd-party RGS & Phaser integration)
      if ((pathname === '/api/v1/rgs/auth' || pathname === '/api/games/auth') && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const user = this.wallet.authenticate(String(body.sessionToken));
        if (user.userId !== session.userId) {
          this.sendJson(res, 403, { error: 'FORBIDDEN' });
          return;
        }
        this.sendJson(res, 200, { status: 'OK', user });
        return;
      }

      // Standard Game Launcher: POST /api/games/launch
      if ((pathname === '/api/games/launch' || pathname === '/api/v1/casino/sessions/launch') && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId || '33333333-3333-3333-3333-333333333333');
        const gameId = String(body.gameId || body.gameCode || 'blackjack');
        const sessionToken = this.wallet.createSession(userId, gameId, String(body.currencyCode || 'USD'));
        const launchUrl = `/casino/${gameId}/index.html?token=${sessionToken}&userId=${userId}`;
        this.sendJson(res, 200, { success: true, sessionToken, launchUrl, gameId, userId });
        return;
      }

      // Standard RGS Wallet Callback: /api/wallet/balance
      if ((pathname === '/api/wallet/balance' || pathname === '/api/v1/rgs/balance') && (req.method === 'GET' || req.method === 'POST')) {
        const body = req.method === 'POST' ? await this.parseJsonBody(req) : Object.fromEntries(url.searchParams.entries());
        const userId = String(body.userId || url.searchParams.get('userId') || session.userId);
        const currency = String(body.currency || body.currencyCode || 'USD');
        const balance = this.wallet.getBalance(userId, currency);
        this.sendJson(res, 200, { status: 'OK', userId, balance, currency });
        return;
      }

      // Admin Points Adjust: POST /api/wallet/admin-adjust  { userId, delta, reason? }
      if (pathname === '/api/wallet/admin-adjust' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const delta = Number(body.delta);
        const currency = String(body.currency || body.currencyCode || 'USD');
        const newBalance = this.wallet.adminAdjust(userId, delta, String(body.reason || 'Admin adjustment'), currency);
        this.sendJson(res, 200, { status: 'OK', userId, delta, balance: newBalance, currency });
        return;
      }

      // Seed / ensure demo balance: POST /api/wallet/seed  { userId, minBalance? }
      if (pathname === '/api/wallet/seed' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const minBalance = Number(body.minBalance ?? 5000);
        const currency = String(body.currency || 'USD');
        const balance = this.wallet.ensureMinimumBalance(userId, minBalance, currency);
        this.sendJson(res, 200, { status: 'OK', userId, balance, currency });
        return;
      }

      // Standard RGS Wallet Callback: /api/wallet/debit
      if ((pathname === '/api/wallet/debit' || pathname === '/api/v1/rgs/wager') && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const roundId = String(body.roundId || body.transactionId || 'rnd_spin');
        const gameId = String(body.gameId || body.gameCode || 'moneygame');
        const amount = Number(body.amount || body.betAmount || 0);
        const currency = String(body.currency || body.currencyCode || 'USD');

        const newBalance = this.wallet.processWager(userId, roundId, gameId, amount, currency);
        this.sendJson(res, 200, { status: 'OK', transactionId: body.transactionId, balance: newBalance, currency });
        return;
      }

      // Standard RGS Wallet Callback: /api/wallet/credit
      if ((pathname === '/api/wallet/credit' || pathname === '/api/v1/rgs/payout') && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const roundId = String(body.roundId || body.transactionId || 'rnd_spin');
        const gameId = String(body.gameId || body.gameCode || 'moneygame');
        const wager = Number(body.wager || body.betAmount || 0);
        const amount = Number(body.amount || body.winAmount || 0);
        const currency = String(body.currency || body.currencyCode || 'USD');

        const newBalance = this.wallet.processPayout(userId, roundId, gameId, wager, amount, currency);
        this.sendJson(res, 200, { status: 'OK', transactionId: body.transactionId, balance: newBalance, currency });
        return;
      }

      // Standard RGS Wallet Callback: /api/wallet/rollback
      if (pathname === '/api/wallet/rollback' && req.method === 'POST') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId);
        const amount = Number(body.amount || 0);
        const currency = String(body.currency || 'USD');
        const transactionId = String(body.transactionId || 'tx_rollback');

        this.wallet.deposit(userId, amount, currency, `refund-${transactionId}`);
        const currentBalance = this.wallet.getBalance(userId, currency);
        this.sendJson(res, 200, { status: 'OK', transactionId, balance: currentBalance, currency });
        return;
      }

      // Poker Lobby Tables: GET /api/v1/poker/tables
      if (pathname === '/api/v1/poker/tables' && req.method === 'GET') {
        const { PokerTableManager } = await import('../poker/poker-table-manager.ts');
        const tables = PokerTableManager.getInstance().getLobbyList();
        this.sendJson(res, 200, { tables, count: tables.length });
        return;
      }

      // 404 Not Found
      this.sendJson(res, 404, { error: 'Not Found', path: pathname });
    } catch (err: unknown) {
      if (err instanceof CasinoError || err instanceof AcceptanceError) {
        this.sendJson(res, err.statusCode, { error: err.code });
        return;
      }
      const failure = toPublicError(err, 'casino-engine');
      this.sendJson(res, failure.status, failure.body);
    }
  }

  private parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    const cached = this.parsedBodies.get(req);
    if (cached) return Promise.resolve(cached);
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
          const parsed = body ? JSON.parse(body) : {};
          this.parsedBodies.set(req, parsed);
          resolve(parsed);
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
