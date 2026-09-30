import { hostname } from "node:os";
import type { PoolClient } from "pg";
import {
  getProductionPostgresRuntime,
  productionDatabaseReadiness
} from "../apps/web/src/lib/postgres-runtime.ts";

type CanonicalizationGroup = Readonly<{
  snapshot_id: string;
  source_code: string;
  vendor_id: string;
  location_id: string;
  pending_rows: number;
}>;

const workerId = process.env.BLS_CATALOGUE_INTAKE_WORKER_ID?.trim()
  || `catalogue-intake-automation:${hostname()}:${process.pid}`;
const maxGroups = positiveInteger(process.env.BLS_CATALOGUE_INTAKE_MAX_GROUPS, 3, "BLS_CATALOGUE_INTAKE_MAX_GROUPS");
const intelligenceLimit = positiveInteger(process.env.BLS_CATALOGUE_INTELLIGENCE_LIMIT, 25, "BLS_CATALOGUE_INTELLIGENCE_LIMIT");

await waitForDatabaseReadiness();
const runtime = getProductionPostgresRuntime();

try {
  const intelligence = await withPlatformTransaction(async (client) => {
    const result = await client.query<{ result: Record<string, unknown> }>(
      "SELECT bls_private.process_catalog_intelligence_refresh_queue($1,$2,300) AS result",
      [workerId, intelligenceLimit]
    );
    return result.rows[0]?.result ?? {};
  });

  log("info", "catalogue_intake.intelligence_cycle", {
    workerId,
    ...intelligence
  });

  const groups = await withPlatformTransaction(async (client) => {
    const result = await client.query<CanonicalizationGroup>(`
      SELECT
        sp.snapshot_id::text,
        cs.code AS source_code,
        vca.vendor_id::text,
        vca.location_id::text,
        count(*)::integer AS pending_rows
      FROM public.vendor_catalog_assortments vca
      JOIN public.catalog_source_products sp
        ON sp.id=vca.source_product_id
      JOIN public.catalog_sources cs
        ON cs.id=sp.source_id
      LEFT JOIN public.catalog_source_product_links approved_link
        ON approved_link.source_product_id=sp.id
       AND approved_link.link_status='approved'
      WHERE vca.source_product_id IS NOT NULL
        AND vca.assortment_status NOT IN ('rejected','discontinued')
        AND (
          vca.canonical_variant_id IS NULL
          OR approved_link.canonical_variant_id IS NULL
        )
      GROUP BY sp.snapshot_id,cs.code,vca.vendor_id,vca.location_id
      ORDER BY max(vca.updated_at) ASC,sp.snapshot_id,vca.vendor_id,vca.location_id
      LIMIT $1
    `, [maxGroups]);
    return result.rows;
  });

  if (groups.length === 0) {
    log("info", "catalogue_intake.canonicalization_idle", { workerId });
  }

  for (const group of groups) {
    const lockKey = `catalogue-intake:${group.snapshot_id}:${group.vendor_id}:${group.location_id}`;
    try {
      const outcome = await withPlatformTransaction(async (client) => {
        await client.query("SET LOCAL statement_timeout = '10min'");
        const lock = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired",
          [lockKey]
        );
        if (lock.rows[0]?.acquired !== true) return { skipped: true, reason: "busy" } as const;

        const applied = await client.query<{ result: Record<string, unknown> }>(
          `SELECT bls_private.apply_catalog_source_canonicalization(
            $1,$2::uuid,$3::uuid,$4::uuid,0.95,2400
          ) AS result`,
          [group.source_code, group.vendor_id, group.location_id, group.snapshot_id]
        );
        return applied.rows[0]?.result ?? {};
      });

      log("info", "catalogue_intake.canonicalization_cycle", {
        workerId,
        snapshotId: group.snapshot_id,
        vendorId: group.vendor_id,
        locationId: group.location_id,
        pendingRows: Number(group.pending_rows ?? 0),
        outcome
      });
    } catch (error) {
      log("error", "catalogue_intake.canonicalization_failed", {
        workerId,
        snapshotId: group.snapshot_id,
        vendorId: group.vendor_id,
        locationId: group.location_id,
        pendingRows: Number(group.pending_rows ?? 0),
        error: safeError(error)
      });
    }
  }
} finally {
  await runtime.close();
}

async function withPlatformTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE bls_platform_runtime");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function waitForDatabaseReadiness(): Promise<void> {
  const readiness = await productionDatabaseReadiness();
  if (!readiness.ok) {
    throw new Error(`Catalogue intake automation refused to run: ${readiness.message}`);
  }
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function log(level: "info" | "error", event: string, details: Record<string, unknown>): void {
  const payload = JSON.stringify({ level, event, at: new Date().toISOString(), ...details });
  if (level === "error") console.error(payload);
  else console.info(payload);
}
