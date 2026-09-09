import { randomUUID } from "node:crypto";
import type { MolliePaymentsGateway } from "../packages/postgres-runtime/src/index.ts";

export class FakeMollieGateway implements MolliePaymentsGateway {
  readonly environment = "test" as const;
  createCount = 0;
  refundCount = 0;
  lastRefundId?: string;
  readonly #payments = new Map<string, Awaited<ReturnType<MolliePaymentsGateway["retrievePayment"]>>>();
  readonly #refunds = new Map<string, Awaited<ReturnType<MolliePaymentsGateway["retrieveRefund"]>>>();

  async createPayment(input: Parameters<MolliePaymentsGateway["createPayment"]>[0]) {
    this.createCount += 1;
    const paymentId = `tr_DB${String(this.createCount).padStart(8, "0")}${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const checkoutUrl = `https://www.mollie.com/checkout/${paymentId}`;
    this.#payments.set(paymentId, {
      paymentId,
      status: "open",
      amountMinor: input.amountMinor,
      amountCurrency: "EUR",
      amountRefundedMinor: 0,
      description: input.description,
      orderId: input.orderId,
      orderNumber: input.orderNumber,
      method: "creditcard",
      checkoutUrl,
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl,
      metadata: { ...(input.metadata ?? {}), orderId: input.orderId, orderNumber: input.orderNumber }
    });
    return { paymentId, status: "open" as const, checkoutUrl };
  }

  confirm(paymentId: string, _amountMinor?: number) {
    const payment = this.#payments.get(paymentId);
    if (!payment) throw new Error(`Fake Mollie payment ${paymentId} not found`);
    this.#payments.set(paymentId, { ...payment, status: "paid" });
    return paymentId;
  }

  async retrievePayment(paymentId: string) {
    const payment = this.#payments.get(paymentId);
    if (!payment) throw new Error(`Fake Mollie payment ${paymentId} not found`);
    return payment;
  }

  async refund(input: Parameters<MolliePaymentsGateway["refund"]>[0]) {
    const payment = this.#payments.get(input.paymentId);
    if (!payment) throw new Error("Fake Mollie original payment not found");
    this.refundCount += 1;
    const refundId = `re_DB${String(this.refundCount).padStart(8, "0")}${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    this.lastRefundId = refundId;
    const refund = { refundId, paymentId: input.paymentId, status: "refunded", amountMinor: input.amountMinor, amountCurrency: "EUR" };
    this.#refunds.set(`${input.paymentId}:${refundId}`, refund);
    this.#payments.set(input.paymentId, {
      ...payment,
      amountRefundedMinor: Math.min(payment.amountMinor, payment.amountRefundedMinor + input.amountMinor)
    });
    return refund;
  }

  async retrieveRefund(paymentId: string, refundId: string) {
    const refund = this.#refunds.get(`${paymentId}:${refundId}`);
    if (!refund) throw new Error(`Fake Mollie refund ${refundId} not found`);
    return refund;
  }

  async cancelPayment(paymentId: string) {
    const payment = this.#payments.get(paymentId);
    if (!payment) throw new Error(`Fake Mollie payment ${paymentId} not found`);
    const cancelled = { ...payment, status: "canceled" as const };
    this.#payments.set(paymentId, cancelled);
    return cancelled;
  }
}
