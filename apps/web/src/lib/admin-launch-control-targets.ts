import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const LAUNCH_CONTROL_TARGETS_KEY = "launch_control.targets.v1";
export const LAUNCH_CONTROL_TARGET_SCHEMA_VERSION = 1 as const;

export type LaunchControlTargetKey =
  | "activeVendors"
  | "catalogueProducts"
  | "indexableProducts"
  | "orders30d"
  | "gmv30dMinor"
  | "searchSuccessRate";

export type LaunchControlTargetEntry = Readonly<{
  value: number;
  deadline: string;
  baselineValue: number;
  baselineAt: number;
}>;

export type LaunchControlTargetDocument = Readonly<{
  schemaVersion: typeof LAUNCH_CONTROL_TARGET_SCHEMA_VERSION;
  targets: Partial<Record<LaunchControlTargetKey, LaunchControlTargetEntry>>;
}>;

export type LaunchControlTargetSettings = Readonly<{
  document: LaunchControlTargetDocument;
  version: number;
  updatedAt?: number;
  updatedBy?: string;
}>;

export type LaunchControlTargetDraft = Readonly<{
  value: number;
  deadline: string;
}>;

export type LaunchControlTargetDrafts = Partial<Record<LaunchControlTargetKey, LaunchControlTargetDraft>>;
export type LaunchControlTargetCurrentValues = Readonly<Record<LaunchControlTargetKey, number | undefined>>;

const TARGET_KEYS: readonly LaunchControlTargetKey[] = [
  "activeVendors",
  "catalogueProducts",
  "indexableProducts",
  "orders30d",
  "gmv30dMinor",
  "searchSuccessRate"
];

function optionalEpoch(value: unknown): number | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asFinite(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid Launch Control target: ${field}`);
  return parsed;
}

function validDeadline(value: unknown, field: string): string {
  const deadline = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(new Date(`${deadline}T23:59:59.999Z`).getTime())) {
    throw new Error(`Invalid Launch Control deadline: ${field}`);
  }
  return deadline;
}

function validateMetricValue(key: LaunchControlTargetKey, value: unknown, allowZero: boolean): number {
  const parsed = asFinite(value, key);
  if (key === "searchSuccessRate") {
    if (parsed < 0 || parsed > 1 || (!allowZero && parsed === 0)) throw new Error("Search-success target must be greater than 0 and no more than 1");
    return parsed;
  }
  if (parsed < 0 || (!allowZero && parsed === 0)) throw new Error(`${key} target must be greater than zero`);
  if (key !== "gmv30dMinor" && !Number.isInteger(parsed)) throw new Error(`${key} target must be an integer`);
  if (key === "gmv30dMinor" && !Number.isSafeInteger(parsed)) throw new Error("GMV target must be a safe integer in minor units");
  return parsed;
}

function emptyDocument(): LaunchControlTargetDocument {
  return { schemaVersion: LAUNCH_CONTROL_TARGET_SCHEMA_VERSION, targets: {} };
}

function parseStoredDocument(value: unknown): LaunchControlTargetDocument {
  if (!value || typeof value !== "object") return emptyDocument();
  const input = value as { schemaVersion?: unknown; targets?: unknown };
  if (Number(input.schemaVersion) !== LAUNCH_CONTROL_TARGET_SCHEMA_VERSION || !input.targets || typeof input.targets !== "object") return emptyDocument();
  const targets: Partial<Record<LaunchControlTargetKey, LaunchControlTargetEntry>> = {};
  for (const key of TARGET_KEYS) {
    const raw = (input.targets as Record<string, unknown>)[key];
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    try {
      targets[key] = {
        value: validateMetricValue(key, item.value, false),
        deadline: validDeadline(item.deadline, key),
        baselineValue: validateMetricValue(key, item.baselineValue, true),
        baselineAt: asFinite(item.baselineAt, `${key}.baselineAt`)
      };
    } catch {
      // Corrupt individual targets are ignored rather than turning the whole cockpit into a false zero state.
    }
  }
  return { schemaVersion: LAUNCH_CONTROL_TARGET_SCHEMA_VERSION, targets };
}

function parseDrafts(input: unknown): LaunchControlTargetDrafts {
  if (!input || typeof input !== "object") throw new Error("Launch Control targets payload is required");
  const drafts: LaunchControlTargetDrafts = {};
  for (const key of TARGET_KEYS) {
    const raw = (input as Record<string, unknown>)[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "object") throw new Error(`Invalid target payload: ${key}`);
    const item = raw as Record<string, unknown>;
    drafts[key] = {
      value: validateMetricValue(key, item.value, false),
      deadline: validDeadline(item.deadline, key)
    };
  }
  return drafts;
}

function rowToSettings(row: SqlRow | undefined): LaunchControlTargetSettings {
  if (!row) return { document: emptyDocument(), version: 0 };
  return {
    document: parseStoredDocument(row.value),
    version: Number(row.version ?? 0),
    updatedAt: optionalEpoch(row.updated_at),
    updatedBy: row.updated_by ? String(row.updated_by) : undefined
  };
}

export async function readLaunchControlTargets(principal: SessionPrincipal): Promise<LaunchControlTargetSettings> {
  assertAdminPermission(principal, "analytics.market.read");
  if (!productionDatabaseConfigured()) return { document: emptyDocument(), version: 0 };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT ss.value,ss.version,ss.updated_at,ss.updated_by
      FROM system_settings ss
      JOIN markets m ON m.id=ss.market_id
      WHERE m.code='sparta' AND ss.key=$1
      LIMIT 1
    `, [LAUNCH_CONTROL_TARGETS_KEY]);
    return rowToSettings(result.rows[0]);
  }, { readOnly: true });
}

export async function writeLaunchControlTargets(
  principal: SessionPrincipal,
  payload: unknown,
  currentValues: LaunchControlTargetCurrentValues,
  expectedVersion: number,
  now = Date.now()
): Promise<LaunchControlTargetSettings> {
  assertAdminPermission(principal, "analytics.market.read");
  if (!principal.roles.includes("super_admin")) throw new Error("Only a super admin may change Launch Control targets");
  if (!productionDatabaseConfigured()) throw new Error("Launch Control targets require the production database");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid Launch Control target version");

  const drafts = parseDrafts(payload);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    // Lock the market row first so two sessions cannot both create version 1 when the settings row is still absent.
    const marketRows = await tx.query<SqlRow>(`SELECT id FROM markets WHERE code='sparta' FOR UPDATE`);
    const marketId = marketRows.rows[0]?.id ? String(marketRows.rows[0].id) : undefined;
    if (!marketId) throw new Error("Sparta market is unavailable for Launch Control targets");

    const locked = await tx.query<SqlRow>(`
      SELECT value,version,updated_at,updated_by
      FROM system_settings
      WHERE market_id=$1 AND key=$2
      FOR UPDATE
    `, [marketId, LAUNCH_CONTROL_TARGETS_KEY]);
    const previous = rowToSettings(locked.rows[0]);
    if (previous.version !== expectedVersion) throw new Error("LAUNCH_CONTROL_TARGET_VERSION_CONFLICT");

    const targets: Partial<Record<LaunchControlTargetKey, LaunchControlTargetEntry>> = {};
    for (const key of TARGET_KEYS) {
      const draft = drafts[key];
      if (!draft) continue;
      const current = currentValues[key];
      if (current === undefined || !Number.isFinite(current)) throw new Error(`Current source is unavailable for target: ${key}`);
      const prior = previous.document.targets[key];
      const unchanged = prior && prior.value === draft.value && prior.deadline === draft.deadline;
      targets[key] = {
        value: draft.value,
        deadline: draft.deadline,
        baselineValue: unchanged ? prior.baselineValue : current,
        baselineAt: unchanged ? prior.baselineAt : now
      };
    }

    const document: LaunchControlTargetDocument = {
      schemaVersion: LAUNCH_CONTROL_TARGET_SCHEMA_VERSION,
      targets
    };
    const nextVersion = previous.version + 1;
    const result = await tx.query<SqlRow>(`
      INSERT INTO system_settings (market_id,key,value,version,updated_by,updated_at)
      VALUES ($1,$2,$3::jsonb,$4,$5,now())
      ON CONFLICT (market_id,key) DO UPDATE SET
        value=EXCLUDED.value,
        version=EXCLUDED.version,
        updated_by=EXCLUDED.updated_by,
        updated_at=now()
      RETURNING value,version,updated_at,updated_by
    `, [marketId, LAUNCH_CONTROL_TARGETS_KEY, JSON.stringify(document), nextVersion, principal.userId]);
    if (!result.rows[0]) throw new Error("Launch Control targets could not be persisted");
    return rowToSettings(result.rows[0]);
  });
}
