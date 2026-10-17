import type { PoolClient } from "pg";
import type { ProductionPostgresRuntime } from "@buy-local-sparta/postgres-runtime";

type CanonicalizationGroup = Readonly<{
  snapshot_id: string;
  source_code: string;
  vendor_id: string;
  location_id: string;
  pending_rows: number;
}>;

export type CatalogueIntakeAutomationResult = Readonly<{
  workerId: string;
  intelligence: Readonly<Record<string, unknown>>;
  claimedGroups: number;
  completedGroups: number;
  failedGroups: number;
  groups: readonly Readonly<{
    snapshotId: string;
    vendorId: string;
    locationId: string;
    pendingRows: number;
    outcome?: Readonly<Record<string, unknown>>;
    error?: string;
  }>[];
}>;

export async function runCatalogueIntakeAutomationCycle(
  runtime: ProductionPostgresRuntime,
  input: Readonly<{
    workerId: string;
    intelligenceLimit?: number;
    maxGroups?: number;
  }>
): Promise<CatalogueIntakeAutomationResult> {
  const workerId = requiredText(input.workerId, "workerId");
  const intelligenceLimit = positiveInteger(input.intelligenceLimit, 25, "intelligenceLimit");
  const maxGroups = positiveInteger(input.maxGroups, 3, "maxGroups");

  const intelligence = await withPlatformTransaction(runtime, async (client) => {
    const result = await client.query<{ result: Record<string, unknown> }>(
      "SELECT bls_private.process_catalog_intelligence_refresh_queue($1,$2,300) AS result",
      [workerId, intelligenceLimit]
    );
    return result.rows[0]?.result ?? {};
  });

  const groups = await withPlatformTransaction(runtime, async (client) => {
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
        AND vca.metadata->>'assignment'='bulk_snapshot_v1'
        AND (
          vca.canonical_variant_id IS NULL
          OR approved_link.canonical_variant_id IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.catalog_canonicalization_reviews review
          WHERE review.source_product_id=sp.id
            AND review.status='open'
            AND review.reason_code IN ('canonical_identity_ambiguous','material_variant_conflict')
        )
      GROUP BY sp.snapshot_id,cs.code,vca.vendor_id,vca.location_id
      ORDER BY max(vca.updated_at) ASC,sp.snapshot_id,vca.vendor_id,vca.location_id
      LIMIT $1
    `, [maxGroups]);
    return result.rows;
  });

  const outcomes: Array<{
    snapshotId: string;
    vendorId: string;
    locationId: string;
    pendingRows: number;
    outcome?: Readonly<Record<string, unknown>>;
    error?: string;
  }> = [];

  for (const group of groups) {
    const base = {
      snapshotId: group.snapshot_id,
      vendorId: group.vendor_id,
      locationId: group.location_id,
      pendingRows: Number(group.pending_rows ?? 0)
    };
    const lockKey = `catalogue-intake:${group.snapshot_id}:${group.vendor_id}:${group.location_id}`;

    try {
      const outcome = await withPlatformTransaction(runtime, async (client) => {
        await client.query("SET LOCAL statement_timeout = '10min'");
        const lock = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired",
          [lockKey]
        );
        if (lock.rows[0]?.acquired !== true) {
          return { skipped: true, reason: "busy" } as Readonly<Record<string, unknown>>;
        }

        const applied = await client.query<{ result: Record<string, unknown> }>(
          `SELECT bls_private.apply_catalog_source_canonicalization(
            $1,$2::uuid,$3::uuid,$4::uuid,0.95,2400
          ) AS result`,
          [group.source_code, group.vendor_id, group.location_id, group.snapshot_id]
        );
        return applied.rows[0]?.result ?? {};
      });
      outcomes.push({ ...base, outcome });
    } catch (error) {
      outcomes.push({ ...base, error: safeError(error) });
    }
  }

  const failedGroups = outcomes.filter((entry) => entry.error).length;
  return {
    workerId,
    intelligence,
    claimedGroups: groups.length,
    completedGroups: groups.length - failedGroups,
    failedGroups,
    groups: outcomes
  };
}

async function withPlatformTransaction<T>(
  runtime: ProductionPostgresRuntime,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
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

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) throw new Error(`${name} must be a positive integer`);
  return resolved;
}

function requiredText(value: string, name: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
