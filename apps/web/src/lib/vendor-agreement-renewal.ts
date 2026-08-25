import { randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { activateCommercialAgreement } from "./admin-commercial-agreements";
import { getProductionPostgresRuntime } from "./postgres-runtime";

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function timestamp(value: unknown, field: string): Date {
  const raw = text(value, field);
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${field} is invalid`);
  return parsed;
}

async function resolveActorUserId(
  client: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rowCount: number | null; rows: any[] }> },
  principal: SessionPrincipal
): Promise<string | null> {
  const actor = await client.query(`SELECT id FROM users WHERE public_id=$1 OR id::text=$1`, [principal.userId]);
  return actor.rowCount ? String(actor.rows[0].id) : null;
}

export async function createCommercialAgreementRenewal(
  principal: SessionPrincipal,
  raw: Record<string, unknown>
): Promise<{ agreementId: string; agreementCode: string }> {
  const vendorId = text(raw.vendorId, "vendorId");
  const predecessorAgreementId = text(raw.predecessorAgreementId, "predecessorAgreementId");
  const startsAt = timestamp(raw.startsAt, "startsAt");
  const endsAt = timestamp(raw.endsAt, "endsAt");
  if (endsAt <= startsAt) throw new Error("Renewal end must be after renewal start");

  const client = await getProductionPostgresRuntime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const predecessor = await client.query(`
      SELECT a.*, v.id AS vendor_uuid, v.market_id AS vendor_market_id
      FROM vendor_commercial_agreements a
      JOIN vendor_businesses v ON v.id=a.vendor_id
      WHERE (v.public_id=$1 OR v.id::text=$1)
        AND (a.public_id=$2 OR a.id::text=$2)
      FOR UPDATE OF a, v
    `, [vendorId, predecessorAgreementId]);
    if (!predecessor.rowCount) throw new Error("Agreement to renew was not found for this vendor");
    const previous = predecessor.rows[0];
    const previousStatus = String(previous.status);
    if (!["active", "expired", "suspended"].includes(previousStatus)) {
      throw new Error(`Agreement in status ${previousStatus} cannot be renewed`);
    }
    if (!previous.ends_at) throw new Error("Open-ended agreements do not need an extension; terminate or replace the agreement instead");
    const previousEndsAt = new Date(previous.ends_at);
    if (startsAt.getTime() < previousEndsAt.getTime()) {
      throw new Error("Renewal must start when or after the current agreement ends; overlapping signed terms are not allowed");
    }

    const successor = await client.query(`
      SELECT public_id, status
      FROM vendor_commercial_agreements
      WHERE supersedes_agreement_id=$1
        AND status NOT IN ('rejected','terminated')
      LIMIT 1
    `, [previous.id]);
    if (successor.rowCount) {
      throw new Error(`A successor agreement already exists (${successor.rows[0].public_id}, ${successor.rows[0].status})`);
    }

    const actorUserId = await resolveActorUserId(client, principal);
    const versionResult = await client.query(`
      SELECT COALESCE(max(agreement_version),0)+1 AS next_version
      FROM vendor_commercial_agreements
      WHERE vendor_id=$1
    `, [previous.vendor_id]);
    const nextVersion = Number(versionResult.rows[0]?.next_version ?? Number(previous.agreement_version) + 1);
    const publicId = `agreement_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const renewalMeta = {
      predecessorAgreementId: String(previous.public_id),
      predecessorAgreementCode: String(previous.agreement_code),
      createdAt: new Date().toISOString()
    };

    const inserted = await client.query(`
      INSERT INTO vendor_commercial_agreements(
        id, public_id, market_id, vendor_id, subscription_id,
        agreement_code, agreement_version, status, starts_at, ends_at,
        commission_rate_bps, commission_basis, commission_tax_mode, commission_tax_rate_bps,
        commission_applies_to_shipping, listing_fee_minor, recurring_fee_minor, recurring_fee_period,
        fee_tax_mode, fee_tax_rate_bps, terms_snapshot, vendor_snapshot, commercial_terms_snapshot,
        supersedes_agreement_id, created_by, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,
        '',$6,'data_complete',$7,$8,
        $9,$10,$11,$12,$13,$14,$15,$16,
        $17,$18,$19::jsonb,$20::jsonb,$21::jsonb,
        $22,$23,now(),now()
      )
      RETURNING id, agreement_code
    `, [
      randomUUID(), publicId, previous.vendor_market_id, previous.vendor_id, previous.subscription_id,
      nextVersion, startsAt, endsAt,
      previous.commission_rate_bps, previous.commission_basis, previous.commission_tax_mode,
      previous.commission_tax_rate_bps, previous.commission_applies_to_shipping,
      previous.listing_fee_minor, previous.recurring_fee_minor, previous.recurring_fee_period,
      previous.fee_tax_mode, previous.fee_tax_rate_bps,
      JSON.stringify({ ...(previous.terms_snapshot ?? {}), renewal: renewalMeta }),
      JSON.stringify(previous.vendor_snapshot ?? {}),
      JSON.stringify({ ...(previous.commercial_terms_snapshot ?? {}), renewal: renewalMeta }),
      previous.id, actorUserId
    ]);

    await client.query(`
      INSERT INTO vendor_agreement_audit_log(
        agreement_id, vendor_id, action, from_status, to_status, actor_user_id, metadata, created_at
      ) VALUES ($1,$2,'agreement_renewal_created',NULL,'data_complete',$3,$4::jsonb,now())
    `, [inserted.rows[0].id, previous.vendor_id, actorUserId, JSON.stringify({
      predecessorAgreementId: previous.public_id,
      predecessorAgreementCode: previous.agreement_code,
      predecessorStatus: previousStatus,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString()
    })]);

    await client.query("COMMIT");
    return { agreementId: publicId, agreementCode: String(inserted.rows[0].agreement_code) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function activateOrScheduleCommercialAgreement(
  principal: SessionPrincipal,
  agreementIdRaw: unknown
): Promise<{ scheduled: boolean }> {
  const agreementId = text(agreementIdRaw, "agreementId");
  const pool = getProductionPostgresRuntime().nativePool;
  const lookup = await pool.query(`
    SELECT id, vendor_id, status, starts_at, ends_at
    FROM vendor_commercial_agreements
    WHERE public_id=$1 OR id::text=$1
  `, [agreementId]);
  if (!lookup.rowCount) throw new Error("Agreement not found");
  const row = lookup.rows[0];
  const now = new Date();
  const startsAt = new Date(row.starts_at);
  const endsAt = row.ends_at ? new Date(row.ends_at) : undefined;
  if (endsAt && endsAt <= now) throw new Error("Agreement has already ended and cannot be activated");

  if (startsAt > now) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(`
        SELECT id, vendor_id, status, starts_at
        FROM vendor_commercial_agreements
        WHERE id=$1
        FOR UPDATE
      `, [row.id]);
      if (!current.rowCount) throw new Error("Agreement not found");
      const status = String(current.rows[0].status);
      if (!['govgr_verified', 'eligible_for_activation'].includes(status)) {
        throw new Error("Future agreement must be gov.gr verified before activation can be scheduled");
      }
      if (status === 'govgr_verified') {
        const actorUserId = await resolveActorUserId(client, principal);
        await client.query(`
          UPDATE vendor_commercial_agreements
          SET status='eligible_for_activation', updated_at=now()
          WHERE id=$1
        `, [row.id]);
        await client.query(`
          INSERT INTO vendor_agreement_audit_log(
            agreement_id, vendor_id, action, from_status, to_status, actor_user_id, metadata, created_at
          ) VALUES ($1,$2,'agreement_activation_scheduled','govgr_verified','eligible_for_activation',$3,$4::jsonb,now())
        `, [row.id, row.vendor_id, actorUserId, JSON.stringify({ startsAt: startsAt.toISOString() })]);
      }
      await client.query("COMMIT");
      return { scheduled: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  await activateCommercialAgreement(principal, agreementId);
  return { scheduled: false };
}
