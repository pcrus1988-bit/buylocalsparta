import { randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function asIso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function requiredDate(value: unknown, label: string): Date {
  const date = new Date(String(value ?? ""));
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid`);
  return date;
}

export type VendorAgreementRenewalPreview = Readonly<{
  vendorId: string;
  vendorName: string;
  agreementId: string;
  agreementCode: string;
  agreementVersion: number;
  status: string;
  startsAt: string;
  endsAt?: string;
  commissionRateBps: number;
  listingFeeMinor?: number;
  recurringFeeMinor?: number;
  recurringFeePeriod?: string;
  commercialTermsSnapshot: Record<string, unknown>;
}>;

export async function reconcileVendorAgreementLifecycle(now = new Date()) {
  if (!productionDatabaseConfigured()) return { skipped: true, reason: "database_not_configured" } as const;
  const result = await getProductionPostgresRuntime().nativePool.query(
    "SELECT bls_private.reconcile_vendor_agreement_lifecycle($1::timestamptz) AS result",
    [now]
  );
  return result.rows[0]?.result ?? { expiredAgreements: 0, activatedSuccessors: 0, restrictedVendors: 0, reconciledAt: now.toISOString() };
}

export async function adminVendorAgreementRenewalPreview(
  principal: SessionPrincipal,
  vendorId: string
): Promise<VendorAgreementRenewalPreview> {
  assertAdminPermission(principal, "finance.read");
  if (!productionDatabaseConfigured()) throw new Error("Vendor agreement renewal requires the production database");

  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT
      v.public_id AS vendor_public_id,
      v.trading_name,
      a.public_id AS agreement_public_id,
      a.agreement_code,
      a.agreement_version,
      a.status,
      a.starts_at,
      a.ends_at,
      a.commission_rate_bps,
      a.listing_fee_minor,
      a.recurring_fee_minor,
      a.recurring_fee_period,
      a.commercial_terms_snapshot
    FROM vendor_businesses v
    JOIN LATERAL (
      SELECT current_agreement.*
      FROM vendor_commercial_agreements current_agreement
      WHERE current_agreement.vendor_id = v.id
      ORDER BY
        CASE current_agreement.status
          WHEN 'active' THEN 0
          WHEN 'expired' THEN 1
          WHEN 'suspended' THEN 2
          ELSE 3
        END,
        current_agreement.ends_at DESC NULLS FIRST,
        current_agreement.updated_at DESC
      LIMIT 1
    ) a ON true
    WHERE v.public_id=$1 OR v.id::text=$1
    LIMIT 1
  `, [vendorId]);
  if (!result.rowCount) throw new Error("Vendor agreement not found");
  const row = result.rows[0];
  return {
    vendorId: String(row.vendor_public_id),
    vendorName: String(row.trading_name),
    agreementId: String(row.agreement_public_id),
    agreementCode: String(row.agreement_code),
    agreementVersion: Number(row.agreement_version),
    status: String(row.status),
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: asIso(row.ends_at),
    commissionRateBps: Number(row.commission_rate_bps),
    listingFeeMinor: row.listing_fee_minor == null ? undefined : Number(row.listing_fee_minor),
    recurringFeeMinor: row.recurring_fee_minor == null ? undefined : Number(row.recurring_fee_minor),
    recurringFeePeriod: row.recurring_fee_period ? String(row.recurring_fee_period) : undefined,
    commercialTermsSnapshot: row.commercial_terms_snapshot && typeof row.commercial_terms_snapshot === "object" ? row.commercial_terms_snapshot : {}
  };
}

export async function createAdminVendorAgreementRenewal(
  principal: SessionPrincipal,
  input: { vendorId: string; predecessorAgreementId: string; startsAt: unknown; endsAt: unknown; reason: string }
) {
  assertAdminPermission(principal, "finance.write");
  if (!productionDatabaseConfigured()) throw new Error("Vendor agreement renewal requires the production database");
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Renewal reason is required");
  const startsAt = requiredDate(input.startsAt, "Renewal start date");
  const endsAt = requiredDate(input.endsAt, "Renewal end date");
  if (endsAt <= startsAt) throw new Error("Renewal end date must be after the start date");

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const predecessorResult = await client.query(`
      SELECT a.*,v.public_id AS vendor_public_id,v.trading_name
      FROM vendor_commercial_agreements a
      JOIN vendor_businesses v ON v.id=a.vendor_id
      WHERE (a.public_id=$1 OR a.id::text=$1)
        AND (v.public_id=$2 OR v.id::text=$2)
      FOR UPDATE OF a,v
    `, [input.predecessorAgreementId, input.vendorId]);
    if (!predecessorResult.rowCount) throw new Error("Predecessor agreement not found");
    const predecessor = predecessorResult.rows[0];
    if (!["active", "expired", "suspended", "terminated", "superseded"].includes(String(predecessor.status))) {
      throw new Error("Only an established agreement can be renewed");
    }

    const duplicate = await client.query(`
      SELECT public_id,status
      FROM vendor_commercial_agreements
      WHERE supersedes_agreement_id=$1
        AND status NOT IN ('expired','terminated','superseded','rejected')
      ORDER BY created_at DESC
      LIMIT 1
    `, [predecessor.id]);
    if (duplicate.rowCount) throw new Error(`A renewal successor already exists (${duplicate.rows[0].public_id}, ${duplicate.rows[0].status})`);

    const predecessorEndsAt = predecessor.ends_at ? new Date(predecessor.ends_at) : undefined;
    if (predecessorEndsAt && startsAt < predecessorEndsAt) {
      throw new Error("A renewal cannot start before the predecessor agreement ends");
    }
    if (!predecessorEndsAt && String(predecessor.status) === "active") {
      throw new Error("Open-ended active agreements must be terminated or assigned an end date before creating a renewal");
    }

    const actor = await client.query(`SELECT id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [principal.userId]);
    const actorUserId = actor.rows[0]?.id ?? null;
    const nextVersionResult = await client.query(`
      SELECT COALESCE(max(agreement_version),0)::int + 1 AS version
      FROM vendor_commercial_agreements
      WHERE agreement_code=$1
    `, [predecessor.agreement_code]);
    const nextVersion = Number(nextVersionResult.rows[0]?.version ?? Number(predecessor.agreement_version) + 1);
    const publicId = `agreement_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const renewalTerms = {
      ...(predecessor.commercial_terms_snapshot ?? {}),
      renewal: {
        predecessorAgreementId: String(predecessor.public_id),
        predecessorAgreementCode: String(predecessor.agreement_code),
        predecessorAgreementVersion: Number(predecessor.agreement_version),
        reason,
        createdAt: new Date().toISOString()
      }
    };
    const termsSnapshot = {
      ...(predecessor.terms_snapshot ?? {}),
      renewalOf: String(predecessor.public_id),
      renewalReason: reason
    };

    const inserted = await client.query(`
      INSERT INTO vendor_commercial_agreements(
        id,public_id,market_id,vendor_id,subscription_id,agreement_code,agreement_version,status,
        starts_at,ends_at,signed_at,commission_rate_bps,commission_basis,commission_tax_mode,
        commission_tax_rate_bps,commission_applies_to_shipping,listing_fee_minor,recurring_fee_minor,
        recurring_fee_period,source_document_reference,terms_snapshot,created_by,created_at,updated_at,
        vendor_snapshot,commercial_terms_snapshot,supersedes_agreement_id,aade_reporting_status,
        fee_tax_mode,fee_tax_rate_bps
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,'data_complete',$8,$9,NULL,$10,$11,$12,$13,$14,$15,$16,$17,NULL,
        $18::jsonb,$19,now(),now(),$20::jsonb,$21::jsonb,$22,'not_assessed',$23,$24
      )
      RETURNING id,public_id,agreement_code,agreement_version
    `, [
      randomUUID(), publicId, predecessor.market_id, predecessor.vendor_id, predecessor.subscription_id,
      predecessor.agreement_code, nextVersion, startsAt, endsAt, predecessor.commission_rate_bps,
      predecessor.commission_basis, predecessor.commission_tax_mode, predecessor.commission_tax_rate_bps,
      predecessor.commission_applies_to_shipping, predecessor.listing_fee_minor, predecessor.recurring_fee_minor,
      predecessor.recurring_fee_period, JSON.stringify(termsSnapshot), actorUserId,
      JSON.stringify(predecessor.vendor_snapshot ?? {}), JSON.stringify(renewalTerms), predecessor.id,
      predecessor.fee_tax_mode, predecessor.fee_tax_rate_bps
    ]);

    await client.query(`
      INSERT INTO vendor_agreement_audit_log(
        agreement_id,vendor_id,action,from_status,to_status,actor_user_id,metadata,created_at
      ) VALUES($1,$2,'renewal_successor_created',NULL,'data_complete',$3,$4::jsonb,now())
    `, [inserted.rows[0].id, predecessor.vendor_id, actorUserId, JSON.stringify({
      predecessorAgreementId: String(predecessor.public_id),
      predecessorAgreementCode: String(predecessor.agreement_code),
      predecessorAgreementVersion: Number(predecessor.agreement_version),
      renewalStartsAt: startsAt.toISOString(),
      renewalEndsAt: endsAt.toISOString(),
      reason
    })]);

    await client.query("COMMIT");
    return {
      vendorId: String(predecessor.vendor_public_id),
      agreementId: String(inserted.rows[0].public_id),
      agreementCode: String(inserted.rows[0].agreement_code),
      agreementVersion: Number(inserted.rows[0].agreement_version),
      predecessorAgreementId: String(predecessor.public_id)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
