import { id } from "../common/ids.ts";
import { addMoney, applyBasisPoints, money, multiplyMoney, subtractMoney, type Money } from "../common/money.ts";
import type { CustomerOrder, OrderLine } from "../commerce/types.ts";
import { Ledger } from "./ledger.ts";
import type { FeeSnapshot } from "./fees.ts";

export type ProcurementStatus = "accrued" | "matched" | "disputed" | "payable" | "settled" | "reversed";

export type ProcurementAdjustment = Readonly<{
  id: string;
  type: "return_reversal" | "settled_return_recovery" | "chargeback_recovery" | "manual";
  quantity?: number;
  net: Money;
  tax: Money;
  gross: Money;
  reason: string;
  createdAt: number;
}>;

export type ProcurementRecord = {
  id: string;
  orderId: string;
  orderLineId: string;
  vendorId: string;
  supplierUnitNet: Money;
  supplierTaxRateBps: number;
  accruedQuantity: number;
  reversedQuantity: number;
  net: Money;
  tax: Money;
  gross: Money;
  shippingReimbursement: Money;
  serviceFeeNet: Money;
  serviceFeeTax: Money;
  serviceFeeGross: Money;
  payable: Money;
  feeSnapshots: FeeSnapshot[];
  status: ProcurementStatus;
  statusBeforeDispute?: Exclude<ProcurementStatus, "disputed">;
  disputeReference?: string;
  invoiceNumber?: string;
  payoutReference?: string;
  postSettlementReturnReceivable: Money;
  adjustments: ProcurementAdjustment[];
  createdAt: number;
  updatedAt: number;
};

export class ProcurementService {
  readonly #records = new Map<string, ProcurementRecord>();
  readonly #lineIndex = new Map<string, string>();
  readonly #ledger: Ledger;

  constructor(ledger: Ledger) {
    this.#ledger = ledger;
  }

  accrueFulfilledLines(order: CustomerOrder, now: number): readonly ProcurementRecord[] {
    const created: ProcurementRecord[] = [];
    for (const line of order.lines) {
      if (line.fulfilledQuantity <= 0) continue;
      const existingId = this.#lineIndex.get(line.id);
      if (existingId) {
        created.push(this.record(existingId));
        continue;
      }
      const record = this.#accrueLine(order.id, line, now);
      created.push(record);
    }
    return created;
  }

  reverseQuantity(input: { orderLineId: string; quantity: number; reason: string; now: number }): ProcurementRecord {
    const recordId = this.#lineIndex.get(input.orderLineId);
    if (!recordId) throw new Error("No procurement accrual exists for order line");
    const record = this.#required(recordId);
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Reversal quantity must be positive");
    const remaining = record.accruedQuantity - record.reversedQuantity;
    if (input.quantity > remaining) throw new Error("Procurement reversal exceeds accrued quantity");
    if (record.status === "settled") throw new Error("Settled procurement requires a credit-note workflow before reversal");
    if (record.feeSnapshots.length > 0 || record.shippingReimbursement.minor !== 0) throw new Error("Commercial fee/reimbursement snapshot must be reversed before procurement quantity reversal");

    const net = multiplyMoney(record.supplierUnitNet, input.quantity);
    const tax = applyBasisPoints(net, record.supplierTaxRateBps);
    const gross = addMoney(net, tax);
    const adjustment: ProcurementAdjustment = {
      id: id("padj"),
      type: "return_reversal",
      quantity: input.quantity,
      net,
      tax,
      gross,
      reason: input.reason,
      createdAt: input.now
    };
    record.reversedQuantity += input.quantity;
    record.net = subtractMoney(record.net, net);
    record.tax = subtractMoney(record.tax, tax);
    record.gross = subtractMoney(record.gross, gross);
    record.payable = record.gross;
    record.adjustments.push(adjustment);
    record.status = record.reversedQuantity === record.accruedQuantity ? "reversed" : "accrued";
    record.updatedAt = input.now;

    this.#ledger.post({
      reference: `procurement-reversal:${record.id}:${adjustment.id}`,
      createdAt: input.now,
      entries: [
        { account: "vendor_payable", direction: "debit", amount: gross, entityType: "vendor", entityId: record.vendorId },
        { account: "cost_of_goods", direction: "credit", amount: net, entityType: "order_line", entityId: record.orderLineId },
        { account: "input_vat", direction: "credit", amount: tax, entityType: "order_line", entityId: record.orderLineId }
      ]
    });
    return structuredClone(record);
  }

  reverseForCustomerReturn(input: { orderLineId: string; quantity: number; reason: string; now: number }): ProcurementRecord {
    const recordId = this.#lineIndex.get(input.orderLineId);
    if (!recordId) throw new Error("No procurement accrual exists for order line");
    const record = this.#required(recordId);
    if (record.status !== "settled") return this.reverseQuantity(input);
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Reversal quantity must be positive");
    const remaining = record.accruedQuantity - record.reversedQuantity;
    if (input.quantity > remaining) throw new Error("Procurement reversal exceeds accrued quantity");

    const net = multiplyMoney(record.supplierUnitNet, input.quantity);
    const tax = applyBasisPoints(net, record.supplierTaxRateBps);
    const gross = addMoney(net, tax);
    const adjustment: ProcurementAdjustment = {
      id: id("padj"),
      type: "settled_return_recovery",
      quantity: input.quantity,
      net,
      tax,
      gross,
      reason: input.reason,
      createdAt: input.now
    };
    record.reversedQuantity += input.quantity;
    record.postSettlementReturnReceivable = addMoney(record.postSettlementReturnReceivable, gross);
    record.adjustments.push(adjustment);
    record.updatedAt = input.now;

    this.#ledger.post({
      reference: `settled-return-recovery:${record.id}:${adjustment.id}`,
      createdAt: input.now,
      entries: [
        { account: "vendor_receivable", direction: "debit", amount: gross, entityType: "vendor", entityId: record.vendorId },
        { account: "cost_of_goods", direction: "credit", amount: net, entityType: "order_line", entityId: record.orderLineId },
        { account: "input_vat", direction: "credit", amount: tax, entityType: "order_line", entityId: record.orderLineId }
      ]
    });
    return structuredClone(record);
  }

  matchInvoice(input: { procurementId: string; invoiceNumber: string; invoiceGross: Money; now: number }): ProcurementRecord {
    const record = this.#required(input.procurementId);
    if (!input.invoiceNumber.trim()) throw new Error("Invoice number is required");
    if (record.status === "disputed") throw new Error("Disputed procurement cannot be invoice-matched until the hold is resolved");
    if (record.status === "settled" || record.status === "reversed") throw new Error(`Cannot match invoice in ${record.status}`);
    record.invoiceNumber = input.invoiceNumber.trim();
    record.status = input.invoiceGross.currency === record.gross.currency && input.invoiceGross.minor === record.gross.minor ? "matched" : "disputed";
    record.updatedAt = input.now;
    return structuredClone(record);
  }

  approvePayable(procurementId: string, now: number): ProcurementRecord {
    const record = this.#required(procurementId);
    if (record.status !== "matched") throw new Error("Only matched procurement can become payable");
    record.status = "payable";
    record.updatedAt = now;
    return structuredClone(record);
  }

  applyCommercialSnapshot(input: { procurementId: string; feeSnapshots: readonly FeeSnapshot[]; shippingReimbursement?: Money; now: number }): ProcurementRecord {
    const record = this.#required(input.procurementId);
    if (record.status !== "matched") throw new Error("Commercial snapshot can only be applied to matched procurement");
    if (record.feeSnapshots.length > 0 || record.shippingReimbursement.minor !== 0) throw new Error("Commercial snapshot is already applied");
    const shippingReimbursement = input.shippingReimbursement ?? money(0, record.gross.currency);
    if (shippingReimbursement.currency !== record.gross.currency || shippingReimbursement.minor < 0) throw new Error("Invalid shipping reimbursement");

    let serviceFeeNet = money(0, record.gross.currency);
    let serviceFeeTax = money(0, record.gross.currency);
    let serviceFeeGross = money(0, record.gross.currency);
    for (const snapshot of input.feeSnapshots) {
      if (snapshot.grossAmount.currency !== record.gross.currency) throw new Error("Fee snapshot currency mismatch");
      serviceFeeNet = addMoney(serviceFeeNet, snapshot.netAmount);
      serviceFeeTax = addMoney(serviceFeeTax, snapshot.taxAmount);
      serviceFeeGross = addMoney(serviceFeeGross, snapshot.grossAmount);
    }

    const payable = addMoney(subtractMoney(record.gross, serviceFeeGross), shippingReimbursement);
    if (payable.minor < 0) throw new Error("Commercial deductions exceed supplier payable");

    record.shippingReimbursement = shippingReimbursement;
    record.serviceFeeNet = serviceFeeNet;
    record.serviceFeeTax = serviceFeeTax;
    record.serviceFeeGross = serviceFeeGross;
    record.payable = payable;
    record.feeSnapshots = input.feeSnapshots.map((snapshot) => structuredClone(snapshot));
    record.updatedAt = input.now;

    if (shippingReimbursement.minor > 0) {
      this.#ledger.post({
        reference: `procurement-shipping-reimbursement:${record.id}`,
        createdAt: input.now,
        entries: [
          { account: "shipping_fulfilment_expense", direction: "debit", amount: shippingReimbursement, entityType: "procurement", entityId: record.id },
          { account: "vendor_payable", direction: "credit", amount: shippingReimbursement, entityType: "vendor", entityId: record.vendorId }
        ]
      });
    }
    if (serviceFeeGross.minor > 0) {
      this.#ledger.post({
        reference: `vendor-service-fee:${record.id}`,
        createdAt: input.now,
        entries: [
          { account: "vendor_payable", direction: "debit", amount: serviceFeeGross, entityType: "vendor", entityId: record.vendorId },
          { account: "platform_service_revenue", direction: "credit", amount: serviceFeeNet, entityType: "vendor", entityId: record.vendorId },
          { account: "output_vat", direction: "credit", amount: serviceFeeTax, entityType: "vendor", entityId: record.vendorId }
        ]
      });
    } else if (serviceFeeGross.minor < 0) {
      const credit = money(Math.abs(serviceFeeGross.minor), serviceFeeGross.currency);
      this.#ledger.post({
        reference: `vendor-service-credit:${record.id}`,
        createdAt: input.now,
        entries: [
          { account: "vendor_incentive_expense", direction: "debit", amount: credit, entityType: "vendor", entityId: record.vendorId },
          { account: "vendor_payable", direction: "credit", amount: credit, entityType: "vendor", entityId: record.vendorId }
        ]
      });
    }
    return structuredClone(record);
  }

  settle(input: { procurementId: string; payoutReference: string; now: number }): ProcurementRecord {
    const record = this.#required(input.procurementId);
    if (record.status !== "payable") throw new Error("Only payable procurement can be settled");
    if (!input.payoutReference.trim()) throw new Error("Payout reference is required");
    record.status = "settled";
    record.payoutReference = input.payoutReference.trim();
    record.updatedAt = input.now;
    this.#ledger.post({
      reference: `vendor-settlement:${record.id}:${record.payoutReference}`,
      createdAt: input.now,
      entries: [
        { account: "vendor_payable", direction: "debit", amount: record.payable, entityType: "vendor", entityId: record.vendorId },
        { account: "cash", direction: "credit", amount: record.payable, entityType: "vendor", entityId: record.vendorId }
      ]
    });
    return structuredClone(record);
  }

  holdOrderForDispute(input: { orderId: string; disputeReference: string; now: number }): readonly ProcurementRecord[] {
    if (!input.disputeReference.trim()) throw new Error("Dispute reference is required");
    const held: ProcurementRecord[] = [];
    for (const record of this.#records.values()) {
      if (record.orderId !== input.orderId || record.status === "settled" || record.status === "reversed") continue;
      if (record.status !== "disputed") {
        record.statusBeforeDispute = record.status;
        record.status = "disputed";
        record.disputeReference = input.disputeReference.trim();
        record.updatedAt = input.now;
      } else if (record.disputeReference !== input.disputeReference.trim()) {
        throw new Error(`Procurement ${record.id} is already held by another dispute`);
      }
      held.push(structuredClone(record));
    }
    return held;
  }

  releaseOrderDispute(input: { orderId: string; disputeReference: string; now: number }): readonly ProcurementRecord[] {
    const released: ProcurementRecord[] = [];
    for (const record of this.#records.values()) {
      if (record.orderId !== input.orderId || record.status !== "disputed" || record.disputeReference !== input.disputeReference) continue;
      record.status = record.statusBeforeDispute ?? "accrued";
      record.statusBeforeDispute = undefined;
      record.disputeReference = undefined;
      record.updatedAt = input.now;
      released.push(structuredClone(record));
    }
    return released;
  }

  recoverChargebackFromHeldPayables(input: { orderId: string; disputeReference: string; amount: Money; reason: string; now: number }): readonly ProcurementRecord[] {
    if (input.amount.minor <= 0) throw new Error("Chargeback recovery amount must be positive");
    if (!input.reason.trim()) throw new Error("Chargeback recovery requires a reason");
    const held = [...this.#records.values()].filter((record) => record.orderId === input.orderId && record.status === "disputed" && record.disputeReference === input.disputeReference);
    if (held.length === 0) throw new Error("No unsettled supplier payables are held for this dispute");
    const totalAvailable = held.reduce((sum, record) => {
      if (record.payable.currency !== input.amount.currency) throw new Error("Chargeback recovery currency mismatch");
      return sum + record.payable.minor;
    }, 0);
    if (input.amount.minor > totalAvailable) throw new Error("Chargeback recovery exceeds held supplier payables");

    let remaining = input.amount.minor;
    const updated: ProcurementRecord[] = [];
    for (const record of held) {
      const recoveryMinor = Math.min(remaining, record.payable.minor);
      if (recoveryMinor <= 0) continue;
      const recovery = money(recoveryMinor, input.amount.currency);
      record.payable = subtractMoney(record.payable, recovery);
      record.adjustments.push({
        id: id("padj"), type: "chargeback_recovery", net: recovery, tax: money(0, recovery.currency), gross: recovery,
        reason: input.reason.trim(), createdAt: input.now
      });
      record.updatedAt = input.now;
      this.#ledger.post({
        reference: `chargeback-vendor-recovery:${record.id}:${input.disputeReference}`,
        createdAt: input.now,
        entries: [
          { account: "vendor_payable", direction: "debit", amount: recovery, entityType: "vendor", entityId: record.vendorId },
          { account: "chargeback_recovery", direction: "credit", amount: recovery, entityType: "order", entityId: record.orderId }
        ]
      });
      remaining -= recoveryMinor;
      updated.push(structuredClone(record));
      if (remaining === 0) break;
    }
    return updated;
  }

  record(idValue: string): ProcurementRecord {
    return structuredClone(this.#required(idValue));
  }

  recordsForVendor(vendorId: string): readonly ProcurementRecord[] {
    return [...this.#records.values()].filter((record) => record.vendorId === vendorId).map((record) => structuredClone(record));
  }

  recordsForOrder(orderId: string): readonly ProcurementRecord[] {
    return [...this.#records.values()].filter((record) => record.orderId === orderId).map((record) => structuredClone(record));
  }

  all(): readonly ProcurementRecord[] {
    return [...this.#records.values()].map((record) => structuredClone(record));
  }

  #accrueLine(orderId: string, line: OrderLine, now: number): ProcurementRecord {
    const quantity = line.fulfilledQuantity;
    const net = multiplyMoney(line.supplierUnitPrice, quantity);
    const tax = applyBasisPoints(net, line.supplierTaxRateBps);
    const gross = addMoney(net, tax);
    const record: ProcurementRecord = {
      id: id("proc"),
      orderId,
      orderLineId: line.id,
      vendorId: line.vendorId,
      supplierUnitNet: line.supplierUnitPrice,
      supplierTaxRateBps: line.supplierTaxRateBps,
      accruedQuantity: quantity,
      reversedQuantity: 0,
      net,
      tax,
      gross,
      shippingReimbursement: money(0, gross.currency),
      serviceFeeNet: money(0, gross.currency),
      serviceFeeTax: money(0, gross.currency),
      serviceFeeGross: money(0, gross.currency),
      payable: gross,
      feeSnapshots: [],
      status: "accrued",
      postSettlementReturnReceivable: money(0, gross.currency),
      adjustments: [],
      createdAt: now,
      updatedAt: now
    };
    this.#records.set(record.id, record);
    this.#lineIndex.set(line.id, record.id);
    this.#ledger.post({
      reference: `procurement-accrual:${record.id}`,
      createdAt: now,
      entries: [
        { account: "cost_of_goods", direction: "debit", amount: net, entityType: "order_line", entityId: line.id },
        { account: "input_vat", direction: "debit", amount: tax, entityType: "order_line", entityId: line.id },
        { account: "vendor_payable", direction: "credit", amount: gross, entityType: "vendor", entityId: line.vendorId }
      ]
    });
    return structuredClone(record);
  }

  #required(idValue: string): ProcurementRecord {
    const record = this.#records.get(idValue);
    if (!record) throw new Error("Procurement record not found");
    return record;
  }
}
