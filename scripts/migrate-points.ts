import pg from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(72536501)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS points_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const directory = fileURLToPath(
    new URL("../db/migrations/", import.meta.url),
  );
  for (const name of readdirSync(directory)
    .filter((name) => /^00[1-5]_.*\.sql$/.test(name))
    .sort()) {
    const sql = readFileSync(`${directory}/${name}`, "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = (
      await client.query(
        "SELECT checksum FROM points_schema_migrations WHERE name=$1",
        [name],
      )
    ).rows[0];
    if (prior) {
      if (prior.checksum !== checksum)
        throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO points_schema_migrations(name,checksum) VALUES($1,$2)",
        [name, checksum],
      );
      await client.query("COMMIT");
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(72536501)").catch(() => {});
  client.release();
  await pool.end();
}
