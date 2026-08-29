import { Pool } from "pg";

/**
 * Direct database access for assertions and for seeding prerequisites (#1431, #1432).
 *
 * Only the flow under test is driven through the browser; everything a spec merely
 * *needs to exist* is created here. Reads are used for the assertions that cannot be
 * made from the UI: that a confirmed chain transaction produced a platform record,
 * that a payment was not double-charged, and that an admin decision reached the
 * audit trail.
 */

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

let pool: Pool | null = null;

function getPool(): Pool {
  if (!DB_URL) {
    throw new Error(
      "TEST_DATABASE_URL / DATABASE_URL must be set for the e2e suite (see e2e/helpers/seed.ts)",
    );
  }
  if (!pool) pool = new Pool({ connectionString: DB_URL });
  return pool;
}

export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await getPool().query(sql, params);
  return rows as T[];
}

export async function dbClose(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** True when `table` exists in the connected database. */
export async function tableExists(table: string): Promise<boolean> {
  const rows = await dbQuery<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table],
  );
  return rows[0]?.exists === true;
}

/**
 * Poll a query until it satisfies `predicate`, or fail.
 *
 * Used in place of a fixed sleep: every wait in these specs is a wait on a
 * condition, which is why they do not flake.
 */
export async function waitForDb<T>(
  sql: string,
  params: unknown[],
  predicate: (rows: T[]) => boolean,
  { timeoutMs = 15_000, intervalMs = 250, what = "database condition" } = {},
): Promise<T[]> {
  const deadline = Date.now() + timeoutMs;
  let last: T[] = [];
  while (Date.now() < deadline) {
    last = await dbQuery<T>(sql, params);
    if (predicate(last)) return last;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${what}. Last result: ${JSON.stringify(last)}`,
  );
}
