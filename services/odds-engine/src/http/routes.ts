import { IncomingMessage, ServerResponse } from 'http';
import { LiveStateManager } from '../domain/live-state.ts';
import { FeedIngestionService } from '../ingestion/feed-ingestion-service.ts';
import { PilotStore, pilotEnabled } from '../../../betting-engine/src/pilot/pilot-store.ts';
import { CanonicalEventLog } from '../canonical/canonical-event-log.ts';
import { FeedHealthMonitor } from '../canonical/feed-health-monitor.ts';
import { CanonicalFootballSimulator } from '../canonical/canonical-simulator.ts';
import type { CanonicalSportsEvent } from '../../../../packages/core-types/src/canonical-event.ts';
import { AuthMiddleware, UserRole } from '../../../../packages/core-types/src/auth.ts';

export class HttpRouter {
  private pilotStore?: PilotStore;
  public async close() { await this.pilotStore?.close(); }
  private stateManager: LiveStateManager;
  private feedService: FeedIngestionService;
  private canonicalLog: CanonicalEventLog;
  private healthMonitor: FeedHealthMonitor;
  private simulator: CanonicalFootballSimulator;

  constructor() {
    this.stateManager = LiveStateManager.getInstance();
    this.feedService = FeedIngestionService.getInstance();
    this.canonicalLog = CanonicalEventLog.getInstance();
    this.healthMonitor = FeedHealthMonitor.getInstance();
    this.simulator = new CanonicalFootballSimulator(this.canonicalLog);

    // Synchronize canonical log updates with live state
    this.canonicalLog.on('state:updated', ({ fixtureId, state }) => {
      const fix = this.stateManager.getFixture(fixtureId);
      if (fix) {
        this.stateManager.updateMatchState(
          fixtureId,
          state.score,
          state.minute,
          state.matchClock,
          state.status === 'FINISHED' ? 'FINISHED' : 'LIVE',
          state.lastEventId ? `Canonical event ${state.lastEventId}` : 'Match updated'
        );
      }
    });

    this.canonicalLog.on('markets:suspended', ({ fixtureId }) => {
      this.stateManager.suspendAllFixtureMarkets(fixtureId, true);
    });

    this.canonicalLog.on('markets:unsuspended', ({ fixtureId }) => {
      this.stateManager.suspendAllFixtureMarkets(fixtureId, false);
    });
  }

  public async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Enable CORS for frontend clients
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

    const isAdminRoute =
      (req.method === 'POST' && pathname.startsWith('/api/v1/feeds/ingest-')) ||
      (req.method === 'POST' && pathname === '/api/v1/canonical/events') ||
      (req.method === 'POST' && pathname.startsWith('/api/v1/canonical/simulate'));

    if (isAdminRoute) {
      if (!AuthMiddleware.requireAuth(req, res, UserRole.ADMINISTRATOR)) return;
    }

    try {
      if (pilotEnabled()) {
        this.pilotStore ??= new PilotStore();
        if (pathname.startsWith('/api/v1/fixtures') && req.method==='GET') {
          const fixtures=await this.pilotStore.fixtures();
          const suffix=pathname.slice('/api/v1/fixtures'.length);
          if(!suffix||suffix==='/in-play') { const data=suffix?fixtures.filter(f=>f.status==='LIVE'):fixtures; this.sendJson(res,200,{data,count:data.length});return; }
          const fixture=fixtures.find(f=>f.id===decodeURIComponent(suffix.slice(1)));
          this.sendJson(res,fixture?200:404,fixture?{data:fixture}:{error:'FIXTURE_NOT_FOUND'});return;
        }
        if(req.method==='POST'){this.sendJson(res,503,{error:'PILOT_FEATURE_DISABLED'});return;}
      }
      if (pathname === '/api/v1/health' && req.method === 'GET') {
        this.sendJson(res, 200, {
          status: 'OK',
          service: 'Odds Engine & Feed Ingestion Gateway',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          inPlayCount: this.stateManager.getAllInPlayFixtures().length,
          feedStats: this.feedService.getStats(),
        });
        return;
      }

      if (pathname === '/api/v1/sports' && req.method === 'GET') {
        const sports = [
          { id: 1, slug: 'soccer', name: 'Soccer', liveEventsCount: this.stateManager.getAllInPlayFixtures().length },
          { id: 2, slug: 'basketball', name: 'Basketball', liveEventsCount: 0 },
          { id: 3, slug: 'tennis', name: 'Tennis', liveEventsCount: 0 },
        ];
        this.sendJson(res, 200, { data: sports });
        return;
      }

      if (pathname === '/api/v1/fixtures/in-play' && req.method === 'GET') {
        const fixtures = this.stateManager.getAllInPlayFixtures().map((f) => this.stateManager.serializeFixture(f));
        this.sendJson(res, 200, { data: fixtures, count: fixtures.length });
        return;
      }

      if (pathname.startsWith('/api/v1/fixtures/') && req.method === 'GET') {
        const fixtureId = pathname.replace('/api/v1/fixtures/', '');
        const fixture = this.stateManager.getFixture(fixtureId);
        if (fixture) {
          this.sendJson(res, 200, { data: this.stateManager.serializeFixture(fixture) });
        } else {
          this.sendJson(res, 404, { error: 'Fixture not found' });
        }
        return;
      }

      // Feed Ingestion Routes
      if (pathname === '/api/v1/feeds/ingest-fixtures' && req.method === 'POST') {
        const body = (await this.parseBody(req)) as any;
        const fixtures = this.feedService.ingestFixtures(body.provider || 'EnetPulse', body.payload || body);
        this.sendJson(res, 200, { success: true, count: fixtures.length, fixtures });
        return;
      }

      if (pathname === '/api/v1/feeds/ingest-deltas' && req.method === 'POST') {
        const body = (await this.parseBody(req)) as any;
        const deltas = this.feedService.ingestLiveDeltas(body.provider || 'EnetPulse', body.payload || body);
        this.sendJson(res, 200, { success: true, count: deltas.length, deltas });
        return;
      }

      if (pathname === '/api/v1/feeds/ingest-scorecards' && req.method === 'POST') {
        const body = (await this.parseBody(req)) as any;
        const scorecards = this.feedService.ingestScorecards(body.provider || 'EnetPulse', body.payload || body);
        this.sendJson(res, 200, { success: true, count: scorecards.length, scorecards });
        return;
      }

      if (pathname === '/api/v1/feeds/providers' && req.method === 'GET') {
        this.sendJson(res, 200, { providers: this.feedService.getRegisteredProviders() });
        return;
      }

      if (pathname === '/api/v1/feeds/stats' && req.method === 'GET') {
        this.sendJson(res, 200, { stats: this.feedService.getStats() });
        return;
      }

      if (pathname.startsWith('/api/v1/media/radar/') && req.method === 'GET') {
        const fixtureId = pathname.replace('/api/v1/media/radar/', '');
        const fixture = this.stateManager.getFixture(fixtureId);
        const radar = {
          fixtureId,
          homeTeam: fixture?.homeTeam || 'Home',
          awayTeam: fixture?.awayTeam || 'Away',
          matchClock: fixture?.matchClock || '00:00',
          score: fixture?.score || { home: 0, away: 0 },
          lastEvent: fixture?.lastEvent || 'Match in progress',
          stats: {
            possession: { home: 54, away: 46 },
            attacks: { home: 88, away: 72 },
            dangerousAttacks: { home: 41, away: 33 },
            shotsOnTarget: { home: 5, away: 3 },
            shotsOffTarget: { home: 4, away: 6 },
            corners: { home: 6, away: 3 },
            yellowCards: { home: 1, away: 2 },
            redCards: { home: 0, away: 0 },
          },
          ballPosition: {
            x: Math.round(30 + Math.random() * 40),
            y: Math.round(20 + Math.random() * 60),
            zone: 'ATTACKING_THIRD',
          },
        };
        this.sendJson(res, 200, { radar });
        return;
      }

      if (pathname === '/api/v1/media/streams' && req.method === 'GET') {
        const streams = [
          { fixtureId: 'fix-ucl-001', title: 'Real Madrid vs Manchester City', streamUrl: 'https://streamingzeze.p2377odd.com/freebetstream/101/live.m3u8', format: 'HLS' },
          { fixtureId: 'fix-epl-002', title: 'Arsenal vs Chelsea', streamUrl: 'https://streamingzeze.p2377odd.com/freebetstream/102/live.m3u8', format: 'HLS' },
          { fixtureId: 'virtual-dogs', title: 'Virtual Greyhound Racing (24/7)', streamUrl: 'https://streamingf.p2377odd.com/dograce/live.m3u8', format: 'HLS' },
        ];
        this.sendJson(res, 200, { streams });
        return;
      }

      // Canonical Event Log & State Endpoints
      if (pathname.startsWith('/api/v1/canonical/fixtures/') && pathname.endsWith('/state') && req.method === 'GET') {
        const fixtureId = pathname.replace('/api/v1/canonical/fixtures/', '').replace('/state', '');
        const state = this.canonicalLog.getState(fixtureId);
        if (state) {
          this.sendJson(res, 200, { data: state });
        } else {
          this.sendJson(res, 404, { error: 'Canonical fixture state not found' });
        }
        return;
      }

      if (pathname.startsWith('/api/v1/canonical/fixtures/') && pathname.endsWith('/events') && req.method === 'GET') {
        const fixtureId = pathname.replace('/api/v1/canonical/fixtures/', '').replace('/events', '');
        const fromSeq = url.searchParams.has('fromSeq') ? Number(url.searchParams.get('fromSeq')) : undefined;
        const toSeq = url.searchParams.has('toSeq') ? Number(url.searchParams.get('toSeq')) : undefined;
        const upToTimestamp = url.searchParams.has('upToTimestamp') ? Number(url.searchParams.get('upToTimestamp')) : undefined;
        const events = this.canonicalLog.getEvents(fixtureId, { fromSeq, toSeq, upToTimestamp });
        this.sendJson(res, 200, { data: events, count: events.length });
        return;
      }

      if (pathname.startsWith('/api/v1/canonical/fixtures/') && pathname.endsWith('/replay') && req.method === 'POST') {
        const fixtureId = pathname.replace('/api/v1/canonical/fixtures/', '').replace('/replay', '');
        const body = (await this.parseBody(req)) as any;
        const upToTimestamp = body?.upToTimestamp ? Number(body.upToTimestamp) : (url.searchParams.has('upToTimestamp') ? Number(url.searchParams.get('upToTimestamp')) : undefined);
        const replayedState = this.canonicalLog.replay(fixtureId, upToTimestamp);
        this.sendJson(res, 200, { data: replayedState });
        return;
      }

      if (pathname === '/api/v1/canonical/events' && req.method === 'POST') {
        const body = (await this.parseBody(req)) as any;
        const events: CanonicalSportsEvent[] = Array.isArray(body) ? body : [body];
        const results = events.map((ev) => this.canonicalLog.append(ev));
        this.sendJson(res, 200, { success: true, count: events.length, results });
        return;
      }

      if (pathname === '/api/v1/canonical/simulate/milestone' && req.method === 'POST') {
        const body = (await this.parseBody(req)) as any;
        const fixtureId = body?.fixtureId || 'canonical-ars-che-01';
        const result = this.simulator.ingestMilestoneMatch(fixtureId);
        this.sendJson(res, 200, {
          success: true,
          fixtureId,
          eventCount: result.events.length,
          finalState: this.canonicalLog.getState(fixtureId),
        });
        return;
      }

      // Default 404
      this.sendJson(res, 404, { error: 'Not Found', path: pathname });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendJson(res, 400, { error: msg });
    }
  }

  private parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        try {
          if (!data) return resolve({});
          if (data.trim().startsWith('{') || data.trim().startsWith('[')) {
            resolve(JSON.parse(data));
          } else {
            resolve(data); // Return raw XML or text
          }
        } catch (e) {
          reject(new Error('INVALID_PAYLOAD'));
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
