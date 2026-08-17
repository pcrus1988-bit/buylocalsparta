import { id } from "../common/ids.ts";
import { money, subtractMoney, type Money } from "../common/money.ts";
import type { CommerceService } from "../commerce/order-service.ts";
import type { Ledger } from "./ledger.ts";
import type { ProcurementService } from "./procurement.ts";

export type PaymentDisputeStatus = "evidence_required" | "submitted" | "won" | "lost" | "closed";
export type DisputeEvidenceKind = "order_confirmation" | "shipment_tracking" | "proof_of_delivery" | "pickup_proof" | "customer_message" | "product_description" | "refund_record" | "other";

export type DisputeEvidence = Readonly<{
  id: string;
  kind: DisputeEvidenceKind;
  reference: string;
  description?: string;
  addedBy: string;
  addedAt: number;
}>;

export type PaymentDispute = Readonly<{
  id: string;
  provider: string;
  providerCaseId: string;
  providerEventId: string;
  orderId: string;
  paymentId: string;
  amount: Money;
  reasonCode: string;
  status: PaymentDisputeStatus;
  evidenceDeadline?: number;
  evidence: readonly DisputeEvidence[];
  openedAt: number;
  submittedAt?: number;
  resolvedAt?: number;
  outcomeReason?: string;
  liabilityReviewRequired: boolean;
  liabilityAllocation?: "platform" | "vendor";
  liabilityReason?: string;
  closedAt?: number;
}>;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutableDispute = Omit<Mutable<PaymentDispute>, "evidence"> & { evidence: DisputeEvidence[] };

export class PaymentDisputeService {
  readonly #commerce: CommerceService;
  readonly #procurement: ProcurementService;
  readonly #ledger: Ledger;
  readonly #cases = new Map<string, MutableDispute>();
  readonly #providerCases = new Map<string, string>();
  readonly #providerEvents = new Map<string, string>();

  constructor(input: { commerce: CommerceService; procurement: ProcurementService; ledger: Ledger }) {
    this.#commerce = input.commerce;
    this.#procurement = input.procurement;
    this.#ledger = input.ledger;
  }

  open(input: {
    provider: string;
    providerCaseId: string;
    providerEventId: string;
    orderId: string;
    paymentId: string;
    amount: Money;
    reasonCode: string;
    evidenceDeadline?: number;
    now: number;
  }): { duplicate: boolean; dispute: PaymentDispute } {
    if (!input.provider.trim() || !input.providerCaseId.trim() || !input.providerEventId.trim()) throw new Error("Provider dispute identifiers are required");
    const priorByEvent = this.#providerEvents.get(`${input.provider}:${input.providerEventId}`);
    if (priorByEvent) return { duplicate: true, dispute: this.get(priorByEvent) };
    const priorByCase = this.#providerCases.get(`${input.provider}:${input.providerCaseId}`);
    if (priorByCase) {
      this.#providerEvents.set(`${input.provider}:${input.providerEventId}`, priorByCase);
      return { duplicate: true, dispute: this.get(priorByCase) };
    }
    if (!input.reasonCode.trim()) throw new Error("Dispute reason code is required");
    if (input.amount.minor <= 0) throw new Error("Dispute amount must be positive");
    const order = this.#commerce.getOrder(input.orderId);
    if (order.paymentId !== input.paymentId) throw new Error("Dispute payment does not belong to the order");
    const payment = this.#commerce.payments.get(input.paymentId);
    const remainingCaptured = subtractMoney(payment.capturedAmount, payment.refundedAmount);
    if (input.amount.currency !== remainingCaptured.currency || input.amount.minor > remainingCaptured.minor) throw new Error("Dispute amount exceeds remaining captured payment");

    this.#commerce.payments.chargeback({ paymentId: input.paymentId, idempotencyKey: `chargeback:${input.provider}:${input.providerCaseId}` });
    const dispute: MutableDispute = {
      id: id("dispute"), provider: input.provider.trim(), providerCaseId: input.providerCaseId.trim(), providerEventId: input.providerEventId.trim(),
      orderId: order.id, paymentId: input.paymentId, amount: input.amount, reasonCode: input.reasonCode.trim(), status: "evidence_required",
      evidenceDeadline: input.evidenceDeadline, evidence: [], openedAt: input.now, liabilityReviewRequired: false
    };
    this.#cases.set(dispute.id, dispute);
    this.#providerCases.set(`${dispute.provider}:${dispute.providerCaseId}`, dispute.id);
    this.#providerEvents.set(`${dispute.provider}:${dispute.providerEventId}`, dispute.id);
    this.#procurement.holdOrderForDispute({ orderId: order.id, disputeReference: dispute.id, now: input.now });
    return { duplicate: false, dispute: this.#public(dispute) };
  }

  addEvidence(input: { disputeId: string; kind: DisputeEvidenceKind; reference: string; description?: string; actorId: string; now: number }): PaymentDispute {
    const dispute = this.#required(input.disputeId);
    if (dispute.status !== "evidence_required") throw new Error(`Cannot add evidence while dispute is ${dispute.status}`);
    if (!input.reference.trim()) throw new Error("Evidence reference is required");
    if (!input.actorId.trim()) throw new Error("Evidence actor is required");
    dispute.evidence.push(Object.freeze({ id: id("dispute-evidence"), kind: input.kind, reference: input.reference.trim(), description: input.description?.trim() || undefined, addedBy: input.actorId.trim(), addedAt: input.now }));
    return this.#public(dispute);
  }

  submit(input: { disputeId: string; actorId: string; now: number }): PaymentDispute {
    const dispute = this.#required(input.disputeId);
    if (dispute.status !== "evidence_required") throw new Error(`Cannot submit dispute while ${dispute.status}`);
    if (dispute.evidence.length === 0) throw new Error("Dispute requires evidence before submission");
    if (dispute.evidenceDeadline !== undefined && input.now > dispute.evidenceDeadline) throw new Error("Dispute evidence deadline has passed");
    dispute.status = "submitted";
    dispute.submittedAt = input.now;
    return this.#public(dispute);
  }

  resolve(input: { disputeId: string; providerEventId: string; outcome: "won" | "lost"; reason?: string; now: number }): { duplicate: boolean; dispute: PaymentDispute } {
    const dispute = this.#required(input.disputeId);
    const eventKey = `${dispute.provider}:${input.providerEventId}`;
    const prior = this.#providerEvents.get(eventKey);
    if (prior) return { duplicate: true, dispute: this.get(prior) };
    if (!new Set<PaymentDisputeStatus>(["evidence_required", "submitted"]).has(dispute.status)) throw new Error(`Cannot resolve dispute while ${dispute.status}`);
    this.#providerEvents.set(eventKey, dispute.id);
    dispute.status = input.outcome;
    dispute.resolvedAt = input.now;
    dispute.outcomeReason = input.reason?.trim() || undefined;
    if (input.outcome === "won") {
      this.#commerce.payments.resolveChargeback({ paymentId: dispute.paymentId, outcome: "won" });
      this.#procurement.releaseOrderDispute({ orderId: dispute.orderId, disputeReference: dispute.id, now: input.now });
      dispute.liabilityReviewRequired = false;
      dispute.status = "closed";
      dispute.closedAt = input.now;
    } else {
      this.#commerce.payments.resolveChargeback({ paymentId: dispute.paymentId, outcome: "lost" });
      dispute.liabilityReviewRequired = true;
      this.#ledger.post({
        reference: `chargeback-loss-pending:${dispute.id}`,
        createdAt: input.now,
        entries: [
          { account: "chargeback_pending_allocation", direction: "debit", amount: dispute.amount, entityType: "order", entityId: dispute.orderId },
          { account: "psp_receivable", direction: "credit", amount: dispute.amount, entityType: "payment", entityId: dispute.paymentId }
        ]
      });
    }
    return { duplicate: false, dispute: this.#public(dispute) };
  }

  allocateLoss(input: { disputeId: string; allocation: "platform" | "vendor"; reason: string; actorId: string; now: number }): PaymentDispute {
    const dispute = this.#required(input.disputeId);
    if (dispute.status !== "lost" || !dispute.liabilityReviewRequired) throw new Error("Dispute is not awaiting liability allocation");
    if (!input.reason.trim()) throw new Error("Liability allocation requires a reason");
    if (!input.actorId.trim()) throw new Error("Liability allocation actor is required");

    if (input.allocation === "platform") {
      this.#procurement.releaseOrderDispute({ orderId: dispute.orderId, disputeReference: dispute.id, now: input.now });
      this.#ledger.post({
        reference: `chargeback-platform-allocation:${dispute.id}`,
        createdAt: input.now,
        entries: [
          { account: "platform_chargeback_loss", direction: "debit", amount: dispute.amount, entityType: "order", entityId: dispute.orderId },
          { account: "chargeback_pending_allocation", direction: "credit", amount: dispute.amount, entityType: "order", entityId: dispute.orderId }
        ]
      });
    } else {
      this.#procurement.recoverChargebackFromHeldPayables({ orderId: dispute.orderId, disputeReference: dispute.id, amount: dispute.amount, reason: input.reason, now: input.now });
      this.#procurement.releaseOrderDispute({ orderId: dispute.orderId, disputeReference: dispute.id, now: input.now });
      this.#ledger.post({
        reference: `chargeback-vendor-allocation:${dispute.id}`,
        createdAt: input.now,
        entries: [
          { account: "chargeback_recovery", direction: "debit", amount: dispute.amount, entityType: "order", entityId: dispute.orderId },
          { account: "chargeback_pending_allocation", direction: "credit", amount: dispute.amount, entityType: "order", entityId: dispute.orderId }
        ]
      });
    }
    dispute.liabilityAllocation = input.allocation;
    dispute.liabilityReason = input.reason.trim();
    dispute.liabilityReviewRequired = false;
    dispute.status = "closed";
    dispute.closedAt = input.now;
    return this.#public(dispute);
  }

  get(disputeId: string): PaymentDispute {
    return this.#public(this.#required(disputeId));
  }

  all(): readonly PaymentDispute[] {
    return [...this.#cases.values()].map((dispute) => this.#public(dispute));
  }

  forOrder(orderId: string): readonly PaymentDispute[] {
    return [...this.#cases.values()].filter((dispute) => dispute.orderId === orderId).map((dispute) => this.#public(dispute));
  }

  #required(disputeId: string): MutableDispute {
    const dispute = this.#cases.get(disputeId);
    if (!dispute) throw new Error("Payment dispute not found");
    return dispute;
  }

  #public(dispute: MutableDispute): PaymentDispute {
    return Object.freeze({ ...dispute, amount: money(dispute.amount.minor, dispute.amount.currency), evidence: dispute.evidence.map((entry) => Object.freeze({ ...entry })) });
  }
}
