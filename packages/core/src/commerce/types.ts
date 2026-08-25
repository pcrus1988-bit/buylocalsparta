import type { Money } from "../common/money.ts";
import type { EligibleOffer, FulfilmentMode } from "../fairness/types.ts";

export type SellableVariant = Readonly<{
  id: string;
  marketId: string;
  title: string;
  platformPrice: Money;
  taxRateBps: number;
  categoryCode?: string;
}>;

export type SupplierOffer = EligibleOffer & Readonly<{
  supplierUnitPrice: Money;
  supplierTaxRateBps?: number;
}>;

export type CheckoutItemRequest = Readonly<{
  canonicalVariantId: string;
  quantity: number;
  lockedOfferId?: string;
  retailUnitPriceOverride?: Money;
  sourceReference?: string;
}>;

export type CheckoutDiscount = Readonly<{
  amount: Money;
  sourceReference: string;
  allocations: readonly Readonly<{ canonicalVariantId: string; amount: Money }>[];
}>;

export type CheckoutRequest = Readonly<{
  checkoutKey: string;
  visitorKey: string;
  customerId?: string;
  postcode: string;
  fulfilmentMode: FulfilmentMode;
  items: readonly CheckoutItemRequest[];
  discount?: CheckoutDiscount;
  now: number;
}>;

export type OrderLine = {
  id: string;
  canonicalVariantId: string;
  titleSnapshot: string;
  quantity: number;
  retailUnitPrice: Money;
  taxRateBps: number;
  categoryCodeSnapshot?: string;
  pricingSource: "catalog" | "promotion" | "private_offer" | "substitution";
  sourceReference?: string;
  priorPrice?: Money;
  promotionId?: string;
  discountAllocation: Money;
  supplierUnitPrice: Money;
  supplierTaxRateBps: number;
  fulfilledQuantity: number;
  fulfilledAt?: number;
  refundedQuantity: number;
  adjustmentRefundedAmount?: Money;
  assignedOfferId: string;
  vendorId: string;
  locationId: string;
  reservationId: string;
  status: "awaiting_vendor" | "accepted" | "fulfilled" | "cancelled" | "refunded";
};

export type FulfilmentOrder = {
  id: string;
  vendorId: string;
  locationId: string;
  lineIds: string[];
  merchandiseSubtotal: Money;
  deliveryCharge: Money;
  waivedDeliveryAmount: Money;
  deliveryRuleId?: string;
  deliveryRuleVersion?: number;
  deliveryQuoteId?: string;
  status: "awaiting_acceptance" | "accepted" | "rejected" | "picking" | "packed" | "ready_for_handover" | "handed_over" | "shipped" | "delivered" | "failed" | "cancelled";
  deliveredAt?: number;
};

export type CustomerOrder = {
  id: string;
  checkoutKey: string;
  visitorKey: string;
  customerId?: string;
  marketId: string;
  postcode: string;
  fulfilmentMode: FulfilmentMode;
  status: "pending_payment" | "authorised" | "confirmed" | "requires_customer_action" | "partially_fulfilled" | "fulfilled" | "completed" | "cancelled" | "partially_refunded" | "refunded";
  lines: OrderLine[];
  fulfilments: FulfilmentOrder[];
  paymentId: string;
  merchandiseSubtotal: Money;
  discount: Money;
  discountSourceReference?: string;
  deliveryCharge: Money;
  total: Money;
  createdAt: number;
  cancelledAt?: number;
  cancellationReason?: string;
};

export type PaymentStatus = "created" | "requires_action" | "authorised" | "captured" | "failed" | "cancelled" | "partially_refunded" | "refunded" | "chargeback";

export type PaymentRecord = {
  id: string;
  idempotencyKey: string;
  authorisedAmount: Money;
  capturedAmount: Money;
  refundedAmount: Money;
  status: PaymentStatus;
};
