import { id } from "../common/ids.ts";
import { money, type Money } from "../common/money.ts";
import type { CustomerOrder, FulfilmentOrder } from "../commerce/types.ts";
import { CommerceService } from "../commerce/order-service.ts";

export type OrderTimelineEvent = Readonly<{
  id: string;
  orderId: string;
  fulfilmentId?: string;
  lineId?: string;
  type: string;
  actorType: "customer" | "vendor" | "platform" | "provider" | "system";
  actorId?: string;
  customerVisible: boolean;
  message: string;
  metadata?: Readonly<Record<string, unknown>>;
  createdAt: number;
}>;

export type OrderCancellation = Readonly<{
  id: string;
  orderId: string;
  customerId: string;
  reason: string;
  status: "completed";
  paymentOutcome: "authorisation_cancelled" | "refunded" | "already_closed";
  createdAt: number;
  completedAt: number;
}>;

export type SubstitutionRequest = Readonly<{
  id: string;
  orderId: string;
  lineId: string;
  customerId: string;
  vendorId: string;
  originalCanonicalVariantId: string;
  proposedCanonicalVariantId: string;
  proposedOfferId: string;
  proposedReservationId: string;
  originalRetailUnitPrice: Money;
  proposedRetailUnitPrice: Money;
  proposedTitle: string;
  reason: string;
  status: "pending_customer" | "approved" | "rejected" | "expired";
  createdAt: number;
  expiresAt: number;
  decidedAt?: number;
  decisionReason?: string;
}>;

export type FulfilmentSlaStage = "acceptance" | "preparation";
export type FulfilmentSlaState = "open" | "breached" | "escalated" | "resolved";

export type FulfilmentSlaPolicy = Readonly<{
  mode: CustomerOrder["fulfilmentMode"];
  acceptanceMs: number;
  preparationMs: number;
  escalationGraceMs: number;
}>;

export type FulfilmentSlaCase = Readonly<{
  id: string;
  orderId: string;
  fulfilmentId: string;
  vendorId: string;
  stage: FulfilmentSlaStage;
  state: FulfilmentSlaState;
  openedAt: number;
  dueAt: number;
  escalationAt: number;
  breachedAt?: number;
  escalatedAt?: number;
  resolvedAt?: number;
  resolution?: string;
}>;

export type OrderTrackingProjection = Readonly<{
  orderId: string;
  orderStatus: CustomerOrder["status"];
  createdAt: number;
  total: Money;
  fulfilmentMode: CustomerOrder["fulfilmentMode"];
  cancelledAt?: number;
  cancellationReason?: string;
  progressPercent: number;
  requiresCustomerAction: boolean;
  fulfilments: readonly Readonly<{
    id: string;
    vendorId: string;
    status: FulfilmentOrder["status"];
    stage: string;
    delayed: boolean;
    dueAt?: number;
    trackingNumber?: string;
    carrier?: string;
    pickupStatus?: string;
    pickupReadyAt?: number;
  }>[];
  pendingSubstitutions: readonly SubstitutionRequest[];
  timeline: readonly OrderTimelineEvent[];
}>;

type ShipmentSummary = Readonly<{ fulfilmentId: string; trackingNumber?: string; carrier?: string; status: string }>;
type PickupSummary = Readonly<{ fulfilmentId: string; status: string; readyAt: number }>;

const DEFAULT_SLA_POLICIES: FulfilmentSlaPolicy[] = [
  { mode: "pickup", acceptanceMs: 8 * 60 * 60 * 1000, preparationMs: 24 * 60 * 60 * 1000, escalationGraceMs: 4 * 60 * 60 * 1000 },
  { mode: "local_delivery", acceptanceMs: 8 * 60 * 60 * 1000, preparationMs: 24 * 60 * 60 * 1000, escalationGraceMs: 4 * 60 * 60 * 1000 },
  { mode: "shipping", acceptanceMs: 8 * 60 * 60 * 1000, preparationMs: 24 * 60 * 60 * 1000, escalationGraceMs: 4 * 60 * 60 * 1000 },
  { mode: "bulky_special", acceptanceMs: 24 * 60 * 60 * 1000, preparationMs: 48 * 60 * 60 * 1000, escalationGraceMs: 8 * 60 * 60 * 1000 }
];

export class OrderOperationsService {
  readonly #commerce: CommerceService;
  readonly #events: OrderTimelineEvent[] = [];
  readonly #cancellations = new Map<string, OrderCancellation>();
  readonly #substitutions = new Map<string, SubstitutionRequest>();
  readonly #slaCases = new Map<string, FulfilmentSlaCase>();
  readonly #slaPolicies = new Map<CustomerOrder["fulfilmentMode"], FulfilmentSlaPolicy>();
  readonly #shipmentResolver?: (orderId: string) => readonly ShipmentSummary[];
  readonly #pickupResolver?: (customerId: string, now: number) => readonly PickupSummary[];
  readonly #businessDeadline?: (locationId: string, openedAt: number, businessMs: number) => number;

  constructor(input: {
    commerce: CommerceService;
    slaPolicies?: readonly FulfilmentSlaPolicy[];
    shipmentResolver?: (orderId: string) => readonly ShipmentSummary[];
    pickupResolver?: (customerId: string, now: number) => readonly PickupSummary[];
    businessDeadline?: (locationId: string, openedAt: number, businessMs: number) => number;
  }) {
    this.#commerce = input.commerce;
    for (const policy of input.slaPolicies ?? DEFAULT_SLA_POLICIES) {
      if (policy.acceptanceMs <= 0 || policy.preparationMs <= 0 || policy.escalationGraceMs < 0) throw new Error("Invalid fulfilment SLA policy");
      this.#slaPolicies.set(policy.mode, { ...policy });
    }
    this.#shipmentResolver = input.shipmentResolver;
    this.#pickupResolver = input.pickupResolver;
    this.#businessDeadline = input.businessDeadline;
  }

  registerOrder(order: CustomerOrder, now: number): void {
    if (!this.#events.some((event) => event.orderId === order.id && event.type === "order.authorised")) {
      this.record({ orderId: order.id, type: "order.authorised", actorType: "system", customerVisible: true, message: "Η παραγγελία δημιουργήθηκε και η πληρωμή εξουσιοδοτήθηκε.", createdAt: now });
    }
    for (const fulfilment of order.fulfilments) {
      if (fulfilment.status === "awaiting_acceptance") this.#ensureSla(order, fulfilment, "acceptance", now);
      else if (new Set(["accepted", "picking", "packed"]).has(fulfilment.status)) this.#ensureSla(order, fulfilment, "preparation", now);
    }
  }

  record(input: Omit<OrderTimelineEvent, "id">): OrderTimelineEvent {
    const event: OrderTimelineEvent = { id: id("ote"), ...input };
    this.#events.push(event);
    return structuredClone(event);
  }

  recordFulfilmentTransition(input: { orderId: string; fulfilmentId: string; actorType: OrderTimelineEvent["actorType"]; actorId?: string; previousStatus: FulfilmentOrder["status"]; status: FulfilmentOrder["status"]; now: number }): void {
    const order = this.#commerce.getOrder(input.orderId);
    const fulfilment = order.fulfilments.find((item) => item.id === input.fulfilmentId);
    if (!fulfilment) throw new Error("Fulfilment not found");
    this.record({ orderId: order.id, fulfilmentId: fulfilment.id, type: `fulfilment.${input.status}`, actorType: input.actorType, actorId: input.actorId, customerVisible: true, message: customerFulfilmentMessage(input.status), metadata: { previousStatus: input.previousStatus, status: input.status, vendorId: fulfilment.vendorId }, createdAt: input.now });
    if (input.status === "accepted") {
      this.#resolveOpenSla(fulfilment.id, "acceptance", input.now, "Vendor accepted fulfilment");
      this.#ensureSla(order, fulfilment, "preparation", input.now);
    }
    if (new Set(["ready_for_handover", "shipped", "delivered", "rejected", "cancelled", "failed"]).has(input.status)) {
      this.#resolveOpenSla(fulfilment.id, "preparation", input.now, `Fulfilment reached ${input.status}`);
      if (input.status === "rejected" || input.status === "cancelled" || input.status === "failed") this.#resolveOpenSla(fulfilment.id, "acceptance", input.now, `Fulfilment reached ${input.status}`);
    }
  }

  cancelByCustomer(input: { orderId: string; customerId: string; reason: string; now: number }): OrderCancellation {
    const order = this.#commerce.getOrder(input.orderId);
    if (order.customerId !== input.customerId) throw new Error("Customer order access denied");
    const existing = this.#cancellations.get(order.id);
    if (existing) return structuredClone(existing);
    const paymentBefore = this.#commerce.payments.get(order.paymentId);
    const updated = this.#commerce.cancelOrder({ orderId: order.id, reason: input.reason, idempotencyKey: `customer-cancel:${order.id}`, now: input.now });
    const paymentAfter = this.#commerce.payments.get(order.paymentId);
    const paymentOutcome: OrderCancellation["paymentOutcome"] = paymentBefore.status === "authorised" && paymentAfter.status === "cancelled"
      ? "authorisation_cancelled"
      : paymentAfter.status === "refunded" || paymentAfter.status === "partially_refunded" ? "refunded" : "already_closed";
    const record: OrderCancellation = { id: id("cancel"), orderId: order.id, customerId: input.customerId, reason: input.reason.trim(), status: "completed", paymentOutcome, createdAt: input.now, completedAt: input.now };
    this.#cancellations.set(order.id, record);
    for (const fulfilment of updated.fulfilments) this.#resolveAllSla(fulfilment.id, input.now, "Customer cancelled order");
    this.record({ orderId: order.id, type: "order.cancelled", actorType: "customer", actorId: input.customerId, customerVisible: true, message: "Η παραγγελία ακυρώθηκε.", metadata: { reason: record.reason, paymentOutcome }, createdAt: input.now });
    return structuredClone(record);
  }

  proposeSubstitution(input: { orderId: string; lineId: string; vendorId: string; proposedCanonicalVariantId: string; reason: string; now: number; expiresAt?: number }): SubstitutionRequest {
    const reason = input.reason.trim();
    if (reason.length < 5) throw new Error("Substitution reason is required");
    const order = this.#commerce.getOrder(input.orderId);
    if (!order.customerId) throw new Error("Substitution requires an identified customer");
    const line = order.lines.find((item) => item.id === input.lineId);
    if (!line) throw new Error("Order line not found");
    const existing = [...this.#substitutions.values()].find((item) => item.lineId === line.id && item.status === "pending_customer");
    if (existing) return structuredClone(existing);
    const requestId = id("sub");
    const reserved = this.#commerce.reserveSubstitution({ orderId: order.id, lineId: line.id, vendorId: input.vendorId, proposedCanonicalVariantId: input.proposedCanonicalVariantId, requestId, now: input.now });
    if (reserved.retailUnitPrice.minor > line.retailUnitPrice.minor) {
      this.#commerce.releaseSubstitutionReservation(reserved.reservationId, input.now);
      throw new Error("Higher-priced substitutions require a new payment flow and cannot be proposed here");
    }
    const request: SubstitutionRequest = {
      id: requestId, orderId: order.id, lineId: line.id, customerId: order.customerId, vendorId: input.vendorId,
      originalCanonicalVariantId: line.canonicalVariantId, proposedCanonicalVariantId: input.proposedCanonicalVariantId,
      proposedOfferId: reserved.offerId, proposedReservationId: reserved.reservationId, originalRetailUnitPrice: line.retailUnitPrice,
      proposedRetailUnitPrice: reserved.retailUnitPrice, proposedTitle: reserved.title, reason, status: "pending_customer",
      createdAt: input.now, expiresAt: input.expiresAt ?? input.now + 12 * 60 * 60 * 1000
    };
    if (request.expiresAt <= request.createdAt) throw new Error("Substitution expiry must be in the future");
    this.#substitutions.set(request.id, request);
    this.record({ orderId: order.id, fulfilmentId: order.fulfilments.find((f) => f.lineIds.includes(line.id) && f.vendorId === input.vendorId && f.status !== "rejected")?.id, lineId: line.id, type: "substitution.proposed", actorType: "vendor", actorId: input.vendorId, customerVisible: true, message: `Το τοπικό κατάστημα πρότεινε εναλλακτικό προϊόν: ${request.proposedTitle}.`, metadata: { substitutionId: request.id, proposedCanonicalVariantId: request.proposedCanonicalVariantId, reason }, createdAt: input.now });
    return structuredClone(request);
  }

  respondToSubstitution(input: { substitutionId: string; customerId: string; decision: "approve" | "reject"; reason?: string; now: number }): { substitution: SubstitutionRequest; order: CustomerOrder } {
    const request = this.#requiredSubstitution(input.substitutionId);
    if (request.customerId !== input.customerId) throw new Error("Customer substitution access denied");
    if (request.status !== "pending_customer") return { substitution: structuredClone(request), order: this.#commerce.getOrder(request.orderId) };
    if (request.expiresAt <= input.now) {
      this.#expireOne(request, input.now);
      throw new Error("Substitution proposal has expired");
    }
    if (input.decision === "reject") {
      this.#commerce.releaseSubstitutionReservation(request.proposedReservationId, input.now);
      const updated: SubstitutionRequest = { ...request, status: "rejected", decidedAt: input.now, decisionReason: input.reason?.trim() || "Customer declined substitution" };
      this.#substitutions.set(request.id, updated);
      this.record({ orderId: request.orderId, lineId: request.lineId, type: "substitution.rejected", actorType: "customer", actorId: input.customerId, customerVisible: true, message: "Η προτεινόμενη αντικατάσταση απορρίφθηκε.", metadata: { substitutionId: request.id }, createdAt: input.now });
      return { substitution: structuredClone(updated), order: this.#commerce.getOrder(request.orderId) };
    }
    const order = this.#commerce.applySubstitution({
      orderId: request.orderId, lineId: request.lineId, vendorId: request.vendorId, proposedCanonicalVariantId: request.proposedCanonicalVariantId,
      proposedOfferId: request.proposedOfferId, proposedReservationId: request.proposedReservationId, retailUnitPrice: request.proposedRetailUnitPrice,
      sourceReference: `substitution:${request.id}`, now: input.now
    });
    const updated: SubstitutionRequest = { ...request, status: "approved", decidedAt: input.now, decisionReason: input.reason?.trim() || "Customer approved substitution" };
    this.#substitutions.set(request.id, updated);
    this.record({ orderId: request.orderId, lineId: request.lineId, type: "substitution.approved", actorType: "customer", actorId: input.customerId, customerVisible: true, message: `Η αντικατάσταση εγκρίθηκε: ${request.proposedTitle}.`, metadata: { substitutionId: request.id }, createdAt: input.now });
    return { substitution: structuredClone(updated), order };
  }

  expireSubstitutions(now: number): number {
    let count = 0;
    for (const request of this.#substitutions.values()) {
      if (request.status === "pending_customer" && request.expiresAt <= now) {
        this.#expireOne(request, now);
        count += 1;
      }
    }
    return count;
  }

  scanSla(now: number): readonly FulfilmentSlaCase[] {
    const changed: FulfilmentSlaCase[] = [];
    for (const current of this.#slaCases.values()) {
      if (current.state === "resolved") continue;
      if (current.state === "open" && now >= current.dueAt) {
        const next: FulfilmentSlaCase = { ...current, state: now >= current.escalationAt ? "escalated" : "breached", breachedAt: now, escalatedAt: now >= current.escalationAt ? now : undefined };
        this.#slaCases.set(current.id, next);
        changed.push(structuredClone(next));
        this.record({ orderId: next.orderId, fulfilmentId: next.fulfilmentId, type: next.state === "escalated" ? "fulfilment.sla_escalated" : "fulfilment.sla_breached", actorType: "system", customerVisible: true, message: "Υπάρχει καθυστέρηση στην τοπική εκπλήρωση. Η ομάδα υποστήριξης το παρακολουθεί.", metadata: { slaCaseId: next.id, stage: next.stage, state: next.state, vendorId: next.vendorId }, createdAt: now });
      } else if (current.state === "breached" && now >= current.escalationAt) {
        const next: FulfilmentSlaCase = { ...current, state: "escalated", escalatedAt: now };
        this.#slaCases.set(current.id, next);
        changed.push(structuredClone(next));
        this.record({ orderId: next.orderId, fulfilmentId: next.fulfilmentId, type: "fulfilment.sla_escalated", actorType: "system", customerVisible: true, message: "Η καθυστέρηση κλιμακώθηκε στην ομάδα λειτουργίας του Buy Local Sparta.", metadata: { slaCaseId: next.id, stage: next.stage, vendorId: next.vendorId }, createdAt: now });
      }
    }
    return changed;
  }

  resolveSla(input: { slaCaseId: string; actorId: string; resolution: string; now: number }): FulfilmentSlaCase {
    const current = this.#slaCases.get(input.slaCaseId);
    if (!current) throw new Error("SLA case not found");
    if (current.state === "resolved") return structuredClone(current);
    const resolution = input.resolution.trim();
    if (resolution.length < 5) throw new Error("SLA resolution is required");
    const next: FulfilmentSlaCase = { ...current, state: "resolved", resolvedAt: input.now, resolution };
    this.#slaCases.set(current.id, next);
    this.record({ orderId: current.orderId, fulfilmentId: current.fulfilmentId, type: "fulfilment.sla_resolved", actorType: "platform", actorId: input.actorId, customerVisible: false, message: "Operational SLA case resolved.", metadata: { slaCaseId: current.id, resolution }, createdAt: input.now });
    return structuredClone(next);
  }

  trackingForCustomer(input: { orderId: string; customerId: string; now: number }): OrderTrackingProjection {
    const order = this.#commerce.getOrder(input.orderId);
    if (order.customerId !== input.customerId) throw new Error("Customer order access denied");
    const shipments = this.#shipmentResolver?.(order.id) ?? [];
    const pickups = this.#pickupResolver?.(input.customerId, input.now) ?? [];
    const pendingSubstitutions = this.substitutionsForOrder(order.id).filter((item) => item.status === "pending_customer");
    const fulfilments = order.fulfilments.filter((item) => item.status !== "rejected").map((fulfilment) => {
      const sla = this.#activeSlaForFulfilment(fulfilment.id);
      const shipment = shipments.find((item) => item.fulfilmentId === fulfilment.id);
      const pickup = pickups.find((item) => item.fulfilmentId === fulfilment.id);
      return {
        id: fulfilment.id, vendorId: fulfilment.vendorId, status: fulfilment.status, stage: customerStage(fulfilment.status),
        delayed: sla?.state === "breached" || sla?.state === "escalated", dueAt: sla?.dueAt,
        trackingNumber: shipment?.trackingNumber, carrier: shipment?.carrier, pickupStatus: pickup?.status, pickupReadyAt: pickup?.readyAt
      };
    });
    return {
      orderId: order.id, orderStatus: order.status, createdAt: order.createdAt, total: order.total, fulfilmentMode: order.fulfilmentMode,
      cancelledAt: order.cancelledAt, cancellationReason: order.cancellationReason, progressPercent: orderProgress(order),
      requiresCustomerAction: order.status === "requires_customer_action" || pendingSubstitutions.length > 0,
      fulfilments, pendingSubstitutions, timeline: this.eventsForOrder(order.id).filter((event) => event.customerVisible)
    };
  }

  substitutionsForOrder(orderId: string): readonly SubstitutionRequest[] {
    return [...this.#substitutions.values()].filter((item) => item.orderId === orderId).map((item) => structuredClone(item));
  }

  substitutionsForVendor(vendorId: string): readonly SubstitutionRequest[] {
    return [...this.#substitutions.values()].filter((item) => item.vendorId === vendorId).map((item) => structuredClone(item));
  }

  cancellations(): readonly OrderCancellation[] {
    return [...this.#cancellations.values()].map((item) => structuredClone(item));
  }

  slaCases(input: { vendorId?: string; activeOnly?: boolean } = {}): readonly FulfilmentSlaCase[] {
    return [...this.#slaCases.values()]
      .filter((item) => !input.vendorId || item.vendorId === input.vendorId)
      .filter((item) => !input.activeOnly || item.state !== "resolved")
      .map((item) => structuredClone(item));
  }

  eventsForOrder(orderId: string): readonly OrderTimelineEvent[] {
    return this.#events.filter((event) => event.orderId === orderId).sort((a, b) => a.createdAt - b.createdAt).map((event) => structuredClone(event));
  }

  allEvents(): readonly OrderTimelineEvent[] {
    return this.#events.map((event) => structuredClone(event));
  }

  #ensureSla(order: CustomerOrder, fulfilment: FulfilmentOrder, stage: FulfilmentSlaStage, openedAt: number): void {
    if ([...this.#slaCases.values()].some((item) => item.fulfilmentId === fulfilment.id && item.stage === stage && item.state !== "resolved")) return;
    const policy = this.#slaPolicies.get(order.fulfilmentMode);
    if (!policy) return;
    const duration = stage === "acceptance" ? policy.acceptanceMs : policy.preparationMs;
    const dueAt = this.#businessDeadline ? this.#businessDeadline(fulfilment.locationId, openedAt, duration) : openedAt + duration;
    const escalationAt = this.#businessDeadline ? this.#businessDeadline(fulfilment.locationId, dueAt, policy.escalationGraceMs) : dueAt + policy.escalationGraceMs;
    const record: FulfilmentSlaCase = { id: id("sla"), orderId: order.id, fulfilmentId: fulfilment.id, vendorId: fulfilment.vendorId, stage, state: "open", openedAt, dueAt, escalationAt };
    this.#slaCases.set(record.id, record);
  }

  #activeSlaForFulfilment(fulfilmentId: string): FulfilmentSlaCase | undefined {
    return [...this.#slaCases.values()].filter((item) => item.fulfilmentId === fulfilmentId && item.state !== "resolved").sort((a, b) => b.openedAt - a.openedAt)[0];
  }

  #resolveOpenSla(fulfilmentId: string, stage: FulfilmentSlaStage, now: number, resolution: string): void {
    for (const current of this.#slaCases.values()) {
      if (current.fulfilmentId === fulfilmentId && current.stage === stage && current.state !== "resolved") this.#slaCases.set(current.id, { ...current, state: "resolved", resolvedAt: now, resolution });
    }
  }

  #resolveAllSla(fulfilmentId: string, now: number, resolution: string): void {
    for (const current of this.#slaCases.values()) {
      if (current.fulfilmentId === fulfilmentId && current.state !== "resolved") this.#slaCases.set(current.id, { ...current, state: "resolved", resolvedAt: now, resolution });
    }
  }

  #requiredSubstitution(substitutionId: string): SubstitutionRequest {
    const request = this.#substitutions.get(substitutionId);
    if (!request) throw new Error("Substitution request not found");
    return request;
  }

  #expireOne(request: SubstitutionRequest, now: number): void {
    this.#commerce.releaseSubstitutionReservation(request.proposedReservationId, now);
    const expired: SubstitutionRequest = { ...request, status: "expired", decidedAt: now, decisionReason: "Substitution proposal expired" };
    this.#substitutions.set(request.id, expired);
    this.record({ orderId: request.orderId, lineId: request.lineId, type: "substitution.expired", actorType: "system", customerVisible: true, message: "Η προτεινόμενη αντικατάσταση έληξε χωρίς αλλαγή στην παραγγελία.", metadata: { substitutionId: request.id }, createdAt: now });
  }
}

function customerFulfilmentMessage(status: FulfilmentOrder["status"]): string {
  const messages: Record<FulfilmentOrder["status"], string> = {
    awaiting_acceptance: "Αναμένουμε επιβεβαίωση από το τοπικό κατάστημα.", accepted: "Το τοπικό κατάστημα ανέλαβε την εκπλήρωση.", rejected: "Το κατάστημα δεν μπόρεσε να αναλάβει· αναζητούμε ισοδύναμο τοπικό προμηθευτή.",
    picking: "Το προϊόν συλλέγεται στο κατάστημα.", packed: "Το προϊόν έχει συσκευαστεί.", ready_for_handover: "Το προϊόν είναι έτοιμο για παραλαβή.", shipped: "Το δέμα παραδόθηκε στον μεταφορέα.", delivered: "Η εκπλήρωση ολοκληρώθηκε.", failed: "Παρουσιάστηκε πρόβλημα στην εκπλήρωση.", cancelled: "Η συγκεκριμένη εκπλήρωση ακυρώθηκε."
  };
  return messages[status];
}

function customerStage(status: FulfilmentOrder["status"]): string {
  if (status === "awaiting_acceptance") return "waiting_for_shop";
  if (new Set(["accepted", "picking", "packed"]).has(status)) return "preparing";
  if (status === "ready_for_handover") return "ready_for_pickup";
  if (status === "shipped") return "in_transit";
  if (status === "delivered") return "delivered";
  return status;
}

function orderProgress(order: CustomerOrder): number {
  if (order.status === "cancelled") return 0;
  const active = order.fulfilments.filter((item) => item.status !== "rejected" && item.status !== "cancelled");
  if (!active.length) return 0;
  const score = (status: FulfilmentOrder["status"]) => status === "delivered" ? 100 : status === "shipped" || status === "ready_for_handover" ? 75 : status === "packed" ? 60 : status === "picking" ? 45 : status === "accepted" ? 30 : 10;
  return Math.round(active.reduce((sum, item) => sum + score(item.status), 0) / active.length);
}
