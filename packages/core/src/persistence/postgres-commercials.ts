import { randomUUID } from "node:crypto";
import type { FeeRule, FeeSnapshot } from "../finance/fees.ts";
import type { PaymentDispute } from "../finance/disputes.ts";
import type { DeliveryRule } from "../fulfilment/rates.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

async function resolveMarketUuid(db: SqlExecutor, marketId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code=$1 OR id::text=$1", [marketId]);
  return String(requireSingleRow(result, `Market ${marketId} was not found`).id);
}

async function resolvePublicUuid(db: SqlExecutor, table: "vendor_businesses" | "customer_orders" | "payments" | "procurements" | "fee_rules" | "payment_disputes", publicId: string): Promise<string> {
  const result = await db.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE public_id=$1 OR id::text=$1`, [publicId]);
  return String(requireSingleRow(result, `${table} ${publicId} was not found`).id);
}

async function resolveOptionalVendor(db: SqlExecutor, publicId?: string): Promise<string | null> {
  return publicId ? resolvePublicUuid(db, "vendor_businesses", publicId) : null;
}

async function resolvePlanUuid(db: SqlExecutor, marketUuid: string, code?: string): Promise<string | null> {
  if (!code) return null;
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM vendor_plans WHERE market_id=$1 AND code=$2", [marketUuid, code]);
  return String(requireSingleRow(result, `Vendor plan ${code} was not found`).id);
}

async function resolveCategoryUuid(db: SqlExecutor, marketUuid: string, code?: string): Promise<string | null> {
  if (!code) return null;
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM categories WHERE (market_id=$1 OR market_id IS NULL) AND code=$2 ORDER BY market_id NULLS LAST LIMIT 1", [marketUuid, code]);
  return String(requireSingleRow(result, `Category ${code} was not found`).id);
}

export class PostgresCommercialRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async saveDeliveryRule(input: { scope: DatabaseScope; rule: DeliveryRule }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.rule.marketId);
      const vendor = await resolveOptionalVendor(tx, input.rule.vendorId);
      await tx.query(`INSERT INTO delivery_rules (
          id, public_id, market_id, vendor_id, mode, postcode_prefixes, currency, base_charge_minor,
          additional_package_charge_minor, free_above_subtotal_minor, minimum_subtotal_minor,
          priority, version, active, starts_at, ends_at
        ) VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (public_id) DO UPDATE SET vendor_id=EXCLUDED.vendor_id, mode=EXCLUDED.mode,
          postcode_prefixes=EXCLUDED.postcode_prefixes, base_charge_minor=EXCLUDED.base_charge_minor,
          additional_package_charge_minor=EXCLUDED.additional_package_charge_minor,
          free_above_subtotal_minor=EXCLUDED.free_above_subtotal_minor,
          minimum_subtotal_minor=EXCLUDED.minimum_subtotal_minor, priority=EXCLUDED.priority,
          version=EXCLUDED.version, active=EXCLUDED.active, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at`, [
        randomUUID(), input.rule.id, market, vendor, input.rule.mode, input.rule.postcodePrefixes ?? [], input.rule.baseCharge.currency,
        input.rule.baseCharge.minor, input.rule.additionalPackageCharge?.minor ?? 0, input.rule.freeAboveSubtotal?.minor ?? null,
        input.rule.minimumSubtotal?.minor ?? null, input.rule.priority, input.rule.version, input.rule.active,
        new Date(input.rule.startsAt), input.rule.endsAt ? new Date(input.rule.endsAt) : null
      ]);
    });
  }

  async saveFeeRule(input: { scope: DatabaseScope; rule: FeeRule }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.rule.marketId);
      const vendor = await resolveOptionalVendor(tx, input.rule.vendorId);
      const plan = await resolvePlanUuid(tx, market, input.rule.planCode);
      const category = await resolveCategoryUuid(tx, market, input.rule.categoryCode);
      await tx.query(`INSERT INTO fee_rules (
          id, public_id, market_id, vendor_id, plan_id, category_id, rule_type, fee_code, source, calculation,
          basis, fixed_minor, rate_bps, cap_minor, floor_minor, tax_code, tax_rate_bps, fulfilment_mode,
          priority, starts_at, ends_at, version, active
        ) VALUES ($1,$2,$3,$4,$5,$6,'service_fee',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (public_id) DO UPDATE SET vendor_id=EXCLUDED.vendor_id, plan_id=EXCLUDED.plan_id,
          category_id=EXCLUDED.category_id, fee_code=EXCLUDED.fee_code, source=EXCLUDED.source,
          calculation=EXCLUDED.calculation, basis=EXCLUDED.basis, fixed_minor=EXCLUDED.fixed_minor,
          rate_bps=EXCLUDED.rate_bps, cap_minor=EXCLUDED.cap_minor, floor_minor=EXCLUDED.floor_minor,
          tax_rate_bps=EXCLUDED.tax_rate_bps, fulfilment_mode=EXCLUDED.fulfilment_mode,
          priority=EXCLUDED.priority, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
          version=EXCLUDED.version, active=EXCLUDED.active`, [
        randomUUID(), input.rule.id, market, vendor, plan, category, input.rule.feeCode, input.rule.source,
        input.rule.calculation, input.rule.basis, input.rule.fixedAmount?.minor ?? null, input.rule.rateBps ?? null,
        input.rule.capAmount?.minor ?? null, input.rule.floorAmount?.minor ?? null, `VAT_${input.rule.taxRateBps}`,
        input.rule.taxRateBps, input.rule.fulfilmentMode ?? null, input.rule.priority, new Date(input.rule.startsAt),
        input.rule.endsAt ? new Date(input.rule.endsAt) : null, input.rule.version, input.rule.active
      ]);
    });
  }

  async saveFeeSnapshots(input: {
    scope: DatabaseScope;
    procurementId: string;
    orderId: string;
    snapshots: readonly FeeSnapshot[];
  }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const procurement = await resolvePublicUuid(tx, "procurements", input.procurementId);
      const order = await resolvePublicUuid(tx, "customer_orders", input.orderId);
      for (const snapshot of input.snapshots) {
        const rule = await resolvePublicUuid(tx, "fee_rules", snapshot.ruleId);
        await tx.query(`INSERT INTO fee_snapshots (
            id, public_id, order_id, procurement_id, fee_rule_id, fee_code, rule_version, basis_amount_minor,
            net_amount_minor, tax_amount_minor, gross_amount_minor, resolved_rule, resolved_rule_version,
            amount_minor, resolved_at, created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$11,$14,$14)
          ON CONFLICT (public_id) DO NOTHING`, [
          randomUUID(), snapshot.id, order, procurement, rule, snapshot.feeCode, snapshot.ruleVersion,
          snapshot.basisAmount.minor, snapshot.netAmount.minor, snapshot.taxAmount.minor, snapshot.grossAmount.minor,
          JSON.stringify(snapshot.resolvedRule), JSON.stringify({ ruleId: snapshot.ruleId, version: snapshot.ruleVersion }),
          new Date(snapshot.resolvedAt)
        ]);
      }
    });
  }

  async saveDispute(input: { scope: DatabaseScope; marketId: string; dispute: PaymentDispute }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.marketId);
      const order = await resolvePublicUuid(tx, "customer_orders", input.dispute.orderId);
      const payment = await resolvePublicUuid(tx, "payments", input.dispute.paymentId);
      await tx.query(`INSERT INTO payment_disputes (
          id, public_id, market_id, order_id, payment_id, provider, provider_case_id, opening_provider_event_id,
          reason_code, currency, amount_minor, status, evidence_deadline, outcome_reason,
          liability_review_required, liability_allocation, liability_reason, opened_at, submitted_at,
          resolved_at, closed_at, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$18,$22)
        ON CONFLICT (provider, provider_case_id) DO UPDATE SET status=EXCLUDED.status,
          outcome_reason=EXCLUDED.outcome_reason, liability_review_required=EXCLUDED.liability_review_required,
          liability_allocation=EXCLUDED.liability_allocation, liability_reason=EXCLUDED.liability_reason,
          submitted_at=EXCLUDED.submitted_at, resolved_at=EXCLUDED.resolved_at, closed_at=EXCLUDED.closed_at,
          updated_at=EXCLUDED.updated_at`, [
        randomUUID(), input.dispute.id, market, order, payment, input.dispute.provider, input.dispute.providerCaseId,
        input.dispute.providerEventId, input.dispute.reasonCode, input.dispute.amount.currency, input.dispute.amount.minor,
        input.dispute.status, input.dispute.evidenceDeadline ? new Date(input.dispute.evidenceDeadline) : null,
        input.dispute.outcomeReason ?? null, input.dispute.liabilityReviewRequired, input.dispute.liabilityAllocation ?? null,
        input.dispute.liabilityReason ?? null, new Date(input.dispute.openedAt), input.dispute.submittedAt ? new Date(input.dispute.submittedAt) : null,
        input.dispute.resolvedAt ? new Date(input.dispute.resolvedAt) : null, input.dispute.closedAt ? new Date(input.dispute.closedAt) : null,
        new Date(input.dispute.closedAt ?? input.dispute.resolvedAt ?? input.dispute.submittedAt ?? input.dispute.openedAt)
      ]);
      const stored = await tx.query<SqlRow>("SELECT id::text AS id FROM payment_disputes WHERE provider=$1 AND provider_case_id=$2", [input.dispute.provider, input.dispute.providerCaseId]);
      const disputeUuid = String(requireSingleRow(stored).id);
      await tx.query(`INSERT INTO payment_dispute_provider_events (dispute_id, provider, provider_event_id, event_type, payload, received_at)
        VALUES ($1,$2,$3,'opened',$4::jsonb,$5) ON CONFLICT (provider, provider_event_id) DO NOTHING`, [
        disputeUuid, input.dispute.provider, input.dispute.providerEventId, JSON.stringify({ reasonCode: input.dispute.reasonCode }), new Date(input.dispute.openedAt)
      ]);
      for (const evidence of input.dispute.evidence) {
        const addedBy = evidence.addedBy ? await this.#resolveOptionalUser(tx, evidence.addedBy) : null;
        await tx.query(`INSERT INTO payment_dispute_evidence (id, public_id, dispute_id, kind, reference, description, added_by, added_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (public_id) DO NOTHING`, [
          randomUUID(), evidence.id, disputeUuid, evidence.kind, evidence.reference, evidence.description ?? null, addedBy, new Date(evidence.addedAt)
        ]);
      }
    });
  }

  async recordDisputeProviderEvent(input: {
    scope: DatabaseScope;
    disputeId: string;
    provider: string;
    providerEventId: string;
    eventType: string;
    payload: Readonly<Record<string, unknown>>;
    receivedAt: number;
  }): Promise<boolean> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const dispute = await resolvePublicUuid(tx, "payment_disputes", input.disputeId);
      const result = await tx.query(`INSERT INTO payment_dispute_provider_events (dispute_id, provider, provider_event_id, event_type, payload, received_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (provider, provider_event_id) DO NOTHING`, [
        dispute, input.provider, input.providerEventId, input.eventType, JSON.stringify(input.payload), new Date(input.receivedAt)
      ]);
      return result.rowCount === 1;
    });
  }

  async #resolveOptionalUser(db: SqlExecutor, publicId: string): Promise<string | null> {
    const result = await db.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [publicId]);
    return result.rowCount === 1 ? String(result.rows[0].id) : null;
  }
}
