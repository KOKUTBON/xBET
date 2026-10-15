import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomUUID, randomBytes } from "node:crypto";

if (!process.env.XBET_PG_TEST_URL)
  throw new Error("XBET_PG_TEST_URL required for process restart gate");
process.env.DATABASE_URL = process.env.XBET_PG_TEST_URL;
process.env.XBET_PILOT_MODE = "true";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.RNG_SEED_KEY = randomBytes(32).toString("hex");
const { PilotStore } = await import(
  "../../services/betting-engine/src/pilot/pilot-store.ts"
);
const store = new PilotStore();
const workers = new Set<ChildProcess>();
async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const value = (server.address() as any).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return value;
}
const bettingPort = await port(),
  casinoPort = await port();
async function start(file: string, port: number) {
  const child = spawn(process.execPath, ["--experimental-strip-types", file], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  workers.add(child);
  let errors = "";
  child.stderr?.on("data", (data) => {
    errors += data;
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Worker exited: ${errors}`);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).ok)
        return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Worker did not start: ${errors}`);
}
async function stop(child: ChildProcess) {
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  workers.delete(child);
}
async function api(port: number, path: string, token?: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json()) as any;
  assert.ok(response.ok, JSON.stringify({ status: response.status, data }));
  return data;
}
try {
  const suffix = randomUUID().slice(0, 8),
    password = `Process-test-${randomUUID()}`;
  await store.register(`restart_${suffix}`, password);
  let betting = await start(
    "services/betting-engine/src/index.ts",
    bettingPort,
  );
  let casino = await start("services/casino-engine/src/index.ts", casinoPort);
  const { token, user } = await api(
    bettingPort,
    "/api/v1/auth/login",
    undefined,
    { username: `restart_${suffix}`, password },
  );
  const { DurableAcceptanceService } = await import(
    "../../services/betting-engine/src/betting/durable-acceptance.ts"
  );
  const acceptance = new DurableAcceptanceService();
  await acceptance.adjustPoints(user.id, 100, randomUUID());
  await acceptance.close();
  const fixtureId = `restart-${suffix}`;
  await store.publishFixture({
    id: fixtureId,
    sportName: "Football",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "LIVE",
    score: { home: 0, away: 0 },
    matchMinute: 20,
    lastUpdatedAt: Date.now(),
    startTime: new Date(),
  });
  const fixture = (await store.fixtures()).find((f) => f.id === fixtureId);
  const { quote } = await api(bettingPort, "/api/v1/bets/quote", token, {
    fixtureId,
    marketId: fixture.markets[0].id,
    selectionId: fixture.markets[0].selections[0].id,
  });
  const placement = {
    quoteId: quote.quoteId,
    stake: 5,
    idempotencyKey: randomUUID(),
  };
  const replicaPort = await port();
  const replica = await start(
    "services/betting-engine/src/index.ts",
    replicaPort,
  );
  const placements = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      api(
        i % 2 ? replicaPort : bettingPort,
        "/api/v1/bets/place",
        token,
        placement,
      ),
    ),
  );
  const ticket = placements[0].ticket;
  assert.ok(placements.every((p) => p.ticket.id === ticket.id));
  await stop(replica);
  const { commitment } = await api(
    casinoPort,
    "/api/v1/casino/roulette/commitment",
    token,
    { idempotencyKey: randomUUID() },
  );
  // Crash after issuing a commitment; the seed and player session must survive.
  await stop(betting);
  await stop(casino);
  betting = await start("services/betting-engine/src/index.ts", bettingPort);
  casino = await start("services/casino-engine/src/index.ts", casinoPort);
  assert.equal(
    (await api(bettingPort, `/api/v1/bets/tickets/${ticket.id}`, token)).ticket
      .id,
    ticket.id,
  );
  assert.equal(
    (await api(bettingPort, "/api/v1/bets/place", token, placement)).ticket.id,
    ticket.id,
  );
  const spinRequest = {
    commitmentId: commitment.commitmentId,
    idempotencyKey: randomUUID(),
    clientSeed: "restart-client",
    bets: [{ type: "RED", value: "RED", amount: 1 }],
  };
  const casinoReplicaPort = await port();
  const casinoReplica = await start(
    "services/casino-engine/src/index.ts",
    casinoReplicaPort,
  );
  const spins = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      api(
        i % 2 ? casinoReplicaPort : casinoPort,
        "/api/v1/casino/play/roulette",
        token,
        spinRequest,
      ),
    ),
  );
  const spin = spins[0].result;
  assert.ok(spins.every((s) => s.result.roundId === spin.roundId));
  await stop(casinoReplica);
  await stop(casino);
  casino = await start("services/casino-engine/src/index.ts", casinoPort);
  assert.deepEqual(
    (await api(casinoPort, "/api/v1/casino/play/roulette", token, spinRequest))
      .result,
    spin,
  );
  await store.settle(
    {
      fixtureId,
      status: "CANCELLED",
      homeScore: 0,
      awayScore: 0,
      source: "restart-test",
      idempotencyKey: randomUUID(),
    },
    "SYSTEM",
  );
  await stop(betting);
  betting = await start("services/betting-engine/src/index.ts", bettingPort);
  assert.equal(
    (await api(bettingPort, `/api/v1/bets/tickets/${ticket.id}`, token)).ticket
      .status,
    "VOID",
  );
  await store.relay();
  assert.equal((await store.reconciliation()).ok, true);
  console.log(
    "Points pilot process crash/restart gate passed: sessions, tickets, unconsumed commitments, settled rounds, idempotency and void settlement.",
  );
} finally {
  for (const child of workers) await stop(child);
  await store.close();
}
