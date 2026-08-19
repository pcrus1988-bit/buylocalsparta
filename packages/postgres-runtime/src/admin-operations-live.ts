import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  VendorOnboardingWorkflow,
  type PostgresPersistenceBundle,
  type SessionPrincipal,
  type SqlPool,
  type SqlRow,
  type VendorOnboardingState
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
 * It also owns production-only vendor onboarding hardening. The base service
 * historically locked a nullable LEFT JOIN relation, which PostgreSQL rejects,
 * and created the vendor business only at activation time. Production onboarding
 * now locks only the application row, provisions the non-operational shop after
 * verification, and requires a signed active cooperation agreement before the
 * shop can become operational.
 *
 * fairness_assignment_events moved to JSON evidence snapshots and no longer has
 * the legacy sticky/selected_offer_id/market_id columns. The current Admin
 * Fairness screen consumes rotation snapshots, appeals and anomaly evidence, so
 * the legacy assignment projection is intentionally empty until a modern
 * assignment-evidence DTO is introduced end-to-end.
 */
export class PostgresAdminOperationsLiveService extends BasePostgresAdminOperationsService {
  readonly #fairnessUow: PostgresUnitOfWork;
  readonly #onboardingUow: PostgresUnitOfWork;
  readonly #persistence: PostgresPersistenceBundle;

  constructor(pool: SqlPool, persistence: PostgresPersistenceBundle) {
    super(pool, persistence);
    this.#fairnessUow = new PostgresUnitOfWork(pool);
    this.#onboardingUow = new PostgresUnitOfWork(pool);
    this.#persistence = persistence;
  }

  override async transitionVendorApplication(principal: SessionPrincipal, input: { applicationId: string; to: VendorOnboardingState; reason: string; now?: number }) {
    const now = input.now ?? Date.now();
    const reason = input.reason.trim();
    if (reason.length < 3) throw new Error("Transition reason is required");

    const result = await this.#onboardingUow.withTransaction(platformScope(principal.userId), async (tx) => {
      const current = await tx.query<SqlRow>(`
        SELECT
          a.id::text AS application_uuid,
          a.public_id,
          a.status::text AS status,
          a.owner_user_id::text AS owner_uuid,
          u.public_id AS owner_public_id,
          a.market_id::text AS market_uuid,
          a.legal_name,
          a.trading_name,
          a.tax_number,
          a.gemi_number,
          a.contact_email,
          a.phone,
          a.address_line1,
          a.postcode,
          a.shop_story,
          a.vendor_id::text AS vendor_uuid,
          v.public_id AS vendor_public_id
        FROM vendor_applications a
        JOIN users u ON u.id=a.owner_user_id
        LEFT JOIN vendor_businesses v ON v.id=a.vendor_id
        WHERE a.public_id=$1 OR a.id::text=$1
        FOR UPDATE OF a`, [input.applicationId]);

      if (!current.rowCount) throw new Error("Vendor application not found");
      const row = current.rows[0];
      const from = text(row.status, "status") as VendorOnboardingState;
      new VendorOnboardingWorkflow(from).transition(input.to, principal.userId, reason, now);

      let vendorUuid = optionalText(row.vendor_uuid);
      let vendorPublicId = optionalText(row.vendor_public_id);

      // A formal shop record is needed before contract preparation can happen.
      // Provision it after verification while keeping it non-operational and hidden.
      if (!vendorUuid && ["catalog_onboarding", "test_ready"].includes(input.to)) {
        vendorPublicId = `vendor_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
        const insertedVendor = await tx.query<SqlRow>(`
          INSERT INTO vendor_businesses(
            id,public_id,market_id,legal_name,trading_name,tax_number,gemi_number,status,
            verification_completed_at,contract_started_at,public_directory_visible,created_at,updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,false,$9,$9)
          RETURNING id::text AS id`, [
          randomUUID(),
          vendorPublicId,
          text(row.market_uuid, "market_uuid"),
          text(row.legal_name, "legal_name"),
          text(row.trading_name, "trading_name"),
          optionalText(row.tax_number) ?? null,
          optionalText(row.gemi_number) ?? null,
          input.to,
          new Date(now)
        ]);
        vendorUuid = text(insertedVendor.rows[0].id, "vendor.id");

        const locationPublicId = `location_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
        await tx.query(`
          INSERT INTO vendor_locations(
            id,public_id,vendor_id,market_id,name,address_line1,locality,postcode,country_code,
            phone,public_email,active,verified_at,created_at,updated_at
          ) VALUES($1,$2,$3,$4,$5,$6,'Sparta',$7,'GR',$8,$9,true,$10,$10,$10)`, [
          randomUUID(),
          locationPublicId,
          vendorUuid,
          text(row.market_uuid, "market_uuid"),
          text(row.trading_name, "trading_name"),
          text(row.address_line1, "address_line1"),
          text(row.postcode, "postcode"),
          optionalText(row.phone) ?? null,
          text(row.contact_email, "contact_email"),
          new Date(now)
        ]);

        const membership = await tx.query<SqlRow>(`
          INSERT INTO vendor_users(id,public_id,vendor_id,user_id,location_id,active,created_at)
          VALUES($1,$2,$3,$4,NULL,true,$5)
          RETURNING id::text AS id`, [
          randomUUID(),
          `vuser_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
          vendorUuid,
          text(row.owner_uuid, "owner_uuid"),
          new Date(now)
        ]);
        await tx.query("INSERT INTO vendor_user_roles(vendor_user_id,role) VALUES($1,'vendor_owner') ON CONFLICT DO NOTHING", [text(membership.rows[0].id, "vendor_user.id")]);
        if (optionalText(row.shop_story)) {
          await tx.query(`
            INSERT INTO vendor_profile_translations(vendor_id,locale,story)
            VALUES($1,'el',$2)
            ON CONFLICT(vendor_id,locale) DO UPDATE SET story=EXCLUDED.story`, [vendorUuid, optionalText(row.shop_story)]);
        }
      }

      if (input.to === "active") {
        if (!vendorUuid) {
          throw new Error("The shop record is missing. Complete verification/catalog onboarding before activation.");
        }
        const agreement = await tx.query<SqlRow>(`
          SELECT status::text AS status,signed_at,source_document_reference
          FROM vendor_commercial_agreements
          WHERE vendor_id=$1::uuid
          ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,updated_at DESC,created_at DESC
          LIMIT 1`, [vendorUuid]);
        const documented = agreement.rows[0];
        if (!documented || text(documented.status, "agreement.status") !== "active" || !documented.signed_at || !optionalText(documented.source_document_reference)) {
          throw new Error("Activation is blocked until an active signed cooperation agreement with a signed-document reference is recorded.");
        }
      }

      if (vendorUuid) {
        if (input.to === "active") {
          await tx.query(`
            UPDATE vendor_businesses
            SET status='active',
                contract_started_at=COALESCE(contract_started_at,$2),
                contract_ended_at=NULL,
                public_directory_visible=false,
                public_directory_visibility_updated_at=$2,
                public_directory_visibility_reason='New activation awaiting explicit public publication',
                updated_at=$2
            WHERE id=$1::uuid`, [vendorUuid, new Date(now)]);
        } else if (["verification_pending", "catalog_onboarding", "test_ready", "restricted", "suspended", "closed"].includes(input.to)) {
          await tx.query(`
            UPDATE vendor_businesses
            SET status=$2,
                public_directory_visible=false,
                public_directory_visibility_updated_at=$3,
                public_directory_visibility_reason=$4,
                updated_at=$3
            WHERE id=$1::uuid`, [vendorUuid, input.to, new Date(now), `Onboarding state changed to ${input.to}`]);
        }
      }

      await tx.query(`
        UPDATE vendor_applications
        SET vendor_id=$2,
            status=$3,
            verification_notes=CASE WHEN $3='catalog_onboarding' THEN $4 ELSE verification_notes END,
            updated_at=$5
        WHERE id=$1::uuid`, [text(row.application_uuid, "application_uuid"), vendorUuid ?? null, input.to, reason, new Date(now)]);

      await tx.query(`
        INSERT INTO vendor_application_events(
          id,public_id,application_id,from_status,to_status,actor_user_id,actor_public_id,reason,occurred_at
        ) VALUES(
          $1,$2,$3,$4,$5,(SELECT id FROM users WHERE public_id=$6 OR id::text=$6 LIMIT 1),$6,$7,$8
        )`, [
        randomUUID(),
        `vapp_event_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        text(row.application_uuid, "application_uuid"),
        from,
        input.to,
        principal.userId,
        reason,
        new Date(now)
      ]);

      return { id: input.applicationId, from, state: input.to, vendorId: vendorPublicId, updatedAt: now };
    }, { isolation: "serializable" });

    await this.#persistence.trust.saveAudit({
      scope: platformScope(principal.userId),
      event: {
        id: `audit_${randomUUID()}`,
        actorId: principal.userId,
        actorRole: principal.roles[0],
        action: `vendor.application_${input.to}`,
        entityType: "vendor_application",
        entityId: input.applicationId,
        reason,
        after: result,
        createdAt: now
      }
    });

    return result;
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
