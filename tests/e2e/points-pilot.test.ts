import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";

if (!process.env.XBET_PG_TEST_URL)
  throw new Error(
    "XBET_PG_TEST_URL is required; the pilot gate cannot skip PostgreSQL",
  );
process.env.DATABASE_URL = process.env.XBET_PG_TEST_URL;
process.env.XBET_PILOT_MODE = "true";
process.env.JWT_SECRET ||= randomBytes(32).toString("hex");
process.env.RNG_SEED_KEY ||= randomBytes(32).toString("hex");

const { PilotStore } = await import(
  "../../services/betting-engine/src/pilot/pilot-store.ts"
);
const { BettingHttpRouter } = await import(
  "../../services/betting-engine/src/http/betting-routes.ts"
);
const { CasinoHttpRouter } = await import(
  "../../services/casino-engine/src/http/casino-routes.ts"
);
const { HttpRouter } = await import(
  "../../services/odds-engine/src/http/routes.ts"
);
const { AuthTokenManager, UserRole } = await import(
  "../../packages/core-types/src/auth.ts"
);
const { ProvablyFairRNG } = await import(
  "../../services/casino-engine/src/rng/provably-fair.ts"
);
const { AppStateManager } = await import(
  "../../apps/web/src/state/app-state.ts"
);
const { VirtualRacingEngine } = await import(
  "../../services/casino-engine/src/games/virtual-racing.ts"
);
const { DurableCasinoService } = await import(
  "../../services/casino-engine/src/durable/durable-casino-service.ts"
);
const { LegacyBridgeHttpServer } = await import(
  "../../packages/legacy-bridge/src/server.ts"
);

const store = new PilotStore();
const suffix = randomUUID().slice(0, 8);
const password = `Pilot-test-${randomUUID()}`;
const fixtureId = `pilot-fixture-${suffix}`;
let betting = new BettingHttpRouter();
let casino = new CasinoHttpRouter();
const odds = new HttpRouter();
const bridge = new LegacyBridgeHttpServer();
let server: Server;
let base: string;
async function listen() {
  server = createServer((req, res) => {
    const path = req.url || "";
    if (path.startsWith("/api/v1/fixtures")) void odds.handleRequest(req, res);
    else if (
      path.startsWith("/api/v1/casino") ||
      path.startsWith("/api/v1/virtual")
    )
      void casino.handleRequest(req, res);
    else if (path.startsWith("/bridge")) {
      req.url = path.slice(7);
      void bridge.handleRequest(req, res);
    } else void betting.handleRequest(req, res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${(server.address() as any).port}`;
}
async function request(path: string, token?: string, body?: any) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}
async function grant(userId: string, amount: number, admin: string) {
  const result = await request("/api/v1/admin/points/adjust", admin, {
    userId,
    delta: amount,
    idempotencyKey: randomUUID(),
  });
  assert.equal(result.status, 200, JSON.stringify(result));
}
async function quote(token: string, marketId: string, selectionId: string) {
  const result = await request("/api/v1/bets/quote", token, {
    fixtureId,
    marketId,
    selectionId,
  });
  assert.equal(result.status, 201, JSON.stringify(result));
  return result.body.quote;
}

try {
  await listen();
  await store.pool.query(
    "UPDATE points_pilot_control SET frozen=false WHERE id=1",
  );
  const adminUser = await store.register(
    `admin_${suffix}`,
    password,
    UserRole.ADMINISTRATOR,
  );
  const admin = (
    await request("/api/v1/auth/login", undefined, {
      username: adminUser.username,
      password,
    })
  ).body.token;
  const forged = await request("/api/v1/auth/register", undefined, {
    username: `forged_${suffix}`,
    password,
    role: "ADMINISTRATOR",
  });
  assert.equal(forged.status, 400);
  const registered = await request("/api/v1/auth/register", undefined, {
    username: `player_${suffix}`,
    password,
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.role, "PLAYER");
  assert.equal(
    JSON.stringify(registered.body).includes("password_hash"),
    false,
  );
  const player = registered.body.token,
    userId = registered.body.user.id;
  assert.equal(
    (
      await request("/api/v1/auth/login", undefined, {
        username: `player_${suffix}`,
        password: "wrong",
      })
    ).status,
    401,
  );
  // Login throttling is per account and per client, never global: hammering one
  // username is limited without locking other users out from the same address.
  const throttled = [];
  for (let attempt = 0; attempt < 11; attempt++)
    throttled.push(
      (
        await request("/api/v1/auth/login", undefined, {
          username: `nobody_${suffix}`,
          password: "wrong",
        })
      ).status,
    );
  assert.deepEqual(throttled, [...Array(10).fill(401), 429]);
  assert.equal(
    (
      await request("/api/v1/auth/login", undefined, {
        username: `player_${suffix}`,
        password,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/v1/admin/points/adjust", player, {
        userId,
        delta: 100,
        idempotencyKey: randomUUID(),
      })
    ).status,
    403,
  );
  assert.equal((await request("/bridge/api/v1/admin/dashboard")).status, 401);
  assert.equal(
    (await request("/bridge/api/v1/admin/dashboard", player)).status,
    503,
  );
  assert.equal((await request("/api/v1/trader/state", player)).status, 403);
  assert.equal(
    (await request("/api/v1/trader/state", admin)).body.control.frozen,
    false,
  );
  const unregisteredToken = AuthTokenManager.createSession({
    id: userId,
    username: "forged",
    role: UserRole.ADMINISTRATOR,
    currencyCode: "PTS",
  });
  assert.equal(
    (await request(`/api/v1/wallet/balance/${userId}`, unregisteredToken))
      .status,
    401,
  );
  await grant(userId, 500, admin);
  await store.publishFixture({
    id: `disabled-nfl-${suffix}`,
    sportName: "American Football",
    status: "LIVE",
    score: { home: 0, away: 0 },
    lastUpdatedAt: Date.now(),
  });
  assert.equal(
    (await store.fixtures()).some((f) => f.id === `disabled-nfl-${suffix}`),
    false,
  );
  await store.publishFixture({
    id: fixtureId,
    sportName: "Football",
    sportId: 1,
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    status: "LIVE",
    isInPlay: true,
    score: { home: 0, away: 0 },
    matchMinute: 30,
    lastUpdatedAt: Date.now(),
    startTime: new Date(),
    tournamentName: "Pilot",
    markets: [],
  });
  const fixtures = await request(`/api/v1/fixtures/${fixtureId}`);
  assert.equal(fixtures.status, 200);
  assert.equal(fixtures.body.data.dataMode, "SIMULATED");
  const decidedFixture = `decided-total-${suffix}`;
  await store.publishFixture({
    id: decidedFixture,
    sportName: "Football",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "LIVE",
    score: { home: 3, away: 2 },
    matchMinute: 80,
    lastUpdatedAt: Date.now(),
    startTime: new Date(),
  });
  const decided = (await store.fixtures()).find((f) => f.id === decidedFixture);
  assert.ok(
    decided.markets.slice(1).every((m: any) => m.status === "SUSPENDED"),
  );
  const decidedQuote = await request("/api/v1/bets/quote", player, {
    fixtureId: decidedFixture,
    marketId: decided.markets[1].id,
    selectionId: decided.markets[1].selections[0].id,
  });
  assert.equal(decidedQuote.status, 409);
  const market = fixtures.body.data.markets[0],
    selection = market.selections[0];
  const issued = await quote(player, market.id, selection.id);
  const placement = {
    quoteId: issued.quoteId,
    stake: 10,
    idempotencyKey: randomUUID(),
  };
  const accepted = await Promise.all(
    Array.from({ length: 8 }, () =>
      request("/api/v1/bets/place", player, placement),
    ),
  );
  for (const result of accepted)
    assert.equal(result.status, 201, JSON.stringify(result));
  const ticketId = accepted[0].body.ticket.id;
  assert.ok(accepted.every((r) => r.body.ticket.id === ticketId));
  assert.equal(
    (await request(`/api/v1/wallet/balance/${userId}`, player)).body.balance,
    490,
  );
  assert.equal(
    (await request("/api/v1/bets/place", player, { ...placement, stake: 11 }))
      .status,
    409,
  );
  const stale = await quote(player, market.id, selection.id);
  await store.freeze(adminUser.id, fixtureId, true, "Integrity test");
  assert.equal(
    (
      await request("/api/v1/bets/place", player, {
        quoteId: stale.quoteId,
        stake: 10,
        idempotencyKey: randomUUID(),
      })
    ).status,
    409,
  );
  await store.freeze(adminUser.id, fixtureId, false, "Resume test");
  const freezeQuote = await quote(player, market.id, selection.id);
  await store.freeze(adminUser.id, null, true, "Global stop");
  assert.ok(
    ["MARKET_SUSPENDED", "MARKET_NOT_QUOTABLE"].includes(
      (
        await request("/api/v1/bets/place", player, {
          quoteId: freezeQuote.quoteId,
          stake: 10,
          idempotencyKey: randomUUID(),
        })
      ).body.error,
    ),
  );
  await store.freeze(adminUser.id, null, false, "Resume global");

  // Close/recreate HTTP routers: no in-memory ticket/session state is required.
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await betting.close();
  await casino.close();
  betting = new BettingHttpRouter();
  casino = new CasinoHttpRouter();
  await listen();
  assert.equal(
    (await request(`/api/v1/bets/tickets/${ticketId}`, player)).body.ticket
      .status,
    "ACCEPTED",
  );
  const resultRequest = {
    fixtureId,
    homeScore: 2,
    awayScore: 0,
    status: "FINISHED",
    source: "pilot-test-authoritative",
    idempotencyKey: randomUUID(),
  };
  const result = await request(
    "/api/v1/settlement/fixture-result",
    admin,
    resultRequest,
  );
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.body.summary.revision, 1);
  assert.equal(
    (await request(`/api/v1/bets/tickets/${ticketId}`, player)).body.ticket
      .status,
    "WON",
  );
  assert.deepEqual(
    (await request("/api/v1/settlement/fixture-result", admin, resultRequest))
      .body,
    result.body,
  );
  const corrected = await request("/api/v1/settlement/fixture-result", admin, {
    ...resultRequest,
    homeScore: 0,
    awayScore: 2,
    idempotencyKey: randomUUID(),
  });
  assert.equal(corrected.status, 200, JSON.stringify(corrected));
  assert.equal(corrected.body.summary.revision, 2);
  assert.equal(
    (await request(`/api/v1/wallet/balance/${userId}`, player)).body.balance,
    490,
  );
  assert.equal(
    (await request(`/api/v1/bets/tickets/${ticketId}`, player)).body.ticket
      .status,
    "LOST",
  );
  // A later automated (simulator) result must not override the staff correction.
  const simulated = await store.settle(
    {
      fixtureId,
      homeScore: 2,
      awayScore: 0,
      status: "FINISHED",
      source: "SIMULATED_ENGINE",
      idempotencyKey: `simulated-result:${fixtureId}:2:0`,
    },
    "SYSTEM",
    { onlyIfUnresulted: true },
  );
  assert.equal(simulated.skipped, "ALREADY_RESULTED");
  assert.equal(simulated.revision, 2);
  assert.equal(
    (await request(`/api/v1/wallet/balance/${userId}`, player)).body.balance,
    490,
  );
  assert.equal(
    (await request(`/api/v1/bets/tickets/${ticketId}`, player)).body.ticket
      .status,
    "LOST",
  );

  const prepKey = randomUUID();
  const commitment = (
    await request("/api/v1/casino/roulette/commitment", player, {
      idempotencyKey: prepKey,
    })
  ).body.commitment;
  assert.ok(commitment.serverSeedHash);
  assert.equal(commitment.serverSeed, undefined);
  const cipher = (
    await store.pool.query(
      "SELECT seed_ciphertext FROM points_roulette_commitments WHERE id=$1",
      [commitment.commitmentId],
    )
  ).rows[0].seed_ciphertext;
  assert.ok(cipher.includes(":"));
  const spinRequest = {
    idempotencyKey: randomUUID(),
    commitmentId: commitment.commitmentId,
    clientSeed: "player-selected-seed",
    bets: [{ type: "RED", value: "RED", amount: 5 }],
  };
  await store.freeze(adminUser.id, null, true, "Roulette emergency stop");
  assert.equal(
    (await request("/api/v1/casino/play/roulette", player, spinRequest)).body
      .error,
    "PILOT_FROZEN",
  );
  await store.freeze(adminUser.id, null, false, "Resume roulette");
  // Fail the final outbox write: balance, seed use, daily spend and round must all roll back.
  const triggerName = `pilot_fault_${suffix.replaceAll("-", "")}`;
  await store.pool
    .query(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.payload->>'userId' = '${userId}' AND NEW.event_type='CASINO_ROUND_SETTLED' THEN RAISE EXCEPTION 'injected outbox fault'; END IF; RETURN NEW; END $$`);
  await store.pool.query(
    `CREATE TRIGGER ${triggerName} BEFORE INSERT ON points_outbox FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`,
  );
  try {
    // Storage faults are server errors and must not leak database detail.
    assert.deepEqual(
      await request("/api/v1/casino/play/roulette", player, spinRequest),
      { status: 500, body: { error: "INTERNAL_ERROR" } },
    );
    assert.equal(
      (await request(`/api/v1/wallet/balance/${userId}`, player)).body.balance,
      490,
    );
    assert.equal(
      (
        await store.pool.query(
          "SELECT used_at FROM points_roulette_commitments WHERE id=$1",
          [commitment.commitmentId],
        )
      ).rows[0].used_at,
      null,
    );
    assert.equal(
      Number(
        (
          await store.pool.query(
            "SELECT sum(wager_minor) amount FROM points_daily_wagers WHERE user_id=$1",
            [userId],
          )
        ).rows[0].amount,
      ),
      1000,
    );
    assert.equal(
      Number(
        (
          await store.pool.query(
            "SELECT count(*) amount FROM points_casino_rounds WHERE user_id=$1",
            [userId],
          )
        ).rows[0].amount,
      ),
      0,
    );
  } finally {
    await store.pool.query(`DROP TRIGGER ${triggerName} ON points_outbox`);
    await store.pool.query(`DROP FUNCTION ${triggerName}()`);
  }
  const spins = await Promise.all(
    Array.from({ length: 6 }, () =>
      request("/api/v1/casino/play/roulette", player, spinRequest),
    ),
  );
  for (const spin of spins)
    assert.equal(spin.status, 200, JSON.stringify(spin));
  const spin = spins[0].body.result;
  assert.ok(spins.every((s) => s.body.result.roundId === spin.roundId));
  assert.equal(
    ProvablyFairRNG.verifyCommitment(
      spin.serverSeed,
      commitment.serverSeedHash,
    ),
    true,
  );
  assert.equal(
    (
      await request("/api/v1/casino/play/roulette", player, {
        ...spinRequest,
        bets: [{ type: "BLACK", value: "BLACK", amount: 5 }],
      })
    ).status,
    409,
  );
  await casino.close();
  casino = new CasinoHttpRouter();
  assert.equal(
    (await request("/api/v1/casino/play/roulette", player, spinRequest)).body
      .result.roundId,
    spin.roundId,
  );
  assert.equal(
    (await request("/api/v1/virtual-sports/races", player)).body.error,
    "PILOT_FEATURE_DISABLED",
  );
  // Unsupported virtuals also reject known-result wagering in the legacy service.
  const raceEngine = VirtualRacingEngine.getInstance(),
    race = raceEngine.getUpcomingRaces()[0];
  raceEngine.simulateRace(race.id, race.serverSeed!, "test-seed", 1);
  const legacyCasino = new DurableCasinoService();
  await assert.rejects(
    () =>
      legacyCasino.playVirtualRaceBet({
        userId,
        idempotencyKey: randomUUID(),
        raceId: race.id,
        runnerNumber: race.result!.winner.number,
        betType: "WIN",
        wager: 1,
        currencyCode: "PTS",
      }),
    /RACE_WAGERING_CLOSED/,
  );
  await legacyCasino.close();

  await store.relay();
  await store.relay();
  const reconciliation = await store.reconciliation();
  assert.equal(reconciliation.ok, true, JSON.stringify(reconciliation));
  assert.equal(reconciliation.pendingOutbox, 0);
  assert.ok(
    (await request("/api/v1/account/notifications", player)).body.notifications
      .length >= 3,
  );
  assert.equal(
    (
      await request("/api/v1/account/protection", player, {
        dailyWagerLimit: 10,
      })
    ).status,
    200,
  );
  const limitCommitment = (
    await request("/api/v1/casino/roulette/commitment", player, {
      idempotencyKey: randomUUID(),
    })
  ).body.commitment;
  assert.equal(
    (
      await request("/api/v1/casino/play/roulette", player, {
        ...spinRequest,
        idempotencyKey: randomUUID(),
        commitmentId: limitCommitment.commitmentId,
      })
    ).body.error,
    "DAILY_WAGER_LIMIT",
  );
  assert.equal(
    (
      await request("/api/v1/account/protection", player, {
        selfExcludeDays: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/api/v1/casino/play/roulette", player, {
        ...spinRequest,
        idempotencyKey: randomUUID(),
        commitmentId: limitCommitment.commitmentId,
      })
    ).body.error,
    "SELF_EXCLUDED",
  );
  const excludedLogin=await request('/api/v1/auth/login',undefined,{username:`player_${suffix}`,password});
  assert.equal(excludedLogin.status,200);
  assert.equal((await request('/api/v1/account/protection',excludedLogin.body.token)).status,200);
  assert.equal((await request('/api/v1/casino/play/roulette',excludedLogin.body.token,{...spinRequest,idempotencyKey:randomUUID(),commitmentId:limitCommitment.commitmentId})).body.error,'SELF_EXCLUDED');
  await request('/api/v1/auth/logout',excludedLogin.body.token,{});
  await request("/api/v1/auth/logout", player, {});
  assert.equal(
    (await request(`/api/v1/wallet/balance/${userId}`, player)).status,
    401,
  );

  // Lose the placement response after commit, then expire the visible quote.
  // The browser must replay its original request instead of obtaining a new key/quote.
  const retryUser = await request("/api/v1/auth/register", undefined, {
    username: `retry_${suffix}`,
    password,
  });
  await grant(retryUser.body.user.id, 50, admin);
  const retryFixture = `browser-retry-${suffix}`;
  await store.publishFixture({
    id: retryFixture,
    sportName: "Football",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "LIVE",
    score: { home: 0, away: 0 },
    matchMinute: 10,
    lastUpdatedAt: Date.now(),
    startTime: new Date(),
  });
  const retrySnapshot = (await store.fixtures()).find(
    (f) => f.id === retryFixture,
  );
  const browserState = new AppStateManager(),
    realFetch = globalThis.fetch;
  browserState.restrictedPilot = true;
  browserState.isAuthenticated = true;
  browserState.userId = retryUser.body.user.id;
  browserState.sessionToken = retryUser.body.token;
  browserState.userBalance = 50;
  browserState.stakeAmount = 5;
  browserState.toggleSelection({
    fixtureId: retryFixture,
    fixtureName: "Home vs Away",
    marketId: retrySnapshot.markets[0].id,
    marketName: "1X2",
    selectionId: retrySnapshot.markets[0].selections[0].id,
    selectionName: "Home",
    odds: retrySnapshot.markets[0].selections[0].odds,
  } as any);
  const placementBodies: string[] = [];
  try {
    globalThis.fetch = async (input: any, init?: any) => {
      const response = await realFetch(new URL(String(input), base), init);
      if (String(input) === "/api/v1/bets/place") {
        placementBodies.push(init.body);
        if (placementBodies.length === 1) {
          assert.equal(response.status, 201);
          throw new Error("Response lost after commit");
        }
      }
      return response;
    };
    await browserState.placeSlipBet();
    assert.ok(browserState.activeQuote);
    await browserState.placeSlipBet();
    browserState.activeQuote = null;
    await browserState.placeSlipBet();
    assert.equal(placementBodies.length, 2);
    assert.equal(placementBodies[0], placementBodies[1]);
    assert.equal(browserState.userBalance, 45);
    assert.equal(browserState.myTickets.length, 1);
    browserState.logout();
  } finally {
    globalThis.fetch = realFetch;
  }
  await store.settle(
    {
      fixtureId: retryFixture,
      status: "CANCELLED",
      homeScore: 0,
      awayScore: 0,
      source: "browser-retry-test",
      idempotencyKey: randomUUID(),
    },
    "SYSTEM",
  );

  const state = new AppStateManager(),
    originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };
    assert.equal(await state.login("offline", "password"), false);
    assert.equal(state.isAuthenticated, false);
    assert.equal(
      await state.requestServerQuote({
        fixtureId,
        marketId: market.id,
        selectionId: selection.id,
        odds: 2,
      } as any),
      null,
    );
    assert.equal(state.activeQuote, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    "Points pilot PostgreSQL HTTP gate passed: auth, concurrency, restart, freeze, settlement corrections, commitments, protection, outbox, and reconciliation.",
  );
} finally {
  if (server!)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await betting.close();
  await casino.close();
  await odds.close();
  await store.close();
}
