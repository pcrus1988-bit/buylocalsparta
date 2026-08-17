import { id } from "../common/ids.ts";
import { money, subtractMoney, type Money } from "../common/money.ts";
import type { PaymentRecord } from "./types.ts";

export interface PaymentProvider {
  authorise(input: { idempotencyKey: string; amount: Money }): PaymentRecord;
  capture(input: { paymentId: string; amount?: Money }): PaymentRecord;
  cancel(input: { paymentId: string; idempotencyKey: string }): PaymentRecord;
  refund(input: { paymentId: string; idempotencyKey: string; amount: Money }): PaymentRecord;
  chargeback(input: { paymentId: string; idempotencyKey: string }): PaymentRecord;
  resolveChargeback(input: { paymentId: string; outcome: "won" | "lost" }): PaymentRecord;
  get(paymentId: string): PaymentRecord;
}

export class DevPaymentProvider implements PaymentProvider {
  readonly #payments = new Map<string, PaymentRecord>();
  readonly #authorisationKeys = new Map<string, string>();
  readonly #refundKeys = new Set<string>();
  readonly #cancelKeys = new Set<string>();
  readonly #chargebackKeys = new Set<string>();

  authorise(input: { idempotencyKey: string; amount: Money }): PaymentRecord {
    const previousId = this.#authorisationKeys.get(input.idempotencyKey);
    if (previousId) return this.get(previousId);

    const record: PaymentRecord = {
      id: id("pay"),
      idempotencyKey: input.idempotencyKey,
      authorisedAmount: input.amount,
      capturedAmount: money(0, input.amount.currency),
      refundedAmount: money(0, input.amount.currency),
      status: "authorised"
    };
    this.#payments.set(record.id, record);
    this.#authorisationKeys.set(input.idempotencyKey, record.id);
    return structuredClone(record);
  }

  capture(input: { paymentId: string; amount?: Money }): PaymentRecord {
    const record = this.#required(input.paymentId);
    if (record.status === "captured") return structuredClone(record);
    if (record.status !== "authorised") throw new Error(`Cannot capture payment in ${record.status}`);
    const amount = input.amount ?? record.authorisedAmount;
    if (amount.currency !== record.authorisedAmount.currency || amount.minor > record.authorisedAmount.minor) {
      throw new Error("Capture exceeds authorisation");
    }
    record.capturedAmount = amount;
    record.status = "captured";
    return structuredClone(record);
  }

  cancel(input: { paymentId: string; idempotencyKey: string }): PaymentRecord {
    const record = this.#required(input.paymentId);
    if (this.#cancelKeys.has(input.idempotencyKey)) return structuredClone(record);
    if (record.status === "cancelled") return structuredClone(record);
    if (record.status !== "authorised") throw new Error(`Cannot cancel payment in ${record.status}`);
    record.status = "cancelled";
    this.#cancelKeys.add(input.idempotencyKey);
    return structuredClone(record);
  }

  refund(input: { paymentId: string; idempotencyKey: string; amount: Money }): PaymentRecord {
    const record = this.#required(input.paymentId);
    if (this.#refundKeys.has(input.idempotencyKey)) return structuredClone(record);
    if (record.status !== "captured" && record.status !== "partially_refunded") {
      throw new Error(`Cannot refund payment in ${record.status}`);
    }
    const remaining = subtractMoney(record.capturedAmount, record.refundedAmount);
    if (input.amount.currency !== remaining.currency || input.amount.minor > remaining.minor) {
      throw new Error("Refund exceeds captured balance");
    }
    record.refundedAmount = money(record.refundedAmount.minor + input.amount.minor, record.refundedAmount.currency);
    record.status = record.refundedAmount.minor === record.capturedAmount.minor ? "refunded" : "partially_refunded";
    this.#refundKeys.add(input.idempotencyKey);
    return structuredClone(record);
  }

  chargeback(input: { paymentId: string; idempotencyKey: string }): PaymentRecord {
    const record = this.#required(input.paymentId);
    if (this.#chargebackKeys.has(input.idempotencyKey)) return structuredClone(record);
    if (!["captured", "partially_refunded", "chargeback"].includes(record.status)) throw new Error(`Cannot open chargeback for payment in ${record.status}`);
    record.status = "chargeback";
    this.#chargebackKeys.add(input.idempotencyKey);
    return structuredClone(record);
  }

  resolveChargeback(input: { paymentId: string; outcome: "won" | "lost" }): PaymentRecord {
    const record = this.#required(input.paymentId);
    if (record.status !== "chargeback") throw new Error("Payment is not in chargeback state");
    if (input.outcome === "lost") return structuredClone(record);
    if (record.refundedAmount.minor === record.capturedAmount.minor) record.status = "refunded";
    else if (record.refundedAmount.minor > 0) record.status = "partially_refunded";
    else record.status = "captured";
    return structuredClone(record);
  }

  get(paymentId: string): PaymentRecord {
    return structuredClone(this.#required(paymentId));
  }

  #required(paymentId: string): PaymentRecord {
    const payment = this.#payments.get(paymentId);
    if (!payment) throw new Error(`Unknown payment ${paymentId}`);
    return payment;
  }
}
