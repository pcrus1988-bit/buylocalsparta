import { id } from "../common/ids.ts";
import { addMoney, money, type Money } from "../common/money.ts";
import { ProcurementService } from "./procurement.ts";

export type SettlementBatchStatus = "draft" | "approval_required" | "approved" | "processing" | "paid" | "failed";

export type SettlementLine = Readonly<{
  id: string;
  procurementId: string;
  vendorId: string;
  payable: Money;
  payoutReference?: string;
  reconciliationStatus: "pending" | "reconciled" | "paid" | "failed";
}>;

export type SettlementBatch = Readonly<{
  id: string;
  batchNumber: string;
  marketId: string;
  status: SettlementBatchStatus;
  periodStart: number;
  periodEnd: number;
  currency: "EUR";
  totalPayable: Money;
  lines: readonly SettlementLine[];
  createdBy: string;
  createdAt: number;
  submittedBy?: string;
  submittedAt?: number;
  approvedBy?: string;
  approvedAt?: number;
  paidBy?: string;
  paidAt?: number;
  payoutReference?: string;
  failureReason?: string;
}>;

type MutableSettlementLine = {
  id: string;
  procurementId: string;
  vendorId: string;
  payable: Money;
  payoutReference?: string;
  reconciliationStatus: "pending" | "reconciled" | "paid" | "failed";
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type MutableSettlementBatch = Omit<Mutable<SettlementBatch>, "lines"> & { lines: MutableSettlementLine[] };

export class SettlementService {
  readonly #procurement: ProcurementService;
  readonly #batches = new Map<string, MutableSettlementBatch>();
  readonly #procurementIndex = new Map<string, string>();
  #sequence = 0;

  constructor(procurement: ProcurementService) {
    this.#procurement = procurement;
  }

  createDraft(input: {
    marketId: string;
    procurementIds: readonly string[];
    periodStart: number;
    periodEnd: number;
    createdBy: string;
    now: number;
  }): SettlementBatch {
    if (input.procurementIds.length === 0) throw new Error("Settlement batch requires at least one procurement");
    if (input.periodEnd < input.periodStart) throw new Error("Settlement period end cannot precede start");
    if (!input.createdBy.trim()) throw new Error("Settlement maker is required");
    const unique = [...new Set(input.procurementIds)];
    if (unique.length !== input.procurementIds.length) throw new Error("Settlement procurement list contains duplicates");

    const lines: MutableSettlementLine[] = [];
    let total = money(0);
    for (const procurementId of unique) {
      if (this.#procurementIndex.has(procurementId)) throw new Error(`Procurement ${procurementId} is already assigned to a settlement batch`);
      const record = this.#procurement.record(procurementId);
      if (record.status !== "payable") throw new Error(`Procurement ${procurementId} is ${record.status}, not payable`);
      if (record.gross.currency !== "EUR") throw new Error("Settlement batch currently supports EUR only");
      lines.push({ id: id("stl"), procurementId, vendorId: record.vendorId, payable: record.payable, reconciliationStatus: "pending" });
      total = addMoney(total, record.payable);
    }

    this.#sequence += 1;
    const batch: MutableSettlementBatch = {
      id: id("stb"),
      batchNumber: `SET-${new Date(input.now).getUTCFullYear()}-${String(this.#sequence).padStart(6, "0")}`,
      marketId: input.marketId,
      status: "draft",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: "EUR",
      totalPayable: total,
      lines,
      createdBy: input.createdBy,
      createdAt: input.now
    };
    this.#batches.set(batch.id, batch);
    for (const line of lines) this.#procurementIndex.set(line.procurementId, batch.id);
    return this.#public(batch);
  }

  submitForApproval(input: { batchId: string; actorId: string; now: number }): SettlementBatch {
    const batch = this.#required(input.batchId);
    if (batch.status !== "draft") throw new Error(`Cannot submit settlement in ${batch.status}`);
    if (input.actorId !== batch.createdBy) throw new Error("Only the settlement maker can submit the draft");
    let recomputed = money(0);
    for (const line of batch.lines) {
      const record = this.#procurement.record(line.procurementId);
      if (record.status !== "payable") throw new Error(`Procurement ${record.id} changed to ${record.status} during reconciliation`);
      if (record.payable.minor !== line.payable.minor || record.payable.currency !== line.payable.currency) throw new Error(`Procurement ${record.id} payable changed during reconciliation`);
      line.reconciliationStatus = "reconciled";
      recomputed = addMoney(recomputed, record.payable);
    }
    if (recomputed.minor !== batch.totalPayable.minor) throw new Error("Settlement total does not reconcile");
    batch.status = "approval_required";
    batch.submittedBy = input.actorId;
    batch.submittedAt = input.now;
    return this.#public(batch);
  }

  approve(input: { batchId: string; checkerId: string; now: number }): SettlementBatch {
    const batch = this.#required(input.batchId);
    if (batch.status !== "approval_required") throw new Error(`Cannot approve settlement in ${batch.status}`);
    if (input.checkerId === batch.createdBy) throw new Error("Settlement maker cannot approve the same payout batch");
    if (!input.checkerId.trim()) throw new Error("Settlement checker is required");
    batch.status = "approved";
    batch.approvedBy = input.checkerId;
    batch.approvedAt = input.now;
    return this.#public(batch);
  }

  markPaid(input: { batchId: string; actorId: string; payoutReference: string; now: number }): SettlementBatch {
    const batch = this.#required(input.batchId);
    if (batch.status === "paid") return this.#public(batch);
    if (batch.status !== "approved") throw new Error(`Cannot pay settlement in ${batch.status}`);
    if (!input.payoutReference.trim()) throw new Error("Payout reference is required");

    // Revalidate every line before the first irreversible settlement event. In the PostgreSQL adapter this runs in one DB transaction.
    for (const line of batch.lines) {
      const record = this.#procurement.record(line.procurementId);
      if (record.status !== "payable") throw new Error(`Procurement ${record.id} is no longer payable`);
      if (record.payable.minor !== line.payable.minor) throw new Error(`Procurement ${record.id} payable no longer reconciles`);
    }

    batch.status = "processing";
    for (const line of batch.lines) {
      const lineReference = `${input.payoutReference}:${line.procurementId}`;
      this.#procurement.settle({ procurementId: line.procurementId, payoutReference: lineReference, now: input.now });
      line.payoutReference = lineReference;
      line.reconciliationStatus = "paid";
    }
    batch.status = "paid";
    batch.paidBy = input.actorId;
    batch.paidAt = input.now;
    batch.payoutReference = input.payoutReference.trim();
    return this.#public(batch);
  }

  fail(input: { batchId: string; actorId: string; reason: string; now: number }): SettlementBatch {
    const batch = this.#required(input.batchId);
    if (!["approved", "processing"].includes(batch.status)) throw new Error(`Cannot fail settlement in ${batch.status}`);
    if (!input.reason.trim()) throw new Error("Settlement failure reason is required");
    batch.status = "failed";
    batch.failureReason = input.reason.trim();
    for (const line of batch.lines) if (line.reconciliationStatus !== "paid") line.reconciliationStatus = "failed";
    return this.#public(batch);
  }

  get(batchId: string): SettlementBatch | undefined {
    const batch = this.#batches.get(batchId);
    return batch ? this.#public(batch) : undefined;
  }

  all(): readonly SettlementBatch[] {
    return [...this.#batches.values()].map((batch) => this.#public(batch));
  }

  forVendor(vendorId: string): readonly SettlementBatch[] {
    return [...this.#batches.values()]
      .filter((batch) => batch.lines.some((line) => line.vendorId === vendorId))
      .map((batch) => this.#public({ ...batch, lines: batch.lines.filter((line) => line.vendorId === vendorId) }));
  }

  #public(batch: MutableSettlementBatch): SettlementBatch {
    const lines = batch.lines.map((line) => Object.freeze({ ...line, payable: { ...line.payable } }));
    const visibleTotal = lines.reduce((sum, line) => addMoney(sum, line.payable), money(0));
    return Object.freeze({ ...batch, totalPayable: visibleTotal, lines });
  }

  #required(batchId: string): MutableSettlementBatch {
    const batch = this.#batches.get(batchId);
    if (!batch) throw new Error("Settlement batch not found");
    return batch;
  }
}
