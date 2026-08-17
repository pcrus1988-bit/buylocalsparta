import { randomUUID } from "node:crypto";
import { id } from "../common/ids.ts";
import { money, splitGrossTax, type Money } from "../common/money.ts";
import type { Assignment } from "../fairness/types.ts";
import type { FairnessAppeal, FairnessAnomaly } from "../fairness/governance.ts";
import type { CustomerOrder, PaymentRecord } from "../commerce/types.ts";
import type { Conversation, Message, Appointment, CounterofferRequest, PrivateOffer } from "../advice/types.ts";
import type { ProcurementRecord } from "../finance/procurement.ts";
import type { SettlementBatch } from "../finance/settlement.ts";
import type { LedgerTransaction } from "../finance/ledger.ts";
import type { ShipmentRecord } from "../fulfilment/shipping.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

type EntityTable =
  | "users" | "vendor_businesses" | "vendor_locations" | "canonical_variants" | "vendor_offers"
  | "stock_reservations" | "customer_orders" | "order_lines" | "fulfilment_orders" | "payments"
  | "adviser_profiles" | "conversations" | "appointments" | "counteroffer_requests" | "private_offers"
  | "procurements" | "settlement_batches" | "shipments" | "delivery_rules" | "fee_rules" | "payment_disputes";

const ENTITY_TABLES = new Set<EntityTable>([
  "users", "vendor_businesses", "vendor_locations", "canonical_variants", "vendor_offers", "stock_reservations",
  "customer_orders", "order_lines", "fulfilment_orders", "payments", "adviser_profiles", "conversations", "appointments",
  "counteroffer_requests", "private_offers", "procurements", "settlement_batches", "shipments", "delivery_rules", "fee_rules", "payment_disputes"
]);

function qid(name: EntityTable): string {
  if (!ENTITY_TABLES.has(name)) throw new Error(`Unsupported entity table ${name}`);
  return name;
}

async function resolveUuid(db: SqlExecutor, table: EntityTable, publicId: string): Promise<string> {
  const result = await db.query<SqlRow>(`SELECT id::text AS id FROM ${qid(table)} WHERE public_id = $1 OR id::text = $1`, [publicId]);
  const row = requireSingleRow(result, `${table} entity ${publicId} was not found`);
  return String(row.id);
}

async function resolveOptionalUuid(db: SqlExecutor, table: EntityTable, publicId?: string): Promise<string | null> {
  return publicId ? resolveUuid(db, table, publicId) : null;
}

async function resolveMarketUuid(db: SqlExecutor, marketId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code = $1 OR id::text = $1", [marketId]);
  return String(requireSingleRow(result, `Market ${marketId} was not found`).id);
}

function adviceConversationStatus(state: Conversation["state"]): string {
  if (state === "waiting_for_customer") return "waiting_customer";
  if (state === "waiting_for_vendor") return "waiting_vendor";
  return state;
}

function appointmentStatus(status: Appointment["status"]): string {
  return status === "booked" ? "confirmed" : status;
}

function counterofferStatus(status: CounterofferRequest["status"]): string {
  if (status === "waiting_vendor") return "awaiting_vendor";
  if (status === "needs_customer") return "needs_info";
  return status;
}

function procurementStatus(status: ProcurementRecord["status"]): string {
  if (status === "matched") return "matched";
  return status;
}

function dateOnly(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export class PostgresFairnessRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async recordAssignment(input: {
    scope: DatabaseScope;
    marketId: string;
    visitorHash: string;
    postcodeScope: string;
    assignment: Assignment;
    capacityWeights?: Readonly<Record<string, number>>;
    tieBreak?: Readonly<Record<string, unknown>>;
    overridePublicId?: string;
  }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const marketUuid = await resolveMarketUuid(tx, input.marketId);
      const variantUuid = await resolveUuid(tx, "canonical_variants", input.assignment.canonicalVariantId);
      const selectedOfferUuid = await resolveUuid(tx, "vendor_offers", input.assignment.offerId);
      const selectedVendorUuid = await resolveUuid(tx, "vendor_businesses", input.assignment.vendorId);
      const overrideUuid = input.overridePublicId ? await this.#resolveOverride(tx, input.overridePublicId) : null;
      const eligibleVendorUuids: string[] = [];
      for (const vendorId of input.assignment.eligibleVendorIds) eligibleVendorUuids.push(await resolveUuid(tx, "vendor_businesses", vendorId));

      if (!input.assignment.reusedStickyAssignment) {
        for (const [vendorPublicId, deficit] of Object.entries(input.assignment.deficitsAfterSelection)) {
          const vendorUuid = await resolveUuid(tx, "vendor_businesses", vendorPublicId);
          const selectedIncrement = vendorPublicId === input.assignment.vendorId ? 1 : 0;
          const weight = input.capacityWeights?.[vendorPublicId] ?? 1;
          await tx.query(`
            INSERT INTO fairness_rotation_state (market_id, canonical_variant_id, vendor_id, deficit, qualified_exposures, capacity_weight, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (market_id, canonical_variant_id, vendor_id)
            DO UPDATE SET deficit = EXCLUDED.deficit,
                          qualified_exposures = fairness_rotation_state.qualified_exposures + $5,
                          capacity_weight = EXCLUDED.capacity_weight,
                          updated_at = EXCLUDED.updated_at
          `, [marketUuid, variantUuid, vendorUuid, deficit, selectedIncrement, weight, new Date(input.assignment.selectedAt)]);
        }
      }

      await tx.query(`
        INSERT INTO fairness_assignment_events (
          id, public_id, market_id, canonical_variant_id, selected_offer_id, selected_vendor_id,
          visitor_hash, postcode_scope, reason, eligible_vendor_ids, eligibility_snapshot, deficit_snapshot,
          tie_break, override_id, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[],$11::jsonb,$12::jsonb,$13::jsonb,$14,$15)
      `, [
        randomUUID(), id("fae"), marketUuid, variantUuid, selectedOfferUuid, selectedVendorUuid,
        input.visitorHash, input.postcodeScope, input.assignment.reason, eligibleVendorUuids,
        JSON.stringify(input.assignment.eligibilityByOffer), JSON.stringify(input.assignment.deficitsAfterSelection),
        JSON.stringify(input.tieBreak ?? {}), overrideUuid, new Date(input.assignment.selectedAt)
      ]);

      await tx.query(`
        INSERT INTO sticky_assignments (
          id, public_id, market_id, canonical_variant_id, visitor_hash, postcode_scope, offer_id, reason, locked_at, expires_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (market_id, canonical_variant_id, visitor_hash, postcode_scope)
        DO UPDATE SET offer_id = EXCLUDED.offer_id, reason = EXCLUDED.reason, locked_at = EXCLUDED.locked_at,
                      expires_at = EXCLUDED.expires_at, released_at = NULL, release_reason = NULL
      `, [randomUUID(), id("sticky"), marketUuid, variantUuid, input.visitorHash, input.postcodeScope, selectedOfferUuid, input.assignment.reason, new Date(input.assignment.selectedAt), new Date(input.assignment.stickyUntil)]);
    });
  }

  async saveAppeal(input: { scope: DatabaseScope; appeal: FairnessAppeal }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const marketUuid = await resolveMarketUuid(tx, input.appeal.marketId);
      const vendorUuid = await resolveUuid(tx, "vendor_businesses", input.appeal.vendorId);
      const variantUuid = await resolveOptionalUuid(tx, "canonical_variants", input.appeal.canonicalVariantId);
      const submittedBy = await resolveOptionalUuid(tx, "users", input.appeal.submittedBy);
      const resolvedBy = await resolveOptionalUuid(tx, "users", input.appeal.resolvedBy);
      await tx.query(`
        INSERT INTO fairness_appeals (id, public_id, market_id, vendor_id, canonical_variant_id, submitted_by, reason, status, resolution, resolved_by, created_at, updated_at, resolved_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, resolution=EXCLUDED.resolution,
          resolved_by=EXCLUDED.resolved_by, updated_at=EXCLUDED.updated_at, resolved_at=EXCLUDED.resolved_at
      `, [randomUUID(), input.appeal.id, marketUuid, vendorUuid, variantUuid, submittedBy, input.appeal.reason, input.appeal.status,
        input.appeal.resolution ?? null, resolvedBy, new Date(input.appeal.createdAt), new Date(input.appeal.updatedAt), input.appeal.resolvedAt ? new Date(input.appeal.resolvedAt) : null]);
    });
  }

  async saveAnomaly(input: { scope: DatabaseScope; anomaly: FairnessAnomaly }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const marketUuid = await resolveMarketUuid(tx, input.anomaly.marketId);
      const vendorUuid = await resolveUuid(tx, "vendor_businesses", input.anomaly.vendorId);
      const variantUuid = await resolveUuid(tx, "canonical_variants", input.anomaly.canonicalVariantId);
      const ackBy = await resolveOptionalUuid(tx, "users", input.anomaly.acknowledgedBy);
      const resolvedBy = await resolveOptionalUuid(tx, "users", input.anomaly.resolvedBy);
      await tx.query(`
        INSERT INTO fairness_anomalies (id, public_id, market_id, canonical_variant_id, vendor_id, metric, target_share, actual_share, deviation, sample_size, threshold, status, details, detected_at, acknowledged_by, acknowledged_at, resolved_by, resolved_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18)
        ON CONFLICT (public_id) DO UPDATE SET target_share=EXCLUDED.target_share, actual_share=EXCLUDED.actual_share,
          deviation=EXCLUDED.deviation, sample_size=EXCLUDED.sample_size, threshold=EXCLUDED.threshold, status=EXCLUDED.status,
          details=EXCLUDED.details, acknowledged_by=EXCLUDED.acknowledged_by, acknowledged_at=EXCLUDED.acknowledged_at,
          resolved_by=EXCLUDED.resolved_by, resolved_at=EXCLUDED.resolved_at
      `, [randomUUID(), input.anomaly.id, marketUuid, variantUuid, vendorUuid, input.anomaly.metric, input.anomaly.targetShare,
        input.anomaly.actualShare, input.anomaly.deviation, input.anomaly.sampleSize, input.anomaly.threshold, input.anomaly.status,
        JSON.stringify(input.anomaly.details), new Date(input.anomaly.detectedAt), ackBy,
        input.anomaly.acknowledgedAt ? new Date(input.anomaly.acknowledgedAt) : null, resolvedBy,
        input.anomaly.resolvedAt ? new Date(input.anomaly.resolvedAt) : null]);
    });
  }

  async #resolveOverride(tx: SqlExecutor, publicId: string): Promise<string> {
    const result = await tx.query<SqlRow>("SELECT id::text AS id FROM fairness_overrides WHERE public_id = $1 OR id::text = $1", [publicId]);
    return String(requireSingleRow(result, `Fairness override ${publicId} not found`).id);
  }
}

export class PostgresCommerceRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async persistOrder(input: {
    scope: DatabaseScope;
    order: CustomerOrder;
    payment: PaymentRecord;
    orderNumber: string;
    billingAddressSnapshot: Readonly<Record<string, unknown>>;
    shippingAddressSnapshot?: Readonly<Record<string, unknown>>;
    termsVersion: string;
    shippingMinor?: number;
    discountMinor?: number;
  }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const marketUuid = await resolveMarketUuid(tx, input.order.marketId);
      const customerUuid = await resolveOptionalUuid(tx, "users", input.order.customerId);
      const shippingMinor = input.shippingMinor ?? input.order.deliveryCharge?.minor ?? 0;
      const discountMinor = input.discountMinor ?? 0;
      const lineGross = input.order.merchandiseSubtotal?.minor ?? input.order.lines.reduce((sum, line) => sum + line.retailUnitPrice.minor * line.quantity, 0);
      const taxMinor = input.order.lines.reduce((sum, line) => sum + splitGrossTax(money(line.retailUnitPrice.minor * line.quantity, line.retailUnitPrice.currency), line.taxRateBps).tax.minor, 0);
      const orderUuid = randomUUID();
      await tx.query(`
        INSERT INTO customer_orders (id, public_id, order_number, market_id, user_id, visitor_hash, checkout_key, status, currency,
          subtotal_minor, shipping_minor, discount_minor, tax_minor, total_minor, billing_address_snapshot, shipping_address_snapshot,
          fulfilment_preference, partial_fulfilment_allowed, terms_version, confirmed_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,$20,$21,$21)
        ON CONFLICT (checkout_key) DO NOTHING
      `, [orderUuid, input.order.id, input.orderNumber, marketUuid, customerUuid, input.order.visitorKey, input.order.checkoutKey, input.order.status,
        input.order.total.currency, lineGross, shippingMinor, discountMinor, taxMinor, input.order.total.minor,
        JSON.stringify(input.billingAddressSnapshot), JSON.stringify(input.shippingAddressSnapshot ?? null), input.order.fulfilmentMode, false,
        input.termsVersion, input.order.status === "confirmed" ? new Date(input.order.createdAt) : null, new Date(input.order.createdAt)]);

      const storedOrder = await tx.query<SqlRow>("SELECT id::text AS id FROM customer_orders WHERE checkout_key=$1", [input.order.checkoutKey]);
      const storedOrderUuid = String(requireSingleRow(storedOrder).id);

      for (const line of input.order.lines) {
        const variantUuid = await resolveUuid(tx, "canonical_variants", line.canonicalVariantId);
        const offerUuid = await resolveUuid(tx, "vendor_offers", line.assignedOfferId);
        const vendorUuid = await resolveUuid(tx, "vendor_businesses", line.vendorId);
        const locationUuid = await resolveUuid(tx, "vendor_locations", line.locationId);
        const lineTax = splitGrossTax(money(line.retailUnitPrice.minor * line.quantity, line.retailUnitPrice.currency), line.taxRateBps).tax.minor;
        await tx.query(`
          INSERT INTO order_lines (id, public_id, order_id, canonical_variant_id, assigned_offer_id, vendor_id, location_id, quantity,
            product_snapshot, retail_unit_price_minor, tax_rate_bps, tax_minor, supplier_unit_price_minor, supplier_tax_rate_bps,
            shipping_promise_snapshot, attribution_snapshot, status, fulfilled_quantity, refunded_quantity, fulfilled_at, adjustment_refunded_minor, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,$18,$19,$20,$21,$22)
          ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, fulfilled_quantity=EXCLUDED.fulfilled_quantity,
            refunded_quantity=EXCLUDED.refunded_quantity, fulfilled_at=EXCLUDED.fulfilled_at,
            adjustment_refunded_minor=EXCLUDED.adjustment_refunded_minor, attribution_snapshot=EXCLUDED.attribution_snapshot
        `, [randomUUID(), line.id, storedOrderUuid, variantUuid, offerUuid, vendorUuid, locationUuid, line.quantity,
          JSON.stringify({ title: line.titleSnapshot, categoryCode: line.categoryCodeSnapshot, pricingSource: line.pricingSource, sourceReference: line.sourceReference }),
          line.retailUnitPrice.minor, line.taxRateBps, lineTax, line.supplierUnitPrice.minor, line.supplierTaxRateBps,
          JSON.stringify({ postcode: input.order.postcode, mode: input.order.fulfilmentMode }),
          JSON.stringify({ assignedOfferId: line.assignedOfferId, vendorId: line.vendorId, sourceReference: line.sourceReference }), line.status,
          line.fulfilledQuantity, line.refundedQuantity, line.fulfilledAt ? new Date(line.fulfilledAt) : null, line.adjustmentRefundedAmount?.minor ?? 0,
          new Date(input.order.createdAt)]);
        await tx.query(`UPDATE stock_reservations SET order_line_id = (SELECT id FROM order_lines WHERE public_id=$1) WHERE public_id=$2 OR id::text=$2`, [line.id, line.reservationId]);
      }

      for (const fulfilment of input.order.fulfilments) {
        const vendorUuid = await resolveUuid(tx, "vendor_businesses", fulfilment.vendorId);
        const locationUuid = await resolveUuid(tx, "vendor_locations", fulfilment.locationId);
        const deliveryRuleUuid = fulfilment.deliveryRuleId ? await resolveUuid(tx, "delivery_rules", fulfilment.deliveryRuleId) : null;
        await tx.query(`
          INSERT INTO fulfilment_orders (
            id, public_id, fulfilment_number, order_id, vendor_id, location_id, mode, status,
            merchandise_subtotal_minor, delivery_charge_minor, waived_delivery_minor,
            delivery_rule_id, delivery_rule_version, delivery_quote_public_id, delivered_at, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
          ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status,
            merchandise_subtotal_minor=EXCLUDED.merchandise_subtotal_minor,
            delivery_charge_minor=EXCLUDED.delivery_charge_minor,
            waived_delivery_minor=EXCLUDED.waived_delivery_minor,
            delivery_rule_id=EXCLUDED.delivery_rule_id,
            delivery_rule_version=EXCLUDED.delivery_rule_version,
            delivery_quote_public_id=EXCLUDED.delivery_quote_public_id,
            delivered_at=EXCLUDED.delivered_at,
            updated_at=EXCLUDED.updated_at
        `, [randomUUID(), fulfilment.id, `FUL-${fulfilment.id.slice(-12).toUpperCase()}`, storedOrderUuid, vendorUuid, locationUuid,
          input.order.fulfilmentMode, fulfilment.status, fulfilment.merchandiseSubtotal?.minor ?? 0, fulfilment.deliveryCharge?.minor ?? 0,
          fulfilment.waivedDeliveryAmount?.minor ?? 0, deliveryRuleUuid, fulfilment.deliveryRuleVersion ?? null, fulfilment.deliveryQuoteId ?? null,
          fulfilment.deliveredAt ? new Date(fulfilment.deliveredAt) : null, new Date(input.order.createdAt)]);
        const fulfilmentRow = await tx.query<SqlRow>("SELECT id::text AS id FROM fulfilment_orders WHERE public_id=$1", [fulfilment.id]);
        const fulfilmentUuid = String(requireSingleRow(fulfilmentRow).id);
        for (const lineId of fulfilment.lineIds) {
          await tx.query(`INSERT INTO fulfilment_order_lines (fulfilment_order_id, order_line_id)
            SELECT $1, id FROM order_lines WHERE public_id=$2 ON CONFLICT DO NOTHING`, [fulfilmentUuid, lineId]);
        }
      }

      await tx.query(`
        INSERT INTO payments (id, public_id, order_id, provider, provider_payment_id, idempotency_key, status, currency,
          authorised_minor, captured_minor, refunded_minor, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
        ON CONFLICT (idempotency_key) DO UPDATE SET status=EXCLUDED.status, authorised_minor=EXCLUDED.authorised_minor,
          captured_minor=EXCLUDED.captured_minor, refunded_minor=EXCLUDED.refunded_minor, updated_at=EXCLUDED.updated_at
      `, [randomUUID(), input.payment.id, storedOrderUuid, "development", null, input.payment.idempotencyKey, input.payment.status,
        input.payment.authorisedAmount.currency, input.payment.authorisedAmount.minor, input.payment.capturedAmount.minor,
        input.payment.refundedAmount.minor, new Date(input.order.createdAt)]);
    }, { isolation: "serializable" });
  }
}

export class PostgresAdviceRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async saveConversation(input: { scope: DatabaseScope; conversation: Conversation }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.conversation.marketId);
      const customer = await resolveUuid(tx, "users", input.conversation.customerId);
      const variant = await resolveUuid(tx, "canonical_variants", input.conversation.canonicalVariantId);
      const vendor = await resolveUuid(tx, "vendor_businesses", input.conversation.vendorId);
      await tx.query(`INSERT INTO conversations (id, public_id, market_id, customer_user_id, canonical_variant_id, vendor_id, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, updated_at=EXCLUDED.updated_at`,
        [randomUUID(), input.conversation.id, market, customer, variant, vendor, adviceConversationStatus(input.conversation.state), new Date(input.conversation.createdAt), new Date(input.conversation.updatedAt)]);
    });
  }

  async saveMessage(input: { scope: DatabaseScope; message: Message }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const conversation = await resolveUuid(tx, "conversations", input.message.conversationId);
      const sender = await resolveOptionalUuid(tx, "users", input.message.senderId);
      await tx.query(`INSERT INTO messages (id, public_id, conversation_id, sender_user_id, sender_type, body, read_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (public_id) DO UPDATE SET read_at=EXCLUDED.read_at`,
        [randomUUID(), input.message.id, conversation, sender, input.message.senderType, input.message.body, input.message.readAt ? new Date(input.message.readAt) : null, new Date(input.message.createdAt)]);
    });
  }

  async saveAppointment(input: { scope: DatabaseScope; appointment: Appointment }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.appointment.marketId);
      const customer = await resolveUuid(tx, "users", input.appointment.customerId);
      const vendor = await resolveUuid(tx, "vendor_businesses", input.appointment.vendorId);
      const adviser = await resolveUuid(tx, "adviser_profiles", input.appointment.adviserId);
      const variant = await resolveOptionalUuid(tx, "canonical_variants", input.appointment.canonicalVariantId);
      await tx.query(`INSERT INTO appointments (id, public_id, market_id, customer_user_id, vendor_id, adviser_id, canonical_variant_id, channel, status, starts_at, ends_at, external_provider, external_event_id, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, external_provider=EXCLUDED.external_provider, external_event_id=EXCLUDED.external_event_id, updated_at=EXCLUDED.updated_at`,
        [randomUUID(), input.appointment.id, market, customer, vendor, adviser, variant, input.appointment.channel, appointmentStatus(input.appointment.status), new Date(input.appointment.startsAt), new Date(input.appointment.endsAt), input.appointment.externalProviderId ? "external" : null, input.appointment.externalProviderId ?? null, new Date(input.appointment.createdAt)]);
    });
  }

  async saveCounteroffer(input: { scope: DatabaseScope; request: CounterofferRequest }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.request.marketId);
      const customer = await resolveUuid(tx, "users", input.request.customerId);
      const variant = await resolveUuid(tx, "canonical_variants", input.request.canonicalVariantId);
      const vendor = await resolveUuid(tx, "vendor_businesses", input.request.assignedVendorId);
      const offer = await resolveUuid(tx, "vendor_offers", input.request.assignedOfferId);
      await tx.query(`INSERT INTO counteroffer_requests (id, public_id, market_id, customer_user_id, visitor_hash, source_url, source_url_hash, source_metadata, canonical_variant_id, requested_quantity, postcode, priorities, status, assigned_vendor_id, assigned_offer_id, expires_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,encode(digest($6,'sha256'),'hex'),$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$16)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, assigned_vendor_id=EXCLUDED.assigned_vendor_id, assigned_offer_id=EXCLUDED.assigned_offer_id, expires_at=EXCLUDED.expires_at, updated_at=EXCLUDED.updated_at`,
        [randomUUID(), input.request.id, market, customer, input.request.visitorKey, input.request.sourceUrl, JSON.stringify({ need: input.request.need, assignedLocationId: input.request.assignedLocationId }), variant, input.request.quantity, input.request.postcode, JSON.stringify({ need: input.request.need }), counterofferStatus(input.request.status), vendor, offer, new Date(input.request.responseDueAt), new Date(input.request.createdAt)]);
    });
  }

  async savePrivateOffer(input: { scope: DatabaseScope; offer: PrivateOffer }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const request = await resolveUuid(tx, "counteroffer_requests", input.offer.requestId);
      const vendor = await resolveUuid(tx, "vendor_businesses", input.offer.vendorId);
      const variant = await resolveUuid(tx, "canonical_variants", input.offer.canonicalVariantId);
      await tx.query(`INSERT INTO private_offers (id, public_id, counteroffer_request_id, vendor_id, canonical_variant_id, price_minor, currency, inclusions, fulfilment_promise, status, expires_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, expires_at=EXCLUDED.expires_at`,
        [randomUUID(), input.offer.id, request, vendor, variant, input.offer.price.minor, input.offer.price.currency, JSON.stringify(input.offer.inclusions), JSON.stringify({ text: input.offer.fulfilmentPromise }), input.offer.status, new Date(input.offer.expiresAt), new Date(input.offer.createdAt)]);
    });
  }
}

export class PostgresFinanceRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async saveProcurement(input: { scope: DatabaseScope; marketId: string; procurement: ProcurementRecord; fulfilmentId?: string }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.marketId);
      const order = await resolveUuid(tx, "customer_orders", input.procurement.orderId);
      const vendor = await resolveUuid(tx, "vendor_businesses", input.procurement.vendorId);
      const fulfilment = await resolveOptionalUuid(tx, "fulfilment_orders", input.fulfilmentId);
      await tx.query(`INSERT INTO procurements (
          id, public_id, procurement_number, market_id, order_id, fulfilment_order_id, vendor_id, status, currency,
          supplier_net_minor, supplier_tax_minor, shipping_reimbursement_minor, service_fee_minor, service_fee_net_minor,
          service_fee_tax_minor, adjustment_minor, payable_minor, post_settlement_return_receivable_minor, status_before_dispute, dispute_reference, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, supplier_net_minor=EXCLUDED.supplier_net_minor,
          supplier_tax_minor=EXCLUDED.supplier_tax_minor, shipping_reimbursement_minor=EXCLUDED.shipping_reimbursement_minor,
          service_fee_minor=EXCLUDED.service_fee_minor, service_fee_net_minor=EXCLUDED.service_fee_net_minor,
          service_fee_tax_minor=EXCLUDED.service_fee_tax_minor, adjustment_minor=EXCLUDED.adjustment_minor,
          payable_minor=EXCLUDED.payable_minor, post_settlement_return_receivable_minor=EXCLUDED.post_settlement_return_receivable_minor,
          status_before_dispute=EXCLUDED.status_before_dispute, dispute_reference=EXCLUDED.dispute_reference, updated_at=EXCLUDED.updated_at`,
        [randomUUID(), input.procurement.id, `PO-${input.procurement.id.slice(-12).toUpperCase()}`, market, order, fulfilment, vendor,
          procurementStatus(input.procurement.status), input.procurement.gross.currency, input.procurement.net.minor, input.procurement.tax.minor,
          input.procurement.shippingReimbursement?.minor ?? 0, input.procurement.serviceFeeGross?.minor ?? 0,
          input.procurement.serviceFeeNet?.minor ?? 0, input.procurement.serviceFeeTax?.minor ?? 0,
          input.procurement.adjustments.reduce((sum, adjustment) => sum + adjustment.gross.minor, 0), input.procurement.payable?.minor ?? input.procurement.gross.minor,
          input.procurement.postSettlementReturnReceivable?.minor ?? 0, input.procurement.statusBeforeDispute ?? null, input.procurement.disputeReference ?? null,
          new Date(input.procurement.createdAt), new Date(input.procurement.updatedAt)]);
    });
  }

  async saveSettlement(input: { scope: DatabaseScope; batch: SettlementBatch }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.batch.marketId);
      const createdBy = await resolveOptionalUuid(tx, "users", input.batch.createdBy);
      const approvedBy = await resolveOptionalUuid(tx, "users", input.batch.approvedBy);
      const submittedBy = await resolveOptionalUuid(tx, "users", input.batch.submittedBy);
      const paidBy = await resolveOptionalUuid(tx, "users", input.batch.paidBy);
      await tx.query(`INSERT INTO settlement_batches (id, public_id, market_id, batch_number, status, period_start, period_end, created_by, approved_by, created_at, approved_at, submitted_by, submitted_at, paid_by, paid_at, payout_reference, failure_reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, approved_by=EXCLUDED.approved_by, approved_at=EXCLUDED.approved_at,
          submitted_by=EXCLUDED.submitted_by, submitted_at=EXCLUDED.submitted_at, paid_by=EXCLUDED.paid_by, paid_at=EXCLUDED.paid_at,
          payout_reference=EXCLUDED.payout_reference, failure_reason=EXCLUDED.failure_reason`,
        [randomUUID(), input.batch.id, market, input.batch.batchNumber, input.batch.status, dateOnly(input.batch.periodStart), dateOnly(input.batch.periodEnd), createdBy,
          approvedBy, new Date(input.batch.createdAt), input.batch.approvedAt ? new Date(input.batch.approvedAt) : null, submittedBy,
          input.batch.submittedAt ? new Date(input.batch.submittedAt) : null, paidBy, input.batch.paidAt ? new Date(input.batch.paidAt) : null,
          input.batch.payoutReference ?? null, input.batch.failureReason ?? null]);
      const batchUuid = String(requireSingleRow(await tx.query<SqlRow>("SELECT id::text AS id FROM settlement_batches WHERE public_id=$1", [input.batch.id])).id);
      for (const line of input.batch.lines) {
        const vendor = await resolveUuid(tx, "vendor_businesses", line.vendorId);
        const procurement = await resolveUuid(tx, "procurements", line.procurementId);
        await tx.query(`INSERT INTO settlement_lines (id, public_id, batch_id, vendor_id, procurement_id, currency, payable_minor, final_minor, payout_reference, reconciliation_status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)
          ON CONFLICT (public_id) DO UPDATE SET payout_reference=EXCLUDED.payout_reference, reconciliation_status=EXCLUDED.reconciliation_status`,
          [randomUUID(), line.id, batchUuid, vendor, procurement, line.payable.currency, line.payable.minor, line.payoutReference ?? null, line.reconciliationStatus]);
      }
    }, { isolation: "serializable" });
  }

  async saveLedgerTransaction(input: { scope: DatabaseScope; marketId: string; eventType: string; transaction: LedgerTransaction; externalReference?: string }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = await resolveMarketUuid(tx, input.marketId);
      await tx.query(`INSERT INTO ledger_transactions (id, public_id, market_id, reference, event_type, external_reference, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (reference) DO NOTHING`,
        [randomUUID(), input.transaction.id, market, input.transaction.reference, input.eventType, input.externalReference ?? null, new Date(input.transaction.createdAt)]);
      const txUuid = String(requireSingleRow(await tx.query<SqlRow>("SELECT id::text AS id FROM ledger_transactions WHERE reference=$1", [input.transaction.reference])).id);
      for (const entry of input.transaction.entries) {
        await tx.query(`INSERT INTO ledger_entries (id, public_id, transaction_id, account, direction, amount_minor, currency, entity_type, entity_id, metadata, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11) ON CONFLICT (public_id) DO NOTHING`,
          [randomUUID(), entry.id, txUuid, entry.account, entry.direction, entry.amount.minor, entry.amount.currency, entry.entityType ?? null,
            entry.entityId && /^[0-9a-f-]{36}$/i.test(entry.entityId) ? entry.entityId : null,
            JSON.stringify(entry.entityId && !/^[0-9a-f-]{36}$/i.test(entry.entityId) ? { publicEntityId: entry.entityId } : {}), new Date(input.transaction.createdAt)]);
      }
    });
  }
}

export class PostgresShippingRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async saveShipment(input: { scope: DatabaseScope; shipment: ShipmentRecord }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const order = await resolveUuid(tx, "customer_orders", input.shipment.orderId);
      const fulfilment = await resolveUuid(tx, "fulfilment_orders", input.shipment.fulfilmentId);
      const vendor = await resolveUuid(tx, "vendor_businesses", input.shipment.vendorId);
      const location = await resolveUuid(tx, "vendor_locations", input.shipment.locationId);
      await tx.query(`INSERT INTO shipments (id, public_id, order_id, fulfilment_order_id, vendor_id, location_id, from_postcode, to_postcode, package_count, carrier, service, tracking_number, provider_shipment_id, status, quoted_amount_minor, currency, label_object_key, handed_over_at, delivered_at, exception_reason, proof, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23)
        ON CONFLICT (public_id) DO UPDATE SET carrier=EXCLUDED.carrier, service=EXCLUDED.service, tracking_number=EXCLUDED.tracking_number,
          provider_shipment_id=EXCLUDED.provider_shipment_id, status=EXCLUDED.status, label_object_key=EXCLUDED.label_object_key,
          handed_over_at=EXCLUDED.handed_over_at, delivered_at=EXCLUDED.delivered_at, exception_reason=EXCLUDED.exception_reason,
          proof=EXCLUDED.proof, updated_at=EXCLUDED.updated_at`,
        [randomUUID(), input.shipment.id, order, fulfilment, vendor, location, input.shipment.fromPostcode, input.shipment.toPostcode, input.shipment.packageCount,
          input.shipment.carrier ?? null, input.shipment.service ?? null, input.shipment.trackingNumber ?? null, input.shipment.providerShipmentId ?? null,
          input.shipment.status, input.shipment.quotedAmount?.minor ?? null, input.shipment.quotedAmount?.currency ?? "EUR", input.shipment.labelObjectKey ?? null,
          input.shipment.handedOverAt ? new Date(input.shipment.handedOverAt) : null, input.shipment.deliveredAt ? new Date(input.shipment.deliveredAt) : null,
          input.shipment.exceptionReason ?? null, JSON.stringify(input.shipment.proof ?? {}), new Date(input.shipment.createdAt), new Date(input.shipment.updatedAt)]);
    });
  }

  async recordProviderEvent(input: { scope: DatabaseScope; shipmentId: string; provider: string; providerEventId: string; eventType: string; payload: Readonly<Record<string, unknown>>; receivedAt: number; processedAt?: number }): Promise<boolean> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const shipment = await resolveUuid(tx, "shipments", input.shipmentId);
      const result = await tx.query(`INSERT INTO shipment_provider_events (shipment_id, provider, provider_event_id, event_type, payload, received_at, processed_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT (provider, provider_event_id) DO NOTHING`,
        [shipment, input.provider, input.providerEventId, input.eventType, JSON.stringify(input.payload), new Date(input.receivedAt), input.processedAt ? new Date(input.processedAt) : null]);
      return result.rowCount === 1;
    });
  }
}
