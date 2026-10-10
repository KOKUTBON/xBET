import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import type { PoolClient } from "pg";
import {
  AuthTokenManager,
  UserRole,
  assertPilotJwtSecret,
  type SessionPayload,
} from "../../../../packages/core-types/src/auth.ts";
import { AcceptanceError } from "../betting/durable-acceptance.ts";
import { BivariatePoissonModel } from "../../../odds-engine/src/domain/bivariate-poisson-model.ts";

export const pilotEnabled = () => process.env.XBET_PILOT_MODE === "true";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const reject = (code: string, status = 409): never => {
  throw new AcceptanceError(code, status);
};

export function pointsMinor(value: number): number {
  const minor = Math.round(value * 100);
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isSafeInteger(minor) ||
    Math.abs(value * 100 - minor) > 1e-7
  )
    reject("INVALID_AMOUNT", 400);
  return minor;
}

export async function transaction<T>(
  pool: pg.Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error: any) {
      await client.query("ROLLBACK").catch(() => {});
      if (["40001", "40P01"].includes(error.code) && attempt < 4) continue;
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function postJournal(
  client: PoolClient,
  kind: string,
  reference: string,
  changes: Array<[string, number]>,
) {
  if (
    changes.reduce((sum, [, delta]) => sum + delta, 0) !== 0 ||
    changes.some(([, delta]) => !Number.isSafeInteger(delta))
  )
    reject("UNBALANCED_JOURNAL", 500);
  const id = randomUUID();
  for (const [key] of [...changes].sort(([a], [b]) => a.localeCompare(b))) {
    await client.query(
      "INSERT INTO points_accounts(account_key, user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [key, key.startsWith("PLAYER:") ? key.slice(7, -4) : null],
    );
    await client.query(
      "SELECT account_key FROM points_accounts WHERE account_key=$1 FOR UPDATE",
      [key],
    );
  }
  await client.query(
    "INSERT INTO points_journals(id,kind,reference_id) VALUES($1,$2,$3)",
    [id, kind, reference],
  );
  for (const [key, delta] of changes.filter(([, delta]) => delta !== 0)) {
    await client.query(
      "UPDATE points_accounts SET balance_minor=balance_minor+$2 WHERE account_key=$1",
      [key, delta],
    );
    await client.query(
      "INSERT INTO points_journal_lines(id,journal_id,account_key,delta_minor) VALUES($1,$2,$3,$4)",
      [randomUUID(), id, key, delta],
    );
  }
  return id;
}

export async function reserveWager(
  client: PoolClient,
  userId: string,
  minor: number,
) {
  const user = (
    await client.query("SELECT * FROM points_users WHERE id=$1 FOR UPDATE", [
      userId,
    ])
  ).rows[0];
  if (!user) reject("ACCOUNT_NOT_FOUND", 403);
  if (user.excluded_until && user.excluded_until.getTime() > Date.now())
    reject("SELF_EXCLUDED", 403);
  const count = await client.query(
    `INSERT INTO points_daily_wagers(user_id,day,wager_minor) VALUES($1,(now() AT TIME ZONE 'UTC')::date,$2)
    ON CONFLICT(user_id,day) DO UPDATE SET wager_minor=points_daily_wagers.wager_minor+EXCLUDED.wager_minor
    RETURNING wager_minor`,
    [userId, minor],
  );
  if (Number(count.rows[0].wager_minor) > Number(user.daily_wager_limit_minor))
    reject("DAILY_WAGER_LIMIT", 403);
}

export class PilotStore {
  readonly pool: pg.Pool;
  constructor(pool?: pg.Pool) {
    if (pilotEnabled()) assertPilotJwtSecret(process.env.JWT_SECRET);
    this.pool =
      pool ??
      new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        connectionTimeoutMillis: 2000,
      });
  }
  async close() {
    await this.pool.end();
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString("hex");
    return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  }
  async register(
    username: string,
    password: string,
    role: UserRole = UserRole.PLAYER,
  ) {
    const name = username.trim().toLowerCase();
    if (
      !/^[a-z0-9_-]{3,40}$/.test(name) ||
      password.length < 12 ||
      password.length > 256
    )
      reject("INVALID_CREDENTIALS_FORMAT", 400);
    const id = randomUUID();
    try {
      await this.pool.query(
        "INSERT INTO points_users(id,username,password_hash,role) VALUES($1,$2,$3,$4)",
        [id, name, this.hashPassword(password), role],
      );
    } catch (error: any) {
      if (error.code === "23505") reject("USERNAME_TAKEN", 409);
      throw error;
    }
    return { id, username: name, role, currencyCode: "PTS" };
  }
  async bootstrapAdmin() {
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
    if (!password) return;
    if (password.length < 16) reject("ADMIN_PASSWORD_TOO_SHORT", 500);
    const name = (
      process.env.ADMIN_BOOTSTRAP_USERNAME || "admin"
    ).toLowerCase();
    // Never promote or overwrite an existing public account.
    const existing = (
      await this.pool.query("SELECT role FROM points_users WHERE username=$1", [
        name,
      ])
    ).rows[0];
    if (existing) {
      if (existing.role !== UserRole.ADMINISTRATOR)
        reject("BOOTSTRAP_USERNAME_CONFLICT", 500);
      return;
    }
    try {
      await this.register(name, password, UserRole.ADMINISTRATOR);
    } catch (error: any) {
      if (error.code !== "USERNAME_TAKEN") throw error;
    }
  }
  async login(username: string, password: string) {
    if (password.length > 256) reject("INVALID_CREDENTIALS", 401);
    const user = (
      await this.pool.query("SELECT * FROM points_users WHERE username=$1", [
        username.trim().toLowerCase(),
      ])
    ).rows[0];
    const [salt, stored] = (
      user?.password_hash ||
      `00000000000000000000000000000000:${"00".repeat(64)}`
    ).split(":");
    const derived = scryptSync(password, salt, 64);
    if (!timingSafeEqual(derived, Buffer.from(stored, "hex")) || !user)
      reject("INVALID_CREDENTIALS", 401);
    const token = AuthTokenManager.createSession(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        currencyCode: "PTS",
      },
      2,
    );
    const session = AuthTokenManager.verifySession(token)!;
    await this.pool.query(
      "INSERT INTO points_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [tokenHash(token), user.id, new Date(session.expiresAt)],
    );
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        currencyCode: "PTS",
      },
    };
  }
  async validateSession(token: string, session: SessionPayload) {
    const row = (
      await this.pool.query(
        `SELECT u.role,u.excluded_until FROM points_sessions s JOIN points_users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()`,
        [tokenHash(token), session.userId],
      )
    ).rows[0];
    if (!row || row.role !== session.role || session.currencyCode !== "PTS")
      reject("UNAUTHORIZED", 401);
    // Excluded players can still inspect their history and revoke their session.
  }
  async logout(token: string) {
    await this.pool.query(
      "UPDATE points_sessions SET revoked_at=now() WHERE token_hash=$1",
      [tokenHash(token)],
    );
  }
  async protection(userId: string, body?: any) {
    if (body) {
      const limit =
        body.dailyWagerLimit === undefined
          ? null
          : pointsMinor(Number(body.dailyWagerLimit));
      if (limit !== null && limit > 100000)
        reject("LIMIT_INCREASE_UNAVAILABLE", 400);
      const days =
        body.selfExcludeDays === undefined
          ? null
          : Number(body.selfExcludeDays);
      if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650))
        reject("INVALID_EXCLUSION", 400);
      await this.pool.query(
        `UPDATE points_users SET daily_wager_limit_minor=LEAST(daily_wager_limit_minor,COALESCE($2,daily_wager_limit_minor)),
        excluded_until=CASE WHEN $3::integer IS NULL THEN excluded_until ELSE GREATEST(COALESCE(excluded_until,now()),now()+$3*interval '1 day') END WHERE id=$1`,
        [userId, limit, days],
      );
    }
    const row = (
      await this.pool.query(
        "SELECT daily_wager_limit_minor,excluded_until FROM points_users WHERE id=$1",
        [userId],
      )
    ).rows[0];
    return {
      dailyWagerLimit: Number(row.daily_wager_limit_minor) / 100,
      excludedUntil: row.excluded_until,
    };
  }

  async publishFixture(fixture: any) {
    if (!/^(football|soccer)$/i.test(fixture.sportName || "")) return;
    const model = BivariatePoissonModel.evaluate({
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      currentScore: fixture.score,
      minute: fixture.matchMinute || 0,
      redCards: { home: 0, away: 0 },
      stateSequence: fixture.lastUpdatedAt,
    });
    const markets = [
      model.markets.matchWinner,
      model.markets.totalGoals25,
      model.markets.totalGoals15,
      model.markets.totalGoals35,
    ];
    const snapshot = {
      ...fixture,
      dataMode: "SIMULATED",
      modelVersion: model.modelVersion,
      markets: markets.map((m) => ({
        ...m,
        marketType: m === markets[0] ? "1X2" : "OVER_UNDER",
        status:
          (fixture.status === "LIVE" || fixture.status === "NOT_STARTED") &&
          !(
            m !== markets[0] &&
            fixture.score.home + fixture.score.away > Number(m.line)
          )
            ? "ACTIVE"
            : "SUSPENDED",
        selections: m.selections.map((s: any) => ({
          ...s,
          odds: Number.isFinite(s.odds) ? s.odds : null,
          status:
            Number.isFinite(s.odds) && s.odds >= 1.01 && s.odds <= 1000
              ? "ACTIVE"
              : "SUSPENDED",
        })),
      })),
    };
    return transaction(this.pool, async (client) => {
      const old = (
        await client.query(
          "SELECT * FROM points_fixture_states WHERE fixture_id=$1 FOR UPDATE",
          [fixture.id],
        )
      ).rows[0];
      if (
        old &&
        Number(old.snapshot.lastUpdatedAt) >= Number(snapshot.lastUpdatedAt)
      )
        return;
      // Resulted fixtures never reopen through the simulator/publisher.
      const resulted = (
        await client.query(
          "SELECT 1 FROM points_fixture_results WHERE fixture_id=$1 LIMIT 1",
          [fixture.id],
        )
      ).rowCount;
      if (resulted) return;
      await client.query(
        `INSERT INTO points_fixture_states(fixture_id,version,snapshot,updated_at) VALUES($1,1,$2,$3)
        ON CONFLICT(fixture_id) DO UPDATE SET version=points_fixture_states.version+1,snapshot=EXCLUDED.snapshot,updated_at=EXCLUDED.updated_at`,
        [fixture.id, snapshot, new Date(fixture.lastUpdatedAt)],
      );
    });
  }
  async fixtures() {
    const control = (
      await this.pool.query(
        "SELECT frozen FROM points_pilot_control WHERE id=1",
      )
    ).rows[0];
    return (
      await this.pool.query(
        "SELECT snapshot,version,frozen FROM points_fixture_states ORDER BY fixture_id",
      )
    ).rows
      .filter((r) => /^(football|soccer)$/i.test(r.snapshot.sportName || ""))
      .map((r) => ({
        ...r.snapshot,
        marketVersion: Number(r.version),
        frozen: r.frozen || control.frozen,
        markets: r.snapshot.markets.map((market: any) => ({
          ...market,
          status: r.frozen || control.frozen ? "SUSPENDED" : market.status,
        })),
      }));
  }
  async resolve(fixtureId: string, marketId: string, selectionId: string) {
    const rows = await this.pool.query(
      "SELECT * FROM points_fixture_states WHERE fixture_id=$1",
      [fixtureId],
    );
    const row = rows.rows[0];
    if (!row) reject("FIXTURE_UNAVAILABLE");
    const fixture = row.snapshot;
    if (!/^(football|soccer)$/i.test(fixture.sportName || ""))
      reject("SPORT_DISABLED");
    const market = fixture.markets.find((m: any) => m.id === marketId);
    const selection = market?.selections.find((s: any) => s.id === selectionId);
    if (!selection) reject("SELECTION_UNAVAILABLE");
    const control = (
      await this.pool.query(
        "SELECT frozen FROM points_pilot_control WHERE id=1",
      )
    ).rows[0];
    return {
      fixtureId,
      fixtureName: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      fixtureStatus: fixture.status,
      score: fixture.score,
      lastUpdatedAt: new Date(row.updated_at).getTime(),
      marketId,
      marketName: market.name,
      marketType: market.marketType,
      marketLine:
        market.line ||
        (market.id.includes("1.5")
          ? "1.5"
          : market.id.includes("3.5")
            ? "3.5"
            : market.marketType === "OVER_UNDER"
              ? "2.5"
              : null),
      marketStatus: row.frozen || control.frozen ? "SUSPENDED" : market.status,
      selectionId,
      selectionName: selection.name,
      selectionStatus: selection.status,
      odds: selection.odds,
      fixtureVersion: Number(row.version),
      modelVersion: fixture.modelVersion,
      dataMode: fixture.dataMode,
    };
  }
  async freeze(
    actorId: string,
    fixtureId: string | null,
    frozen: boolean,
    reason: string,
  ) {
    if (!reason.trim() || typeof frozen !== "boolean")
      reject("REASON_REQUIRED", 400);
    return transaction(this.pool, async (client) => {
      if (fixtureId) {
        const updated = await client.query(
          "UPDATE points_fixture_states SET frozen=$2,version=version+1 WHERE fixture_id=$1",
          [fixtureId, frozen],
        );
        if (!updated.rowCount) reject("FIXTURE_NOT_FOUND", 404);
      } else
        await client.query(
          "UPDATE points_pilot_control SET frozen=$1 WHERE id=1",
          [frozen],
        );
      await client.query(
        `INSERT INTO points_trader_audit_log(id,action_type,actor_id,entity_type,entity_id,payload) VALUES($1,'FREEZE',$2,'FIXTURE',$3,$4)`,
        [randomUUID(), actorId, fixtureId || "GLOBAL", { frozen, reason }],
      );
      return { frozen, fixtureId, reason };
    });
  }

  /**
   * Records an authoritative result revision and settles the fixture's bets.
   * Automated sources pass `onlyIfUnresulted` so they can create the first
   * revision but never override a staff result or correction.
   */
  async settle(
    input: any,
    actorId: string,
    options: { onlyIfUnresulted?: boolean } = {},
  ) {
    const { fixtureId, idempotencyKey } = input;
    const request = {
      fixtureId,
      homeScore: Number(input.homeScore),
      awayScore: Number(input.awayScore),
      status: input.status || "FINISHED",
      source: String(input.source || ""),
      rulesVersion: "football-90m-v1",
    };
    if (
      !fixtureId ||
      !idempotencyKey ||
      idempotencyKey.length < 8 ||
      !request.source ||
      !["FINISHED", "ABANDONED", "CANCELLED"].includes(request.status) ||
      ![request.homeScore, request.awayScore].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 100,
      )
    )
      reject("INVALID_RESULT", 400);
    return transaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
        `result:${idempotencyKey}`,
      ]);
      const prior = (
        await client.query(
          "SELECT * FROM points_result_requests WHERE idempotency_key=$1",
          [idempotencyKey],
        )
      ).rows[0];
      if (prior) {
        if (!isDeepStrictEqual(prior.request, request))
          reject("IDEMPOTENCY_KEY_CONFLICT");
        return prior.response;
      }
      const fixture = (
        await client.query(
          "SELECT * FROM points_fixture_states WHERE fixture_id=$1 FOR UPDATE",
          [fixtureId],
        )
      ).rows[0];
      if (!fixture) reject("FIXTURE_NOT_FOUND", 404);
      const latest = (
        await client.query(
          "SELECT revision FROM points_fixture_results WHERE fixture_id=$1 ORDER BY revision DESC LIMIT 1",
          [fixtureId],
        )
      ).rows[0];
      if (options.onlyIfUnresulted && latest)
        return {
          fixtureId,
          revision: Number(latest.revision),
          settledTickets: [],
          skipped: "ALREADY_RESULTED",
        };
      const revision = Number(latest?.revision || 0) + 1;
      await client.query(
        `INSERT INTO points_fixture_results(fixture_id,revision,home_score,away_score,status,actor_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          fixtureId,
          revision,
          request.homeScore,
          request.awayScore,
          request.status,
          actorId,
          JSON.stringify({
            source: request.source,
            rulesVersion: request.rulesVersion,
          }),
        ],
      );
      await client.query(
        `UPDATE points_fixture_states SET frozen=true,version=version+1,snapshot=snapshot || $2::jsonb WHERE fixture_id=$1`,
        [
          fixtureId,
          JSON.stringify({
            status: request.status,
            score: { home: request.homeScore, away: request.awayScore },
            isInPlay: false,
          }),
        ],
      );
      const bets = (
        await client.query(
          `SELECT * FROM points_bets WHERE selection->>'fixtureId'=$1 ORDER BY id FOR UPDATE`,
          [fixtureId],
        )
      ).rows;
      const settled = [];
      for (const bet of bets) {
        if (bet.status === "CASHED_OUT") continue;
        const s = bet.selection;
        let status = "VOID";
        if (request.status === "FINISHED") {
          const name = s.selectionName.toLowerCase();
          if (s.marketType === "1X2") {
            const outcome =
              request.homeScore > request.awayScore
                ? "home"
                : request.homeScore === request.awayScore
                  ? "draw"
                  : "away";
            const choice =
              name === "home" || name === "1"
                ? "home"
                : name === "draw" || name === "x"
                  ? "draw"
                  : name === "away" || name === "2"
                    ? "away"
                    : null;
            if (!choice) reject("UNSUPPORTED_SELECTION", 400);
            status = choice === outcome ? "WON" : "LOST";
          } else if (s.marketType === "OVER_UNDER") {
            const line = Number(s.marketLine),
              total = request.homeScore + request.awayScore;
            if (
              !Number.isFinite(line) ||
              line % 0.5 !== 0 ||
              (!name.startsWith("over") && !name.startsWith("under"))
            )
              reject("UNSUPPORTED_SELECTION", 400);
            status =
              total === line
                ? "VOID"
                : (name.startsWith("over") ? total > line : total < line)
                  ? "WON"
                  : "LOST";
          } else reject("UNSUPPORTED_MARKET", 400);
        }
        const stake = Number(bet.stake_minor),
          payout =
            status === "WON"
              ? Number(bet.potential_payout_minor)
              : status === "VOID"
                ? stake
                : 0;
        const player = `PLAYER:${bet.user_id}:PTS`,
          escrow = "HOUSE_ESCROW:PTS",
          house = "HOUSE_MARGIN:PTS";
        const previous = (
          await client.query(
            "SELECT * FROM points_settlement_revisions WHERE ticket_id=$1 ORDER BY revision DESC LIMIT 1",
            [bet.id],
          )
        ).rows[0];
        if (previous) {
          const old = Number(previous.payout_minor);
          const balance = (
            await client.query(
              "SELECT balance_minor FROM points_accounts WHERE account_key=$1 FOR UPDATE",
              [player],
            )
          ).rows[0];
          if (Number(balance.balance_minor) < Math.max(0, old - payout))
            reject("CORRECTION_REQUIRES_FUNDS");
          // Reverse and re-settle as separately balanced journals, in one transaction.
          // If old payout has been spent but the new payout covers it, net adjustment is posted below.
          if (Number(balance.balance_minor) >= old) {
            await postJournal(
              client,
              "SETTLEMENT_REVERSAL",
              `${bet.id}:reversal:${revision}`,
              [
                [player, -old],
                [escrow, stake],
                [house, old - stake],
              ],
            );
            const journal = await postJournal(
              client,
              "BET_SETTLEMENT",
              `${bet.id}:settlement:${revision}`,
              [
                [player, payout],
                [escrow, -stake],
                [house, stake - payout],
              ],
            );
            await client.query(
              "INSERT INTO points_settlement_revisions(id,ticket_id,revision,status,payout_minor,journal_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
              [
                randomUUID(),
                bet.id,
                revision,
                status,
                payout,
                journal,
                request.source,
              ],
            );
          } else {
            const journal = await postJournal(
              client,
              "SETTLEMENT_CORRECTION",
              `${bet.id}:correction:${revision}`,
              [
                [player, payout - old],
                [house, old - payout],
              ],
            );
            await client.query(
              "INSERT INTO points_settlement_revisions(id,ticket_id,revision,status,payout_minor,journal_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
              [
                randomUUID(),
                bet.id,
                revision,
                status,
                payout,
                journal,
                request.source,
              ],
            );
          }
        } else {
          const journal = await postJournal(
            client,
            "BET_SETTLEMENT",
            `${bet.id}:settlement:${revision}`,
            [
              [player, payout],
              [escrow, -stake],
              [house, stake - payout],
            ],
          );
          await client.query(
            "INSERT INTO points_settlement_revisions(id,ticket_id,revision,status,payout_minor,journal_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              randomUUID(),
              bet.id,
              revision,
              status,
              payout,
              journal,
              request.source,
            ],
          );
          await client.query(
            "UPDATE points_liabilities SET liability_minor=liability_minor-$2 WHERE selection_id=$1",
            [s.selectionId, Number(bet.potential_payout_minor) - stake],
          );
        }
        await client.query(
          "UPDATE points_bets SET status=$2,settled_payout_minor=$3,settled_at=now() WHERE id=$1",
          [bet.id, status, payout],
        );
        await client.query(
          `INSERT INTO points_outbox(id,event_type,aggregate_id,payload) VALUES($1,'BET_SETTLED',$2,$3)`,
          [
            randomUUID(),
            bet.id,
            {
              userId: bet.user_id,
              ticketId: bet.id,
              revision,
              status,
              payoutMinor: payout,
            },
          ],
        );
        settled.push({ ticketId: bet.id, status, payout: payout / 100 });
      }
      const response = { fixtureId, revision, settledTickets: settled };
      await client.query(
        "INSERT INTO points_result_requests(idempotency_key,request,response) VALUES($1,$2,$3)",
        [idempotencyKey, request, response],
      );
      return response;
    });
  }
  async relay() {
    return transaction(this.pool, async (client) => {
      const events = (
        await client.query(
          "SELECT * FROM points_outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED",
        )
      ).rows;
      for (const event of events) {
        if (event.payload.userId)
          await client.query(
            "INSERT INTO points_notifications(id,user_id,event_type,payload) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [event.id, event.payload.userId, event.event_type, event.payload],
          );
        await client.query(
          "UPDATE points_outbox SET published_at=now() WHERE id=$1",
          [event.id],
        );
      }
      return events.length;
    });
  }
  async reconciliation() {
    const bad = (
      await this.pool.query(
        "SELECT journal_id FROM points_journal_lines GROUP BY journal_id HAVING sum(delta_minor)<>0",
      )
    ).rows;
    const drift = (
      await this.pool
        .query(`SELECT a.account_key FROM points_accounts a LEFT JOIN points_journal_lines l ON l.account_key=a.account_key
      GROUP BY a.account_key,a.balance_minor HAVING a.balance_minor<>COALESCE(sum(l.delta_minor),0)`)
    ).rows;
    const exposure = (
      await this.pool
        .query(`WITH expected AS (SELECT selection->>'selectionId' id,sum(potential_payout_minor-stake_minor) value FROM points_bets WHERE status='ACCEPTED' GROUP BY 1)
      SELECT l.selection_id FROM points_liabilities l FULL JOIN expected e ON e.id=l.selection_id WHERE COALESCE(l.liability_minor,0)<>COALESCE(e.value,0)`)
    ).rows;
    const pending = Number(
      (
        await this.pool.query(
          "SELECT count(*) FROM points_outbox WHERE published_at IS NULL",
        )
      ).rows[0].count,
    );
    return {
      ok: bad.length === 0 && drift.length === 0 && exposure.length === 0,
      unbalancedJournals: bad,
      balanceDrift: drift,
      exposureDrift: exposure,
      pendingOutbox: pending,
    };
  }
}
