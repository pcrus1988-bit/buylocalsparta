import type { SqlPool, SqlRow } from "@buy-local-sparta/core";
import {
  MolliePaymentsClient,
  type MollieAddress,
  type MolliePaymentLine
} from "@buy-local-sparta/mollie-payments";

type CreatePaymentInput = Parameters<MolliePaymentsClient["createPayment"]>[0];

/**
 * Keeps Mollie's hosted checkout method selection generic while supplying the
 * order/customer data that BNPL methods such as Klarna require for eligibility.
 *
 * No `method` is forced here. Mollie remains responsible for displaying every
 * enabled method that is valid for the shopper, amount and billing country.
 */
export class MollieHostedCheckoutGateway {
  readonly #pool: SqlPool;
  readonly #client: MolliePaymentsClient;

  constructor(pool: SqlPool, client: MolliePaymentsClient) {
    this.#pool = pool;
    this.#client = client;
  }

  get environment() { return this.#client.environment; }

  async createPayment(input: CreatePaymentInput) {
    const context = await this.#checkoutContext(input.orderId, input.amountMinor);
    return this.#client.createPayment({
      ...input,
      // Do not set `method`: this is intentionally a multi-method hosted checkout.
      lines: context.lines,
      billingAddress: context.billingAddress,
      shippingAddress: context.shippingAddress
    });
  }

  retrievePayment(...args: Parameters<MolliePaymentsClient["retrievePayment"]>) {
    return this.#client.retrievePayment(...args);
  }

  refund(...args: Parameters<MolliePaymentsClient["refund"]>) {
    return this.#client.refund(...args);
  }

  retrieveRefund(...args: Parameters<MolliePaymentsClient["retrieveRefund"]>) {
    return this.#client.retrieveRefund(...args);
  }

  cancelPayment(...args: Parameters<MolliePaymentsClient["cancelPayment"]>) {
    return this.#client.cancelPayment(...args);
  }

  createCapture(...args: Parameters<MolliePaymentsClient["createCapture"]>) {
    return this.#client.createCapture(...args);
  }

  releaseAuthorization(...args: Parameters<MolliePaymentsClient["releaseAuthorization"]>) {
    return this.#client.releaseAuthorization(...args);
  }

  async #checkoutContext(orderId: string, payableMinor: number): Promise<{
    lines: readonly MolliePaymentLine[];
    billingAddress?: MollieAddress;
    shippingAddress?: MollieAddress;
  }> {
    const order = await this.#pool.query<SqlRow>(`
      SELECT o.id::text AS order_uuid,o.shipping_minor,o.discount_minor,
             o.billing_address_snapshot,o.shipping_address_snapshot,u.email,
             COALESCE((SELECT SUM(-gcl.amount_minor)
                       FROM gift_card_ledger gcl
                       WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0) AS gift_card_minor
        FROM customer_orders o
        LEFT JOIN users u ON u.id=o.user_id
       WHERE o.public_id=$1
       LIMIT 1
    `, [orderId]);
    if (!order.rowCount) throw new Error("ORDER_NOT_FOUND");
    const row = order.rows[0];
    const orderUuid = requiredText(row.order_uuid, "order_uuid");
    const email = optionalText(row.email);

    const result = await this.#pool.query<SqlRow>(`
      SELECT ol.public_id,ol.quantity,ol.retail_unit_price_minor,ol.tax_rate_bps,ol.tax_minor,
             COALESCE(ol.product_snapshot->>'title',cv.public_id) AS title,cv.public_id AS sku
        FROM order_lines ol
        JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
       WHERE ol.order_id=$1 AND ol.status<>'cancelled'
       ORDER BY ol.created_at,ol.public_id
    `, [orderUuid]);
    if (!result.rowCount) throw new Error("Mollie payment requires at least one order line");

    const lines: MolliePaymentLine[] = result.rows.map((line) => {
      const quantity = integer(line.quantity, "line.quantity");
      const unitPriceMinor = integer(line.retail_unit_price_minor, "line.retail_unit_price_minor");
      const taxRateBps = integer(line.tax_rate_bps, "line.tax_rate_bps");
      return {
        type: "physical",
        description: requiredText(line.title, "line.title").slice(0, 255),
        quantity,
        unitPriceMinor,
        totalAmountMinor: unitPriceMinor * quantity,
        vatRate: (taxRateBps / 100).toFixed(2),
        vatAmountMinor: integer(line.tax_minor, "line.tax_minor"),
        sku: optionalText(line.sku)
      };
    });

    const shippingMinor = integer(row.shipping_minor ?? 0, "shipping_minor");
    const discountMinor = integer(row.discount_minor ?? 0, "discount_minor");
    const giftCardMinor = integer(row.gift_card_minor ?? 0, "gift_card_minor");
    if (shippingMinor > 0) {
      lines.push({ type: "shipping_fee", description: "Shipping / delivery", quantity: 1, unitPriceMinor: shippingMinor, totalAmountMinor: shippingMinor, vatRate: "0.00", vatAmountMinor: 0 });
    }
    if (discountMinor > 0) {
      lines.push({ type: "discount", description: "Order discount", quantity: 1, unitPriceMinor: -discountMinor, totalAmountMinor: -discountMinor, vatRate: "0.00", vatAmountMinor: 0 });
    }
    if (giftCardMinor > 0) {
      lines.push({ type: "discount", description: "KONTA MOY Gift Card", quantity: 1, unitPriceMinor: -giftCardMinor, totalAmountMinor: -giftCardMinor, vatRate: "0.00", vatAmountMinor: 0 });
    }

    // Keep Mollie's line total exactly equal to the amount being charged. This
    // also makes the adapter tolerant of legacy orders that contain a small
    // order-level adjustment not represented by the standard columns above.
    const representedMinor = lines.reduce((sum, line) => sum + line.totalAmountMinor, 0);
    const adjustmentMinor = payableMinor - representedMinor;
    if (adjustmentMinor !== 0) {
      lines.push({
        type: adjustmentMinor > 0 ? "surcharge" : "discount",
        description: "Order adjustment",
        quantity: 1,
        unitPriceMinor: adjustmentMinor,
        totalAmountMinor: adjustmentMinor,
        vatRate: "0.00",
        vatAmountMinor: 0
      });
    }

    const billingSnapshot = jsonObject(row.billing_address_snapshot);
    const shippingSnapshot = jsonObject(row.shipping_address_snapshot);
    const billingAddress = addressFromSnapshot(billingSnapshot, email);
    const shippingAddress = addressFromSnapshot(shippingSnapshot, email);

    return { lines, billingAddress, shippingAddress };
  }
}

function addressFromSnapshot(snapshot: Record<string, unknown>, email?: string): MollieAddress | undefined {
  const street = optionalText(snapshot.line1);
  const postalCode = optionalText(snapshot.postcode);
  const city = optionalText(snapshot.locality);
  if (!street || !postalCode || !city) return undefined;

  const fullName = optionalText(snapshot.recipientName) ?? optionalText(snapshot.fullName);
  if (!fullName) return undefined;
  const names = fullName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (names.length < 2) return undefined;

  const line2 = optionalText(snapshot.line2);
  const country = (optionalText(snapshot.countryCode) ?? "GR").toUpperCase();
  return {
    givenName: names.slice(0, -1).join(" "),
    familyName: names.at(-1)!,
    streetAndNumber: [street, line2].filter(Boolean).join(", "),
    postalCode,
    city,
    country,
    email,
    phone: optionalText(snapshot.phone)
  };
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} missing`);
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown, label: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} invalid`);
  return result;
}
