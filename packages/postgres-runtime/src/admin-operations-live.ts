import {
  PostgresUnitOfWork,
  type PostgresPersistenceBundle,
  type SessionPrincipal,
  type SqlPool,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "./admin-auth.ts";
import { PostgresAdminOperationsService as BasePostgresAdminOperationsService } from "./admin-operations.ts";

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function int(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Database field ${field} is not a safe integer`);
  return parsed;
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function epoch(value: unknown, field: string): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`Database field ${field} is not a timestamp`);
  return parsed;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * Runtime-safe admin operations adapter for read models that must track the live
 * PostgreSQL schema without weakening the shared governed write service.
 *
 * fairness_assignment_events moved to JSON evidence snapshots and no longer has
 * the legacy sticky/selected_offer_id/market_id columns. The current Admin
 * Fairness screen consumes rotation snapshots, appeals and anomaly evidence, so
 * the legacy assignment projection is intentionally empty until a modern
 * assignment-evidence DTO is introduced end-to-end.
 */
export class PostgresAdminOperationsLiveService extends BasePostgresAdminOperationsService {
  readonly #fairnessUow: PostgresUnitOfWork;

  constructor(pool: SqlPool, persistence: PostgresPersistenceBundle) {
    super(pool, persistence);
    this.#fairnessUow = new PostgresUnitOfWork(pool);
  }

  override async fairnessWorkspace(principal: SessionPrincipal) {
    return this.#fairnessUow.withTransaction(platformScope(principal.userId), async (tx) => {
      const variants = await tx.query<SqlRow>(`SELECT cv.id::text AS canonical_uuid,cv.public_id,COALESCE(el.title,en.title,cv.model,cv.slug) AS title
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE m.code='sparta'
        ORDER BY cv.created_at DESC`);

      const states = await tx.query<SqlRow>(`SELECT s.canonical_variant_id::text AS canonical_uuid,v.public_id AS vendor_public_id,s.deficit,s.qualified_exposures,s.capacity_weight,s.updated_at
        FROM fairness_rotation_state s
        JOIN vendor_businesses v ON v.id=s.vendor_id
        WHERE s.market_id=(SELECT id FROM markets WHERE code='sparta')`);

      const byVariant = new Map<string, Array<{ vendorId: string; deficit: number; qualifiedExposures: number; capacityWeight: number; updatedAt: number }>>();
      for (const row of states.rows) {
        const key = text(row.canonical_uuid, "canonical_uuid");
        const list = byVariant.get(key) ?? [];
        list.push({
          vendorId: text(row.vendor_public_id, "vendor_public_id"),
          deficit: num(row.deficit),
          qualifiedExposures: int(row.qualified_exposures, "qualified_exposures"),
          capacityWeight: num(row.capacity_weight),
          updatedAt: epoch(row.updated_at, "updated_at")
        });
        byVariant.set(key, list);
      }

      const appeals = await tx.query<SqlRow>(`SELECT a.public_id,v.public_id AS vendor_public_id,cv.public_id AS canonical_public_id,u.public_id AS submitted_by,a.reason,a.status,a.resolution,ru.public_id AS resolved_by,a.created_at,a.updated_at,a.resolved_at
        FROM fairness_appeals a
        JOIN vendor_businesses v ON v.id=a.vendor_id
        LEFT JOIN canonical_variants cv ON cv.id=a.canonical_variant_id
        LEFT JOIN users u ON u.id=a.submitted_by
        LEFT JOIN users ru ON ru.id=a.resolved_by
        WHERE a.market_id=(SELECT id FROM markets WHERE code='sparta')
        ORDER BY a.created_at DESC`);

      const anomalies = await tx.query<SqlRow>(`SELECT a.public_id,cv.public_id AS canonical_public_id,v.public_id AS vendor_public_id,a.metric,a.target_share,a.actual_share,a.deviation,a.sample_size,a.threshold,a.status,a.details,a.detected_at,a.acknowledged_at,a.resolved_at
        FROM fairness_anomalies a
        JOIN canonical_variants cv ON cv.id=a.canonical_variant_id
        JOIN vendor_businesses v ON v.id=a.vendor_id
        WHERE a.market_id=(SELECT id FROM markets WHERE code='sparta')
        ORDER BY a.detected_at DESC`);

      return {
        csrfToken: principal.csrfToken,
        snapshots: variants.rows.map((row) => ({
          id: text(row.public_id, "variant.public_id"),
          title: text(row.title, "title"),
          snapshot: byVariant.get(text(row.canonical_uuid, "canonical_uuid")) ?? []
        })),
        appeals: appeals.rows.map((row) => ({
          id: text(row.public_id, "appeal.public_id"),
          vendorId: text(row.vendor_public_id, "vendor_public_id"),
          canonicalVariantId: optionalText(row.canonical_public_id),
          submittedBy: optionalText(row.submitted_by),
          reason: text(row.reason, "reason"),
          status: text(row.status, "status"),
          resolution: optionalText(row.resolution),
          resolvedBy: optionalText(row.resolved_by),
          createdAt: epoch(row.created_at, "created_at"),
          updatedAt: epoch(row.updated_at, "updated_at"),
          resolvedAt: row.resolved_at ? epoch(row.resolved_at, "resolved_at") : undefined
        })),
        anomalies: anomalies.rows.map((row) => ({
          id: text(row.public_id, "anomaly.public_id"),
          canonicalVariantId: text(row.canonical_public_id, "canonical_public_id"),
          vendorId: text(row.vendor_public_id, "vendor_public_id"),
          metric: text(row.metric, "metric"),
          targetShare: num(row.target_share),
          actualShare: num(row.actual_share),
          deviation: num(row.deviation),
          sampleSize: int(row.sample_size, "sample_size"),
          threshold: num(row.threshold),
          status: text(row.status, "status"),
          details: jsonObject(row.details),
          detectedAt: epoch(row.detected_at, "detected_at")
        })),
        recentAssignments: []
      };
    }, { readOnly: true });
  }
}
