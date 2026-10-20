import "server-only";
import pg from "pg";

// One pool per server process (kept on globalThis so dev hot reloads do not leak connections).
// Works with any PostgreSQL 13+ server: put sslmode etc. in DATABASE_URL as your provider documents.

const { types } = pg;

// Return values in the same JSON-friendly shapes the UI uses everywhere.
const parseTimestamp = types.getTypeParser(types.builtins.TIMESTAMPTZ);
const PARSERS: Partial<Record<number, (value: string) => unknown>> = {
  [types.builtins.INT8]: Number, // money is bigint paise; sums stay far below 2^53
  [types.builtins.NUMERIC]: Number,
  [types.builtins.DATE]: (v) => v, // keep 'YYYY-MM-DD', never shift it through a JS Date
  [types.builtins.TIMESTAMPTZ]: (v) => (parseTimestamp(v) as Date).toISOString(),
};

const typeOverrides = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    return PARSERS[oid] ?? types.getTypeParser(oid, format);
  },
} as pg.CustomTypesConfig;

const globalForDb = globalThis as unknown as { __feesPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForDb.__feesPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
    globalForDb.__feesPool = new pg.Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      types: typeOverrides,
      application_name: "fees-management",
    });
  }
  return globalForDb.__feesPool;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** RPC argument: arrays and objects are jsonb (installment lists, import rows, payment targets). */
function param(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
  return value;
}

/** Named-argument call `public.fn(p_a => $1, …)`; undefined arguments fall back to the SQL default. */
function call(fn: string, args: Record<string, unknown>, values: unknown[]): string {
  if (!IDENT.test(fn)) throw new Error(`Invalid function name ${fn}`);
  const parts: string[] = [];
  for (const [name, value] of Object.entries(args)) {
    if (value === undefined) continue;
    if (!IDENT.test(name)) throw new Error(`Invalid argument name ${name}`);
    values.push(param(value));
    parts.push(`${name} => $${values.length}`);
  }
  return `public.${fn}(${parts.join(", ")})`;
}

/** Query helpers bound to one transaction. */
export class Db {
  constructor(private readonly client: pg.PoolClient) {}

  async query<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
    // pg sends JS arrays as Postgres arrays (for `= any($1)`) and other objects as JSON
    const res = await this.client.query(sql, values);
    return res.rows as T[];
  }

  async one<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T | null> {
    return (await this.query<T>(sql, values))[0] ?? null;
  }

  async count(sql: string, values: unknown[] = []): Promise<number> {
    const row = await this.one<{ count: number }>(`select count(*) as count from (${sql}) t`, values);
    return row?.count ?? 0;
  }

  /** Scalar or jsonb result of a SQL function (SECURITY DEFINER RPCs in db/migrations). */
  async rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const values: unknown[] = [];
    const row = await this.one<{ result: T }>(`select ${call(fn, args, values)} as result`, values);
    return row?.result as T;
  }

  /**
   * Rows of a set-returning SQL function. `tail` adds where / order by / limit; its `p(value)` binds a
   * parameter and returns its placeholder.
   */
  async rpcRows<T = Record<string, unknown>>(
    fn: string,
    args: Record<string, unknown> = {},
    tail?: (p: (value: unknown) => string) => string,
  ): Promise<T[]> {
    const values: unknown[] = [];
    const from = call(fn, args, values);
    const p = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };
    return this.query<T>(`select * from ${from} ${tail ? tail(p) : ""}`, values);
  }
}

/**
 * Run `fn` in a transaction as `userId`: the database sees it through public.current_user_id(), which
 * every role check, RLS policy and audit column uses. Rolls back on any error.
 */
export async function withUser<T>(userId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  let broken = false;
  try {
    await client.query("begin");
    if (userId) await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const out = await fn(new Db(client));
    await client.query("commit");
    return out;
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
      broken = true;
    }
    throw e;
  } finally {
    client.release(broken);
  }
}

/** A Postgres error (has a SQLSTATE code). */
export function isDbError(e: unknown): e is pg.DatabaseError {
  return e instanceof pg.DatabaseError;
}
