export type SqlRow = Readonly<Record<string, unknown>>;

export type SqlQueryResult<Row extends SqlRow = SqlRow> = Readonly<{
  rows: readonly Row[];
  rowCount: number;
}>;

export interface SqlExecutor {
  query<Row extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<SqlQueryResult<Row>>;
}

export interface ReleasableSqlExecutor extends SqlExecutor {
  release(): void;
}

export interface SqlPool extends SqlExecutor {
  connect(): Promise<ReleasableSqlExecutor>;
}

export type DatabaseScope = Readonly<{
  actorUserId?: string;
  vendorId?: string;
  marketId?: string;
  requestId?: string;
  platformAccess?: boolean;
}>;

export type TransactionOptions = Readonly<{
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
  isolation?: "read committed" | "repeatable read" | "serializable";
  readOnly?: boolean;
}>;

export class PostgresUnitOfWork {
  readonly #pool: SqlPool;
  readonly #defaults: Required<Pick<TransactionOptions, "statementTimeoutMs" | "lockTimeoutMs" | "isolation">>;

  constructor(pool: SqlPool, defaults: TransactionOptions = {}) {
    this.#pool = pool;
    this.#defaults = {
      statementTimeoutMs: defaults.statementTimeoutMs ?? 10_000,
      lockTimeoutMs: defaults.lockTimeoutMs ?? 3_000,
      isolation: defaults.isolation ?? "read committed"
    };
  }

  async withTransaction<T>(scope: DatabaseScope, work: (tx: SqlExecutor) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
    const client = await this.#pool.connect();
    const isolation = options.isolation ?? this.#defaults.isolation;
    const statementTimeoutMs = options.statementTimeoutMs ?? this.#defaults.statementTimeoutMs;
    const lockTimeoutMs = options.lockTimeoutMs ?? this.#defaults.lockTimeoutMs;
    const readOnly = options.readOnly ? " READ ONLY" : "";

    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation.toUpperCase()}${readOnly}`);
      await client.query("SELECT set_config('statement_timeout', $1, true)", [`${statementTimeoutMs}ms`]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [`${lockTimeoutMs}ms`]);
      await this.#applyScope(client, scope);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original error. A broken connection is surfaced by the pool/observability layer.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async #applyScope(client: SqlExecutor, scope: DatabaseScope): Promise<void> {
    const settings: Array<[string, string | undefined]> = [
      ["app.actor_user_id", scope.actorUserId],
      ["app.vendor_id", scope.vendorId],
      ["app.market_id", scope.marketId],
      ["app.request_id", scope.requestId],
      ["app.platform_access", scope.platformAccess ? "true" : "false"]
    ];
    for (const [key, value] of settings) {
      if (!value) {
        await client.query("SELECT set_config($1, $2, true)", [key, ""]);
        continue;
      }
      if (key === "app.vendor_id") {
        // Domain APIs use stable public vendor IDs while database RLS policies use internal UUIDs.
        // Resolve before protected statements execute, so no vendor row can be observed under an
        // unresolved/incorrect tenant context.
        await client.query(`SELECT set_config($1, CASE
          WHEN $2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN $2
          ELSE COALESCE((SELECT id::text FROM vendor_businesses WHERE public_id = $2), '')
        END, true)`, [key, value]);
      } else if (key === "app.actor_user_id") {
        await client.query(`SELECT set_config($1, CASE
          WHEN $2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN $2
          ELSE COALESCE((SELECT id::text FROM users WHERE public_id = $2), '')
        END, true)`, [key, value]);
      } else if (key === "app.market_id") {
        await client.query(`SELECT set_config($1, CASE
          WHEN $2 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN $2
          ELSE COALESCE((SELECT id::text FROM markets WHERE code = $2), '')
        END, true)`, [key, value]);
      } else {
        await client.query("SELECT set_config($1, $2, true)", [key, value]);
      }
    }
  }
}

export function requireSingleRow<Row extends SqlRow>(result: SqlQueryResult<Row>, message = "Expected one database row"): Row {
  if (result.rowCount !== 1 || result.rows.length !== 1) throw new Error(message);
  return result.rows[0];
}
