import { id } from "../common/ids.ts";
import { money, multiplyMoney, splitGrossTax, type Money } from "../common/money.ts";
import { CommerceService } from "../commerce/order-service.ts";
import { ProcurementService } from "../finance/procurement.ts";
import { Ledger } from "../finance/ledger.ts";
import { InventoryEngine } from "../inventory/engine.ts";
import { offerStockIsFresh } from "../inventory/freshness.ts";
import type {
  RecallAffectedCase,
  RepairRemedy,
  ReplacementRemedy,
  ReturnCase,
  ReturnCostPayer,
  ReturnCustodyParty,
  ReturnDestinationType,
  ReturnDisposition,
  ReturnEligibility,
  ReturnEvidence,
  ReturnRemedy,
  ReturnReason,
  ReturnSource
} from "./types.ts";

const DAY = 24 * 60 * 60 * 1000;

export type ReturnPolicy = Readonly<{
  withdrawalWindowMs: number;
  guaranteeWindowMs: number;
  authorizationTtlMs: number;
  repairOperationalSlaMs: number;
}>;

const DEFAULT_POLICY: ReturnPolicy = {
  withdrawalWindowMs: 14 * DAY,
  guaranteeWindowMs: 730 * DAY,
  authorizationTtlMs: 14 * DAY,
  repairOperationalSlaMs: 30 * DAY
};

export class ReturnService {
  readonly #commerce: CommerceService;
  readonly #inventory: InventoryEngine;
  readonly #procurement: ProcurementService;
  readonly #ledger: Ledger;
  readonly #policy: ReturnPolicy;
  readonly #cases = new Map<string, ReturnCase>();

  constructor(input: { commerce: CommerceService; inventory: InventoryEngine; procurement: ProcurementService; ledger: Ledger; policy?: Partial<ReturnPolicy> }) {
    this.#commerce = input.commerce;
    this.#inventory = input.inventory;
    this.#procurement = input.procurement;
    this.#ledger = input.ledger;
    this.#policy = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };
  }

  policy(): ReturnPolicy {
    return { ...this.#policy };
  }

  evaluate(input: { orderId: string; orderLineId: string; reason: ReturnReason; now: number; source?: ReturnSource }): ReturnEligibility {
    const order = this.#commerce.getOrder(input.orderId);
    const line = order.lines.find((entry) => entry.id === input.orderLineId);
    if (!line) throw new Error("Order line not found");
    if (line.fulfilledQuantity <= 0) return { state: "ineligible", basis: "manual_review", reason: "The order line has not been fulfilled" };

    const deliveredAt = line.fulfilledAt
      ?? order.fulfilments.find((fulfilment) => fulfilment.lineIds.includes(line.id) && fulfilment.deliveredAt !== undefined)?.deliveredAt
      ?? order.createdAt;

    if (input.source === "safety_recall" || input.reason === "safety_recall") {
      return { state: "eligible", basis: "safety_recall", reason: "Product is subject to a platform safety-recall workflow" };
    }

    if (input.reason === "withdrawal") {
      const expiresAt = deliveredAt + this.#policy.withdrawalWindowMs;
      return input.now <= expiresAt
        ? { state: "eligible", basis: "withdrawal_window", reason: "Request falls inside the configured withdrawal window", expiresAt }
        : { state: "manual_review", basis: "withdrawal_window", reason: "Configured withdrawal window has elapsed; platform review is required before any conclusion", expiresAt };
    }

    if (["defect", "nonconformity", "missing_part"].includes(input.reason)) {
      const expiresAt = deliveredAt + this.#policy.guaranteeWindowMs;
      return input.now <= expiresAt
        ? { state: "eligible", basis: "consumer_guarantee", reason: "Request falls inside the configured consumer-guarantee workflow window", expiresAt }
        : { state: "manual_review", basis: "consumer_guarantee", reason: "Configured guarantee workflow window has elapsed; platform review is required", expiresAt };
    }

    if (["transit_damage", "wrong_item"].includes(input.reason)) {
      return { state: "eligible", basis: "delivery_error", reason: "Delivery-error claims enter platform review without an automatic customer rejection" };
    }

    return { state: "manual_review", basis: "manual_review", reason: "Reason requires a platform support decision" };
  }

  request(input: {
    customerId: string;
    orderId: string;
    orderLineId: string;
    quantity: number;
    reason: ReturnReason;
    requestedRemedy?: ReturnRemedy;
    notes?: string;
    source?: ReturnSource;
    recallNoticeId?: string;
    now: number;
  }): ReturnCase {
    const order = this.#commerce.getOrder(input.orderId);
    if (order.customerId && order.customerId !== input.customerId) throw new Error("Return order ownership violation");
    const line = order.lines.find((entry) => entry.id === input.orderLineId);
    if (!line) throw new Error("Order line not found");
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Return quantity must be positive");
    const remainingDelivered = line.fulfilledQuantity - line.refundedQuantity;
    const activeRequested = [...this.#cases.values()]
      .filter((item) => item.orderLineId === line.id && !new Set(["refunded", "replaced", "closed", "rejected"]).has(item.status))
      .reduce((sum, item) => sum + item.quantity, 0);
    if (input.quantity > remainingDelivered - activeRequested) throw new Error("Return quantity exceeds delivered quantity not already in another active return");
    if (input.source === "safety_recall" && !input.recallNoticeId) throw new Error("Safety-recall return requires a recall notice reference");

    const eligibility = this.evaluate({ orderId: order.id, orderLineId: line.id, reason: input.reason, now: input.now, source: input.source });
    if (eligibility.state === "ineligible") throw new Error(eligibility.reason);

    const item: ReturnCase = {
      id: id("ret"),
      orderId: input.orderId,
      orderLineId: input.orderLineId,
      customerId: input.customerId,
      vendorId: line.vendorId,
      canonicalVariantId: line.canonicalVariantId,
      quantity: input.quantity,
      reason: input.reason,
      source: input.source ?? "customer",
      recallNoticeId: input.recallNoticeId,
      notes: input.notes?.trim() || undefined,
      requestedRemedy: input.requestedRemedy ?? defaultRemedy(input.reason),
      eligibility,
      status: "requested",
      requestedAt: input.now,
      evidence: [],
      custody: [],
      audit: [{ at: input.now, actorId: input.customerId, action: "return_requested", note: eligibility.reason }]
    };
    this.#cases.set(item.id, item);
    return structuredClone(item);
  }

  addEvidence(input: { returnId: string; actorId: string; kind: ReturnEvidence["kind"]; reference?: string; note?: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (!input.reference?.trim() && !input.note?.trim()) throw new Error("Return evidence requires a reference or note");
    const evidence: ReturnEvidence = {
      id: id("retevd"),
      kind: input.kind,
      reference: input.reference?.trim() || undefined,
      note: input.note?.trim() || undefined,
      submittedBy: input.actorId,
      createdAt: input.now
    };
    item.evidence.push(evidence);
    item.audit.push({ at: input.now, actorId: input.actorId, action: "return_evidence_added", note: input.kind });
    return structuredClone(item);
  }

  approve(input: { returnId: string; actorId: string; inspectionRequired?: boolean; note?: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (item.status !== "requested") throw new Error(`Cannot approve return in ${item.status}`);
    item.status = input.inspectionRequired ? "inspection_required" : "approved";
    item.approvedAt = input.now;
    item.audit.push({ at: input.now, actorId: input.actorId, action: item.status, note: input.note });
    return structuredClone(item);
  }

  issueAuthorization(input: {
    returnId: string;
    actorId: string;
    destinationType: ReturnDestinationType;
    destinationVendorId?: string;
    instructions: string;
    returnCostPayer: ReturnCostPayer;
    returnByAt?: number;
    carrier?: string;
    trackingNumber?: string;
    now: number;
  }): ReturnCase {
    const item = this.#required(input.returnId);
    if (!["approved", "inspection_required"].includes(item.status)) throw new Error(`Cannot issue return authorization in ${item.status}`);
    if (!input.instructions.trim()) throw new Error("Return instructions are required");
    if (input.destinationType === "vendor" && !input.destinationVendorId) throw new Error("Vendor return destination requires vendorId");
    if (input.destinationVendorId && input.destinationVendorId !== item.vendorId) throw new Error("Return destination vendor must match the assigned fulfilment vendor");
    const returnByAt = input.returnByAt ?? input.now + this.#policy.authorizationTtlMs;
    if (returnByAt <= input.now) throw new Error("Return authorization expiry must be in the future");
    item.authorization = {
      rmaCode: `RMA-${item.id.replace(/[^a-zA-Z0-9]/g, "").slice(-10).toUpperCase()}`,
      destinationType: input.destinationType,
      destinationVendorId: input.destinationVendorId,
      instructions: input.instructions.trim(),
      returnCostPayer: input.returnCostPayer,
      returnByAt,
      carrier: input.carrier?.trim() || undefined,
      trackingNumber: input.trackingNumber?.trim() || undefined,
      issuedAt: input.now,
      issuedBy: input.actorId
    };
    item.audit.push({ at: input.now, actorId: input.actorId, action: "return_authorization_issued", note: item.authorization.rmaCode });
    return structuredClone(item);
  }

  markInTransit(input: { returnId: string; actorId: string; carrier?: string; trackingNumber?: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (!["approved", "inspection_required"].includes(item.status)) throw new Error(`Cannot dispatch return in ${item.status}`);
    if (!item.authorization) throw new Error("Return authorization is required before dispatch");
    item.status = "in_transit";
    item.authorization = { ...item.authorization, carrier: input.carrier?.trim() || item.authorization.carrier, trackingNumber: input.trackingNumber?.trim() || item.authorization.trackingNumber };
    this.#custody(item, "customer", "carrier", input.actorId, input.now, item.authorization.trackingNumber, "Customer dispatched authorized return");
    item.audit.push({ at: input.now, actorId: input.actorId, action: "return_in_transit", note: item.authorization.trackingNumber });
    return structuredClone(item);
  }

  markReceived(input: { returnId: string; actorId: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (!["approved", "inspection_required", "in_transit"].includes(item.status)) throw new Error(`Cannot receive return in ${item.status}`);
    const from: ReturnCustodyParty = item.status === "in_transit" ? "carrier" : "customer";
    const to: ReturnCustodyParty = item.authorization?.destinationType === "platform_inspection" ? "platform" : item.authorization?.destinationType === "repairer" ? "repairer" : "vendor";
    item.status = "received";
    item.receivedAt = input.now;
    this.#custody(item, from, to, input.actorId, input.now, item.authorization?.trackingNumber, "Returned goods received");
    item.audit.push({ at: input.now, actorId: input.actorId, action: "return_received" });
    return structuredClone(item);
  }

  inspect(input: { returnId: string; actorId: string; disposition: ReturnDisposition; findings?: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (item.status !== "received") throw new Error(`Cannot inspect return in ${item.status}`);
    const order = this.#commerce.getOrder(item.orderId);
    const line = order.lines.find((entry) => entry.id === item.orderLineId);
    if (!line) throw new Error("Order line not found");

    item.status = "inspected";
    item.inspectedAt = input.now;
    item.disposition = input.disposition;
    item.inspectionFindings = input.findings?.trim() || undefined;
    item.audit.push({ at: input.now, actorId: input.actorId, action: `inspected_${input.disposition}`, note: item.inspectionFindings });

    this.#inventory.receiveReturn({
      offerId: line.assignedOfferId,
      quantity: item.quantity,
      disposition: input.disposition,
      now: input.now,
      source: `return:${item.id}`,
      actorId: input.actorId
    });
    return structuredClone(item);
  }

  approveRemedy(input: { returnId: string; actorId: string; remedy?: ReturnRemedy; priceReduction?: Money; repairSlaMs?: number; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (item.status !== "inspected") throw new Error(`Cannot approve remedy in ${item.status}`);
    const remedy = input.remedy ?? item.requestedRemedy;
    item.approvedRemedy = remedy;
    item.status = "remedy_approved";

    if (remedy === "replacement") item.replacement = this.#createReplacement(item, input.now);
    if (remedy === "repair") {
      if (item.disposition !== "blocked") throw new Error("Repair workflow requires the returned unit to be blocked from sellable inventory");
      item.repair = this.#createRepair(item, input.now, input.repairSlaMs ?? this.#policy.repairOperationalSlaMs);
    }
    if (remedy === "price_reduction") {
      if (!input.priceReduction || input.priceReduction.minor <= 0) throw new Error("Price reduction requires a positive amount");
      const order = this.#commerce.getOrder(item.orderId);
      const line = order.lines.find((entry) => entry.id === item.orderLineId)!;
      if (input.priceReduction.currency !== line.retailUnitPrice.currency) throw new Error("Price reduction currency mismatch");
      item.priceReduction = { ...input.priceReduction };
    }

    item.audit.push({ at: input.now, actorId: input.actorId, action: `remedy_approved_${remedy}` });
    return structuredClone(item);
  }

  executeRefund(input: { returnId: string; actorId: string; note?: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (item.status !== "remedy_approved" || item.approvedRemedy !== "refund") throw new Error("Refund remedy has not been approved");
    const order = this.#commerce.getOrder(item.orderId);
    const line = order.lines.find((entry) => entry.id === item.orderLineId);
    if (!line) throw new Error("Order line not found");

    this.#procurement.reverseForCustomerReturn({ orderLineId: line.id, quantity: item.quantity, reason: `return:${item.reason}`, now: input.now });
    const updatedOrder = this.#commerce.refundLine({ orderId: item.orderId, lineId: item.orderLineId, quantity: item.quantity, idempotencyKey: `return-refund:${item.id}`, now: input.now });
    const updatedLine = updatedOrder.lines.find((entry) => entry.id === line.id)!;
    const gross = multiplyMoney(updatedLine.retailUnitPrice, item.quantity);
    const split = splitGrossTax(gross, updatedLine.taxRateBps);
    this.#ledger.post({
      reference: `customer-refund:${item.id}`,
      createdAt: input.now,
      entries: [
        { account: "sales_returns", direction: "debit", amount: split.net, entityType: "order_line", entityId: line.id },
        { account: "output_vat", direction: "debit", amount: split.tax, entityType: "order_line", entityId: line.id },
        { account: "psp_payable", direction: "credit", amount: gross, entityType: "order", entityId: order.id }
      ]
    });
    item.status = "refunded";
    item.refundedAt = input.now;
    item.closedAt = input.now;
    item.audit.push({ at: input.now, actorId: input.actorId, action: "refund_completed", note: input.note });
    return structuredClone(item);
  }

  executePriceReduction(input: { returnId: string; actorId: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (item.status !== "remedy_approved" || item.approvedRemedy !== "price_reduction" || !item.priceReduction) throw new Error("Price-reduction remedy has not been approved");
    const order = this.#commerce.getOrder(item.orderId);
    const line = order.lines.find((entry) => entry.id === item.orderLineId)!;
    this.#commerce.refundLineAmount({ orderId: item.orderId, lineId: item.orderLineId, amount: item.priceReduction, idempotencyKey: `return-price-reduction:${item.id}`, now: input.now });
    const split = splitGrossTax(item.priceReduction, line.taxRateBps);
    this.#ledger.post({
      reference: `customer-price-reduction:${item.id}`,
      createdAt: input.now,
      entries: [
        { account: "sales_returns", direction: "debit", amount: split.net, entityType: "order_line", entityId: line.id },
        { account: "output_vat", direction: "debit", amount: split.tax, entityType: "order_line", entityId: line.id },
        { account: "psp_payable", direction: "credit", amount: item.priceReduction, entityType: "order", entityId: order.id }
      ]
    });
    item.status = "closed";
    item.closedAt = input.now;
    item.audit.push({ at: input.now, actorId: input.actorId, action: "price_reduction_completed", note: `${item.priceReduction.minor}` });
    return structuredClone(item);
  }

  replacementAction(input: { returnId: string; vendorId: string; actorId: string; action: "accept" | "ready" | "ship" | "deliver" | "reject"; reference?: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    const replacement = item.replacement;
    if (!replacement || item.approvedRemedy !== "replacement") throw new Error("Replacement remedy is not active");
    if (replacement.vendorId !== input.vendorId) throw new Error("Only the assigned replacement vendor may update this replacement");

    if (input.action === "accept") {
      if (replacement.status !== "awaiting_vendor") throw new Error(`Cannot accept replacement in ${replacement.status}`);
      this.#inventory.consume(replacement.reservationId, input.now);
      replacement.status = "accepted";
      replacement.acceptedAt = input.now;
    } else if (input.action === "ready") {
      if (replacement.fulfilmentMode !== "pickup") throw new Error("Ready-for-handover is only valid for pickup replacement");
      if (replacement.status !== "accepted") throw new Error(`Cannot mark replacement ready in ${replacement.status}`);
      replacement.status = "ready_for_handover";
    } else if (input.action === "ship") {
      if (replacement.fulfilmentMode !== "shipping") throw new Error("Ship action is only valid for shipping replacement");
      if (replacement.status !== "accepted") throw new Error(`Cannot ship replacement in ${replacement.status}`);
      replacement.status = "shipped";
      replacement.reference = input.reference?.trim() || replacement.reference;
    } else if (input.action === "deliver") {
      if (!["accepted", "ready_for_handover", "shipped"].includes(replacement.status)) throw new Error(`Cannot deliver replacement in ${replacement.status}`);
      replacement.status = "delivered";
      replacement.deliveredAt = input.now;
      replacement.reference = input.reference?.trim() || replacement.reference;
      item.status = "replaced";
      item.closedAt = input.now;
    } else {
      if (replacement.status !== "awaiting_vendor") throw new Error(`Cannot reject replacement in ${replacement.status}`);
      this.#inventory.release(replacement.reservationId, input.now, "replacement_rejected");
      replacement.status = "rejected";
      item.status = "inspected";
      item.approvedRemedy = undefined;
    }
    item.audit.push({ at: input.now, actorId: input.actorId, action: `replacement_${input.action}`, note: input.reference });
    return structuredClone(item);
  }

  repairAction(input: { returnId: string; vendorId: string; actorId: string; action: "start" | "await_part" | "ready" | "return_to_customer" | "fail"; findings?: string; reference?: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    const repair = item.repair;
    if (!repair || item.approvedRemedy !== "repair") throw new Error("Repair remedy is not active");
    if (repair.vendorId !== input.vendorId) throw new Error("Only the assigned repair vendor may update this repair");

    if (input.action === "start") {
      if (repair.status !== "approved") throw new Error(`Cannot start repair in ${repair.status}`);
      repair.status = "in_repair";
      repair.startedAt = input.now;
      repair.repairerReference = input.reference?.trim() || repair.repairerReference;
      this.#custody(item, "vendor", "repairer", input.actorId, input.now, repair.repairerReference, "Repair started");
    } else if (input.action === "await_part") {
      if (repair.status !== "in_repair") throw new Error(`Cannot await part in ${repair.status}`);
      repair.status = "awaiting_part";
    } else if (input.action === "ready") {
      if (!["in_repair", "awaiting_part"].includes(repair.status)) throw new Error(`Cannot complete repair in ${repair.status}`);
      repair.status = "ready_for_customer";
      repair.readyAt = input.now;
      repair.findings = input.findings?.trim() || repair.findings;
      this.#custody(item, "repairer", "vendor", input.actorId, input.now, repair.repairerReference, "Repaired item returned to fulfilment vendor");
    } else if (input.action === "return_to_customer") {
      if (repair.status !== "ready_for_customer") throw new Error(`Cannot return repaired item in ${repair.status}`);
      const order = this.#commerce.getOrder(item.orderId);
      const line = order.lines.find((entry) => entry.id === item.orderLineId)!;
      this.#inventory.returnBlockedItemToCustomer({ offerId: line.assignedOfferId, quantity: item.quantity, now: input.now, source: `repair:${item.id}`, actorId: input.actorId });
      repair.status = "returned";
      repair.returnedAt = input.now;
      item.status = "closed";
      item.closedAt = input.now;
      this.#custody(item, "vendor", "customer", input.actorId, input.now, input.reference, "Repaired item returned to customer");
    } else {
      if (!["approved", "in_repair", "awaiting_part"].includes(repair.status)) throw new Error(`Cannot fail repair in ${repair.status}`);
      repair.status = "failed";
      repair.findings = input.findings?.trim() || repair.findings;
      item.status = "inspected";
      item.approvedRemedy = undefined;
    }
    item.audit.push({ at: input.now, actorId: input.actorId, action: `repair_${input.action}`, note: input.findings ?? input.reference });
    return structuredClone(item);
  }

  reject(input: { returnId: string; actorId: string; reason: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (!input.reason.trim()) throw new Error("Rejecting a return requires a reason");
    if (!new Set(["requested", "inspected"]).has(item.status)) throw new Error(`Cannot reject return in ${item.status}`);
    item.status = "rejected";
    item.closedAt = input.now;
    item.audit.push({ at: input.now, actorId: input.actorId, action: "return_rejected", note: input.reason.trim() });
    return structuredClone(item);
  }

  inspectAndRefund(input: { returnId: string; actorId: string; disposition: ReturnDisposition; note?: string; now: number }): ReturnCase {
    const item = this.#required(input.returnId);
    if (item.status === "received") this.inspect({ returnId: item.id, actorId: input.actorId, disposition: input.disposition, findings: input.note, now: input.now });
    const inspected = this.#required(input.returnId);
    if (inspected.status === "inspected") this.approveRemedy({ returnId: item.id, actorId: input.actorId, remedy: "refund", now: input.now });
    return this.executeRefund({ returnId: item.id, actorId: input.actorId, note: input.note, now: input.now });
  }

  get(idValue: string): ReturnCase | undefined {
    const item = this.#cases.get(idValue);
    return item ? structuredClone(item) : undefined;
  }

  listForOrder(orderId: string): readonly ReturnCase[] {
    return [...this.#cases.values()].filter((item) => item.orderId === orderId).map((item) => structuredClone(item));
  }

  listForCustomer(customerId: string): readonly ReturnCase[] {
    return [...this.#cases.values()].filter((item) => item.customerId === customerId).map((item) => structuredClone(item));
  }

  listForVendor(vendorId: string): readonly ReturnCase[] {
    return [...this.#cases.values()].filter((item) => item.vendorId === vendorId).map((item) => structuredClone(item));
  }

  all(): readonly ReturnCase[] {
    return [...this.#cases.values()].map((item) => structuredClone(item));
  }

  #createReplacement(item: ReturnCase, now: number): ReplacementRemedy {
    const order = this.#commerce.getOrder(item.orderId);
    const line = order.lines.find((entry) => entry.id === item.orderLineId)!;
    const offers = this.#commerce.offersForVariant(line.canonicalVariantId).map((offer) => ({
      ...offer,
      availableToSell: this.#inventory.hasOffer(offer.offerId) ? this.#inventory.availableToSell(offer.offerId) : 0,
      stockFresh: offerStockIsFresh(offer, now)
    }));
    const eligible = offers.filter((offer) => this.#commerce.fairness.evaluateEligibility(offer).eligible && offer.availableToSell >= item.quantity);
    eligible.sort((a, b) => Number(b.offerId === line.assignedOfferId) - Number(a.offerId === line.assignedOfferId) || b.fulfilmentFit - a.fulfilmentFit || b.stockConfirmedAt - a.stockConfirmedAt || a.vendorId.localeCompare(b.vendorId));
    const selected = eligible[0];
    if (!selected) throw new Error("No eligible supplier stock is available for replacement");
    const reservation = this.#inventory.reserve({ offerId: selected.offerId, quantity: item.quantity, checkoutKey: `return-replacement:${item.id}`, now, ttlMs: 24 * 60 * 60 * 1000 });
    return {
      id: id("replacement"),
      returnId: item.id,
      vendorId: selected.vendorId,
      locationId: selected.locationId,
      offerId: selected.offerId,
      reservationId: reservation.id,
      quantity: item.quantity,
      fulfilmentMode: selected.fulfilmentMode,
      status: "awaiting_vendor",
      createdAt: now
    };
  }

  #createRepair(item: ReturnCase, now: number, slaMs: number): RepairRemedy {
    if (!Number.isSafeInteger(slaMs) || slaMs <= 0) throw new Error("Repair SLA must be positive");
    return { id: id("repair"), returnId: item.id, vendorId: item.vendorId, status: "approved", dueAt: now + slaMs, createdAt: now };
  }

  #custody(item: ReturnCase, from: ReturnCustodyParty, to: ReturnCustodyParty, actorId: string, occurredAt: number, reference?: string, note?: string): void {
    item.custody.push({ id: id("custody"), from, to, actorId, reference, note, occurredAt });
  }

  #required(idValue: string): ReturnCase {
    const item = this.#cases.get(idValue);
    if (!item) throw new Error("Return case not found");
    return item;
  }
}

export class RecallOperationsService {
  readonly #commerce: CommerceService;
  readonly #returns: ReturnService;
  readonly #cases = new Map<string, RecallAffectedCase>();
  readonly #noticeLineIndex = new Map<string, string>();

  constructor(input: { commerce: CommerceService; returns: ReturnService }) {
    this.#commerce = input.commerce;
    this.#returns = input.returns;
  }

  activate(input: { noticeId: string; canonicalVariantId: string; now: number }): readonly RecallAffectedCase[] {
    const created: RecallAffectedCase[] = [];
    for (const order of this.#commerce.orders()) {
      for (const line of order.lines) {
        if (line.canonicalVariantId !== input.canonicalVariantId) continue;
        const affectedQuantity = Math.max(0, line.fulfilledQuantity - line.refundedQuantity);
        if (affectedQuantity <= 0) continue;
        const key = `${input.noticeId}:${line.id}`;
        const existing = this.#noticeLineIndex.get(key);
        if (existing) { created.push(structuredClone(this.#cases.get(existing)!)); continue; }
        const item: RecallAffectedCase = {
          id: id("recallcase"),
          noticeId: input.noticeId,
          canonicalVariantId: line.canonicalVariantId,
          orderId: order.id,
          orderLineId: line.id,
          customerId: order.customerId,
          vendorId: line.vendorId,
          affectedQuantity,
          status: "identified",
          identifiedAt: input.now
        };
        this.#cases.set(item.id, item);
        this.#noticeLineIndex.set(key, item.id);
        created.push(structuredClone(item));
      }
    }
    return created;
  }

  markNotified(input: { recallCaseId: string; now: number }): RecallAffectedCase {
    const item = this.#required(input.recallCaseId);
    if (item.status === "identified") item.status = "notified";
    item.notifiedAt ??= input.now;
    return structuredClone(item);
  }

  acknowledge(input: { recallCaseId: string; customerId: string; now: number }): RecallAffectedCase {
    const item = this.#required(input.recallCaseId);
    if (!item.customerId || item.customerId !== input.customerId) throw new Error("Recall case ownership violation");
    if (item.status === "resolved") throw new Error("Recall case is already resolved");
    item.status = item.returnId ? "remedy_requested" : "acknowledged";
    item.acknowledgedAt ??= input.now;
    return structuredClone(item);
  }

  requestRemedy(input: { recallCaseId: string; customerId: string; remedy: ReturnRemedy; now: number }): { recall: RecallAffectedCase; returnCase: ReturnCase } {
    const item = this.#required(input.recallCaseId);
    if (!item.customerId || item.customerId !== input.customerId) throw new Error("Recall case ownership violation");
    if (item.status === "resolved") throw new Error("Recall case is already resolved");
    if (item.returnId) {
      const existing = this.#returns.get(item.returnId);
      if (!existing) throw new Error("Recall return reference is invalid");
      return { recall: structuredClone(item), returnCase: existing };
    }
    const returnCase = this.#returns.request({
      customerId: input.customerId,
      orderId: item.orderId,
      orderLineId: item.orderLineId,
      quantity: item.affectedQuantity,
      reason: "safety_recall",
      requestedRemedy: input.remedy,
      source: "safety_recall",
      recallNoticeId: item.noticeId,
      now: input.now
    });
    item.selectedRemedy = input.remedy;
    item.returnId = returnCase.id;
    item.status = "remedy_requested";
    item.acknowledgedAt ??= input.now;
    return { recall: structuredClone(item), returnCase };
  }

  resolveForReturn(returnId: string, now: number): readonly RecallAffectedCase[] {
    const resolved: RecallAffectedCase[] = [];
    const returnCase = this.#returns.get(returnId);
    if (!returnCase || !new Set(["refunded", "replaced", "closed"]).has(returnCase.status)) return resolved;
    for (const item of this.#cases.values()) {
      if (item.returnId !== returnId || item.status === "resolved") continue;
      item.status = "resolved";
      item.resolvedAt = now;
      resolved.push(structuredClone(item));
    }
    return resolved;
  }

  forCustomer(customerId: string): readonly RecallAffectedCase[] {
    return [...this.#cases.values()].filter((item) => item.customerId === customerId).map((item) => structuredClone(item));
  }

  forNotice(noticeId: string): readonly RecallAffectedCase[] {
    return [...this.#cases.values()].filter((item) => item.noticeId === noticeId).map((item) => structuredClone(item));
  }

  all(): readonly RecallAffectedCase[] {
    return [...this.#cases.values()].map((item) => structuredClone(item));
  }

  #required(idValue: string): RecallAffectedCase {
    const item = this.#cases.get(idValue);
    if (!item) throw new Error("Recall affected-customer case not found");
    return item;
  }
}

function defaultRemedy(reason: ReturnReason): ReturnRemedy {
  if (reason === "defect" || reason === "nonconformity" || reason === "missing_part") return "replacement";
  return "refund";
}
