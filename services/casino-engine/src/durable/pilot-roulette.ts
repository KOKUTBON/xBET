import {
  randomUUID,
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  PilotStore,
  transaction,
  reserveWager,
  pointsMinor,
  postJournal,
  reject,
} from "../../../betting-engine/src/pilot/pilot-store.ts";
import { ProvablyFairRNG } from "../rng/provably-fair.ts";
import { EuropeanRouletteEngine, type RouletteBet } from "../games/roulette.ts";

export class PilotRouletteService {
  readonly store: PilotStore;
  constructor(store = new PilotStore()) {
    this.store = store;
  }
  private key() {
    const value = process.env.RNG_SEED_KEY || "";
    if (!/^[a-f0-9]{64}$/i.test(value)) reject("RNG_SEED_KEY_REQUIRED", 503);
    return Buffer.from(value, "hex");
  }
  private encrypt(seed: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const data = Buffer.concat([cipher.update(seed, "utf8"), cipher.final()]);
    return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
  }
  private decrypt(value: string) {
    const [iv, tag, data] = value.split(":");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      this.key(),
      Buffer.from(iv, "hex"),
    );
    cipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([
      cipher.update(Buffer.from(data, "hex")),
      cipher.final(),
    ]).toString("utf8");
  }
  async prepare(userId: string, idempotencyKey: string) {
    if (
      !idempotencyKey ||
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 128
    )
      reject("IDEMPOTENCY_KEY_REQUIRED", 400);
    return transaction(this.store.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
        `commitment:${userId}:${idempotencyKey}`,
      ]);
      let row = (
        await client.query(
          "SELECT * FROM points_roulette_commitments WHERE user_id=$1 AND idempotency_key=$2",
          [userId, idempotencyKey],
        )
      ).rows[0];
      if (!row) {
        const seed = ProvablyFairRNG.generateServerSeed();
        row = (
          await client.query(
            `INSERT INTO points_roulette_commitments(id,user_id,idempotency_key,seed_ciphertext,seed_hash,expires_at)
          VALUES($1,$2,$3,$4,$5,now()+interval '5 minutes') RETURNING *`,
            [
              randomUUID(),
              userId,
              idempotencyKey,
              this.encrypt(seed),
              ProvablyFairRNG.hashServerSeed(seed),
            ],
          )
        ).rows[0];
      }
      return {
        commitmentId: row.id,
        serverSeedHash: row.seed_hash,
        expiresAt: row.expires_at,
        nonce: 1,
        rulesVersion: "roulette-european-v1",
        rngVersion: "hmac-sha256-rejection-v1",
      };
    });
  }
  async play(params: {
    userId: string;
    idempotencyKey: string;
    commitmentId: string;
    clientSeed: string;
    bets: RouletteBet[];
  }) {
    if (
      !params.idempotencyKey ||
      params.idempotencyKey.length < 8 ||
      params.idempotencyKey.length > 128
    )
      reject("IDEMPOTENCY_KEY_REQUIRED", 400);
    if (
      !/^[0-9a-f-]{36}$/i.test(params.commitmentId || "") ||
      !params.clientSeed ||
      params.clientSeed.length > 128
    )
      reject("COMMITMENT_REQUIRED", 400);
    if (
      !Array.isArray(params.bets) ||
      !params.bets.length ||
      params.bets.length > 100
    )
      reject("INVALID_BETS", 400);
    let wagerMinor = 0;
    for (const bet of params.bets) {
      wagerMinor += pointsMinor(bet.amount);
      if (bet.type === "STRAIGHT") {
        if (
          !Number.isInteger(Number(bet.value)) ||
          Number(bet.value) < 0 ||
          Number(bet.value) > 36
        )
          reject("INVALID_BET", 400);
      } else if (bet.type === "DOZEN") {
        if (!["DOZEN_1", "DOZEN_2", "DOZEN_3"].includes(String(bet.value)))
          reject("INVALID_BET", 400);
      } else if (
        !["RED", "BLACK", "EVEN", "ODD", "LOW", "HIGH"].includes(bet.type)
      )
        reject("UNSUPPORTED_BET", 400);
    }
    if (wagerMinor < 10 || wagerMinor > 500000)
      reject("WAGER_LIMIT_EXCEEDED", 400);
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          commitmentId: params.commitmentId,
          clientSeed: params.clientSeed,
          bets: params.bets.map((b) => ({
            type: b.type,
            value: b.value,
            amount: b.amount,
          })),
        }),
      )
      .digest("hex");
    return transaction(this.store.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [
        `roulette:${params.userId}:${params.idempotencyKey}`,
      ]);
      const prior = (
        await client.query(
          "SELECT * FROM points_casino_rounds WHERE user_id=$1 AND idempotency_key=$2",
          [params.userId, params.idempotencyKey],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== requestHash)
          reject("IDEMPOTENCY_KEY_CONFLICT");
        return this.result(prior);
      }
      const commitment = (
        await client.query(
          "SELECT * FROM points_roulette_commitments WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [params.commitmentId, params.userId],
        )
      ).rows[0];
      if (
        !commitment ||
        commitment.used_at ||
        commitment.expires_at.getTime() <= Date.now()
      )
        reject("COMMITMENT_EXPIRED_OR_USED");
      const control = (
        await client.query(
          "SELECT frozen FROM points_pilot_control WHERE id=1 FOR SHARE",
        )
      ).rows[0];
      if (control.frozen) reject("PILOT_FROZEN");
      await reserveWager(client, params.userId, wagerMinor);
      const player = `PLAYER:${params.userId}:PTS`;
      const balance = (
        await client.query(
          "SELECT balance_minor FROM points_accounts WHERE account_key=$1 FOR UPDATE",
          [player],
        )
      ).rows[0];
      if (Number(balance?.balance_minor || 0) < wagerMinor)
        reject("INSUFFICIENT_FUNDS");
      const roundId = randomUUID(),
        seed = this.decrypt(commitment.seed_ciphertext);
      const spin = EuropeanRouletteEngine.spin({
        userId: params.userId,
        bets: params.bets,
        serverSeed: seed,
        clientSeed: params.clientSeed,
        nonce: 1,
        roundId,
      });
      const payoutMinor = Math.round(spin.payout * 100),
        profitMinor = payoutMinor - wagerMinor,
        balanceAfter = Number(balance.balance_minor) + profitMinor;
      if (!Number.isSafeInteger(payoutMinor)) reject("INVALID_PAYOUT", 400);
      await postJournal(client, "CASINO_STAKE", `${roundId}:stake`, [
        [player, -wagerMinor],
        ["HOUSE_ESCROW:PTS", wagerMinor],
      ]);
      await postJournal(client, "CASINO_SETTLEMENT", `${roundId}:settlement`, [
        [player, payoutMinor],
        ["HOUSE_ESCROW:PTS", -wagerMinor],
        ["HOUSE_MARGIN:PTS", wagerMinor - payoutMinor],
      ]);
      const row = (
        await client.query(
          `INSERT INTO points_casino_rounds(id,user_id,idempotency_key,game_code,server_seed_hash,server_seed,client_seed,nonce,wager_minor,payout_minor,balance_after_minor,game_state,request_hash)
        VALUES($1,$2,$3,'roulette_european',$4,$5,$6,1,$7,$8,$9,$10,$11) RETURNING *`,
          [
            roundId,
            params.userId,
            params.idempotencyKey,
            commitment.seed_hash,
            seed,
            params.clientSeed,
            wagerMinor,
            payoutMinor,
            balanceAfter,
            {
              ...spin.gameState,
              commitmentId: params.commitmentId,
              rulesVersion: "roulette-european-v1",
              rngVersion: "hmac-sha256-rejection-v1",
            },
            requestHash,
          ],
        )
      ).rows[0];
      await client.query(
        "UPDATE points_roulette_commitments SET used_at=now() WHERE id=$1",
        [params.commitmentId],
      );
      await client.query(
        `INSERT INTO points_outbox(id,event_type,aggregate_id,payload) VALUES($1,'CASINO_ROUND_SETTLED',$2,$3)`,
        [
          randomUUID(),
          roundId,
          { userId: params.userId, roundId, wagerMinor, payoutMinor },
        ],
      );
      return this.result(row);
    });
  }
  private result(row: any) {
    return {
      roundId: row.id,
      userId: row.user_id,
      gameCode: row.game_code,
      wager: Number(row.wager_minor) / 100,
      payout: Number(row.payout_minor) / 100,
      profit: (Number(row.payout_minor) - Number(row.wager_minor)) / 100,
      balanceAfter: Number(row.balance_after_minor) / 100,
      isCompleted: true,
      gameState: row.game_state,
      serverSeedHash: row.server_seed_hash,
      serverSeed: row.server_seed,
      clientSeed: row.client_seed,
      nonce: Number(row.nonce),
    };
  }
}
