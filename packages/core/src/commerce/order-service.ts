import { id } from "../common/ids.ts";
import { addMoney, money, multiplyMoney, subtractMoney, sumMoney, type Money } from "../common/money.ts";
import { FairVendorExposureEngine } from "../fairness/engine.ts";
import type { EligibleOffer } from "../fairness/types.ts";
import { InventoryEngine } from "../inventory/engine.ts";
import { offerStockIsFresh } from "../inventory/freshness.ts";
import { DeliveryPricingService } from "../fulfilment/rates.ts";
import type { PaymentProvider } from "./payment.ts";
import type { CheckoutRequest, CustomerOrder, FulfilmentOrder, OrderLine, SellableVariant, SupplierOffer } from "./types.ts";
import type { ProductPriceResolution } from "../promotions/types.ts";

export type CommerceOfferRuntimeResolver = (offer: SupplierOffer, context: { marketId: string; postcode: string; fulfilmentMode: CustomerOrder["fulfilmentMode"]; now: number }) => boolean | Readonly<{ canServe: boolean; capacityOpen?: boolean; capacityWeight?: number }>;
export type CommerceRetailPriceResolver = (variant: SellableVariant, now: number) => ProductPriceResolution;

export class CommerceService {
  readonly inventory: InventoryEngine;
  readonly fairness: FairVendorExposureEngine;
  readonly payments: PaymentProvider;
  readonly deliveryPricing: DeliveryPricingService;
  readonly #variants = new Map<string, SellableVariant>();
  readonly #offersByVariant = new Map<string, SupplierOffer[]>();
  readonly #orders = new Map<string, CustomerOrder>();
  readonly #checkoutIndex = new Map<string, string>();
  readonly #runtimeResolver?: CommerceOfferRuntimeResolver;
  readonly #retailPriceResolver?: CommerceRetailPriceResolver;

  constructor(inventory: InventoryEngine, fairness: FairVendorExposureEngine, payments: PaymentProvider, deliveryPricing = new DeliveryPricingService(), runtimeResolver?: CommerceOfferRuntimeResolver, retailPriceResolver?: CommerceRetailPriceResolver) {
    this.inventory = inventory;
    this.fairness = fairness;
    this.payments = payments;
    this.deliveryPricing = deliveryPricing;
    this.#runtimeResolver = runtimeResolver;
    this.#retailPriceResolver = retailPriceResolver;
  }

  registerVariant(variant: SellableVariant, offers: readonly SupplierOffer[]): void {
    this.#variants.set(variant.id, variant);
    this.#offersByVariant.set(variant.id, [...offers]);
  }

  upsertVariantOffer(variant: SellableVariant, offer: SupplierOffer): void {
    this.#variants.set(variant.id, variant);
    const offers = [...(this.#offersByVariant.get(variant.id) ?? [])];
    const index = offers.findIndex((entry) => entry.offerId === offer.offerId);
    if (index >= 0) offers[index] = offer;
    else offers.push(offer);
    this.#offersByVariant.set(variant.id, offers);
  }

  variant(variantId: string): SellableVariant | undefined {
    const variant = this.#variants.get(variantId);
    return variant ? structuredClone(variant) : undefined;
  }

  offersForVariant(variantId: string): readonly SupplierOffer[] {
    return [...(this.#offersByVariant.get(variantId) ?? [])].map((offer) => structuredClone(offer));
  }

  checkout(request: CheckoutRequest): CustomerOrder {
    const previousOrderId = this.#checkoutIndex.get(request.checkoutKey);
    if (previousOrderId) return this.getOrder(previousOrderId);
    if (request.items.length === 0) throw new Error("Checkout requires at least one item");
    const canonicalIds = request.items.map((item) => item.canonicalVariantId);
    if (new Set(canonicalIds).size !== canonicalIds.length) throw new Error("Checkout must consolidate duplicate canonical products before order creation");

    const createdLines: OrderLine[] = [];
    try {
      for (const item of request.items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("Invalid checkout quantity");
        const variant = this.#requiredVariant(item.canonicalVariantId);
        const offers = this.#runtimeOffers(item.canonicalVariantId, request.now, { marketId: variant.marketId, postcode: request.postcode, fulfilmentMode: request.fulfilmentMode });
        let selectedOfferId: string;
        if (item.lockedOfferId) {
          const locked = offers.find((offer) => offer.offerId === item.lockedOfferId);
          if (!locked) throw new Error("Locked supplier offer does not belong to canonical variant");
          const eligibility = this.fairness.evaluateEligibility(locked);
          if (!eligibility.eligible) throw new Error(`Locked supplier offer is no longer eligible: ${eligibility.reasons.join(",")}`);
          selectedOfferId = locked.offerId;
        } else {
          const assignment = this.fairness.select(
            {
              marketId: variant.marketId,
              canonicalVariantId: variant.id,
              visitorKey: request.visitorKey,
              postcode: request.postcode,
              desiredFulfilment: request.fulfilmentMode,
              now: request.now,
              reason: "checkout"
            },
            offers
          );
          selectedOfferId = assignment.offerId;
        }
        if (item.retailUnitPriceOverride && !item.lockedOfferId) throw new Error("Private retail price requires a locked supplier offer");
        if (item.retailUnitPriceOverride && !item.sourceReference) throw new Error("Private retail price requires an auditable source reference");
        const offer = this.#requiredOffer(variant.id, selectedOfferId);
        const publicPrice = this.#retailPriceResolver?.(variant, request.now);
        const retailUnitPrice = item.retailUnitPriceOverride ?? publicPrice?.currentPrice ?? variant.platformPrice;
        if (retailUnitPrice.currency !== variant.platformPrice.currency || retailUnitPrice.minor < 0) throw new Error("Invalid retail price override");
        const reservation = this.inventory.reserve({
          offerId: offer.offerId,
          quantity: item.quantity,
          checkoutKey: request.checkoutKey,
          now: request.now
        });
        createdLines.push({
          id: id("line"),
          canonicalVariantId: variant.id,
          titleSnapshot: variant.title,
          quantity: item.quantity,
          retailUnitPrice,
          taxRateBps: variant.taxRateBps,
          categoryCodeSnapshot: variant.categoryCode,
          pricingSource: item.retailUnitPriceOverride ? "private_offer" : publicPrice?.source === "promotion" ? "promotion" : "catalog",
          sourceReference: item.sourceReference ?? (publicPrice?.source === "promotion" ? publicPrice.promotionId : undefined),
          priorPrice: item.retailUnitPriceOverride ? undefined : publicPrice?.priorPrice,
          promotionId: item.retailUnitPriceOverride ? undefined : publicPrice?.promotionId,
          discountAllocation: money(0, retailUnitPrice.currency),
          supplierUnitPrice: offer.supplierUnitPrice,
          supplierTaxRateBps: offer.supplierTaxRateBps ?? 2400,
          fulfilledQuantity: 0,
          refundedQuantity: 0,
          adjustmentRefundedAmount: money(0, retailUnitPrice.currency),
          assignedOfferId: offer.offerId,
          vendorId: offer.vendorId,
          locationId: offer.locationId,
          reservationId: reservation.id,
          status: "awaiting_vendor"
        });
      }

      const merchandiseSubtotal = sumMoney(createdLines.map((line) => multiplyMoney(line.retailUnitPrice, line.quantity)));
      let discount = money(0, merchandiseSubtotal.currency);
      if (request.discount) {
        if (!request.discount.sourceReference.trim()) throw new Error("Checkout discount source reference is required");
        if (request.discount.amount.currency !== merchandiseSubtotal.currency || request.discount.amount.minor < 0) throw new Error("Invalid checkout discount amount");
        if (request.discount.amount.minor > merchandiseSubtotal.minor) throw new Error("Checkout discount exceeds merchandise subtotal");
        const allocationByVariant = new Map(request.discount.allocations.map((allocation) => [allocation.canonicalVariantId, allocation.amount]));
        let allocatedMinor = 0;
        for (const line of createdLines) {
          const allocation = allocationByVariant.get(line.canonicalVariantId) ?? money(0, merchandiseSubtotal.currency);
          if (allocation.currency !== merchandiseSubtotal.currency || allocation.minor < 0) throw new Error("Invalid checkout discount allocation");
          const lineGross = multiplyMoney(line.retailUnitPrice, line.quantity);
          if (allocation.minor > lineGross.minor) throw new Error("Checkout discount allocation exceeds line value");
          line.discountAllocation = allocation;
          allocatedMinor += allocation.minor;
        }
        if (allocatedMinor !== request.discount.amount.minor) throw new Error("Checkout discount allocations do not reconcile");
        discount = request.discount.amount;
      }
      const marketId = this.#requiredVariant(createdLines[0].canonicalVariantId).marketId;
      const fulfilments = groupFulfilments(createdLines);
      for (const fulfilment of fulfilments) {
        const quote = this.deliveryPricing.quote({
          marketId,
          vendorId: fulfilment.vendorId,
          mode: request.fulfilmentMode,
          postcode: request.postcode,
          merchandiseSubtotal: fulfilment.merchandiseSubtotal,
          packageCount: 1,
          now: request.now
        });
        fulfilment.deliveryCharge = quote.customerCharge;
        fulfilment.waivedDeliveryAmount = quote.waivedAmount;
        fulfilment.deliveryRuleId = quote.ruleId;
        fulfilment.deliveryRuleVersion = quote.ruleVersion;
        fulfilment.deliveryQuoteId = quote.id;
      }
      const deliveryCharge = sumMoney(fulfilments.map((fulfilment) => fulfilment.deliveryCharge));
      const total = subtractMoney(addMoney(merchandiseSubtotal, deliveryCharge), discount);
      const payment = this.payments.authorise({ idempotencyKey: `checkout:${request.checkoutKey}`, amount: total });
      const order: CustomerOrder = {
        id: id("ord"),
        checkoutKey: request.checkoutKey,
        visitorKey: request.visitorKey,
        customerId: request.customerId,
        marketId,
        postcode: request.postcode,
        fulfilmentMode: request.fulfilmentMode,
        status: "authorised",
        lines: createdLines,
        fulfilments,
        paymentId: payment.id,
        merchandiseSubtotal,
        discount,
        discountSourceReference: request.discount?.sourceReference,
        deliveryCharge,
        total,
        createdAt: request.now
      };
      this.#orders.set(order.id, order);
      this.#checkoutIndex.set(request.checkoutKey, order.id);
      return structuredClone(order);
    } catch (error) {
      for (const line of createdLines) {
        try { this.inventory.release(line.reservationId, request.now, "checkout_rollback"); } catch { /* best effort rollback */ }
      }
      throw error;
    }
  }

  acceptFulfilment(orderId: string, fulfilmentId: string, now: number): CustomerOrder {
    const order = this.#requiredOrder(orderId);
    const fulfilment = this.#requiredFulfilment(order, fulfilmentId);
    if (fulfilment.status === "accepted") return structuredClone(order);
    if (fulfilment.status !== "awaiting_acceptance") throw new Error(`Cannot accept fulfilment in ${fulfilment.status}`);
    fulfilment.status = "accepted";
    for (const lineId of fulfilment.lineIds) {
      const line = this.#requiredLine(order, lineId);
      line.status = "accepted";
    }
    const activeFulfilments = order.fulfilments.filter((f) => f.status !== "rejected" && f.status !== "cancelled");
    if (activeFulfilments.length > 0 && activeFulfilments.every((f) => f.status === "accepted")) {
      this.payments.capture({ paymentId: order.paymentId, amount: order.total });
      for (const line of order.lines) {
        if (line.status === "accepted") this.inventory.consume(line.reservationId, now);
      }
      order.status = "confirmed";
    }
    return structuredClone(order);
  }

  rejectFulfilment(orderId: string, fulfilmentId: string, now: number): CustomerOrder {
    const order = this.#requiredOrder(orderId);
    const fulfilment = this.#requiredFulfilment(order, fulfilmentId);
    if (fulfilment.status !== "awaiting_acceptance") throw new Error(`Cannot reject fulfilment in ${fulfilment.status}`);
    fulfilment.status = "rejected";
    const preservedCustomerDeliveryCharge = fulfilment.deliveryCharge;
    const preservedWaivedDeliveryAmount = fulfilment.waivedDeliveryAmount;
    fulfilment.deliveryCharge = money(0, preservedCustomerDeliveryCharge.currency);
    fulfilment.waivedDeliveryAmount = money(0, preservedWaivedDeliveryAmount.currency);

    const rescueFulfilments: FulfilmentOrder[] = [];
    let rescueFailed = false;

    for (const lineId of fulfilment.lineIds) {
      const line = this.#requiredLine(order, lineId);
      this.inventory.release(line.reservationId, now, "vendor_rejection");
      this.fairness.releaseSticky({
        marketId: order.marketId,
        canonicalVariantId: line.canonicalVariantId,
        visitorKey: order.visitorKey,
        postcode: order.postcode
      });

      const allOffers = this.#runtimeOffers(line.canonicalVariantId, now, { marketId: order.marketId, postcode: order.postcode, fulfilmentMode: order.fulfilmentMode });
      const rescueOffers = allOffers.map((offer) => offer.offerId === line.assignedOfferId ? { ...offer, capacityOpen: false } : offer);
      try {
        const assignment = this.fairness.select(
          {
            marketId: order.marketId,
            canonicalVariantId: line.canonicalVariantId,
            visitorKey: order.visitorKey,
            postcode: order.postcode,
            desiredFulfilment: order.fulfilmentMode,
            now,
            reason: "rescue"
          },
          rescueOffers
        );
        const offer = this.#requiredOffer(line.canonicalVariantId, assignment.offerId);
        const reservation = this.inventory.reserve({
          offerId: offer.offerId,
          quantity: line.quantity,
          checkoutKey: `${order.checkoutKey}:rescue:${line.id}`,
          now
        });
        line.assignedOfferId = offer.offerId;
        line.vendorId = offer.vendorId;
        line.locationId = offer.locationId;
        line.supplierUnitPrice = offer.supplierUnitPrice;
        line.reservationId = reservation.id;
        line.status = "awaiting_vendor";
        rescueFulfilments.push(...groupFulfilments([line]));
      } catch {
        line.status = "cancelled";
        rescueFailed = true;
      }
    }

    if (rescueFulfilments.length > 0) {
      rescueFulfilments[0].deliveryCharge = preservedCustomerDeliveryCharge;
      rescueFulfilments[0].waivedDeliveryAmount = preservedWaivedDeliveryAmount;
      rescueFulfilments[0].deliveryRuleId = fulfilment.deliveryRuleId;
      rescueFulfilments[0].deliveryRuleVersion = fulfilment.deliveryRuleVersion;
      rescueFulfilments[0].deliveryQuoteId = fulfilment.deliveryQuoteId;
    }
    order.fulfilments.push(...rescueFulfilments);
    if (rescueFailed) order.status = "requires_customer_action";
    return structuredClone(order);
  }

  markReadyForHandover(orderId: string, fulfilmentId: string): CustomerOrder {
    const order = this.#requiredOrder(orderId);
    const fulfilment = this.#requiredFulfilment(order, fulfilmentId);
    if (order.fulfilmentMode !== "pickup") throw new Error("Ready-for-handover is only valid for pickup orders");
    if (fulfilment.status === "ready_for_handover") return structuredClone(order);
    if (!new Set(["accepted", "picking", "packed"]).has(fulfilment.status)) {
      throw new Error(`Cannot mark pickup ready in ${fulfilment.status}`);
    }
    fulfilment.status = "ready_for_handover";
    return structuredClone(order);
  }

  markShipped(orderId: string, fulfilmentId: string): CustomerOrder {
    const order = this.#requiredOrder(orderId);
    const fulfilment = this.#requiredFulfilment(order, fulfilmentId);
    if (order.fulfilmentMode !== "shipping") throw new Error("Shipped status is only valid for shipping orders");
    if (fulfilment.status === "shipped") return structuredClone(order);
    if (!new Set(["accepted", "picking", "packed"]).has(fulfilment.status)) {
      throw new Error(`Cannot ship fulfilment in ${fulfilment.status}`);
    }
    fulfilment.status = "shipped";
    return structuredClone(order);
  }

  markDelivered(orderId: string, fulfilmentId: string, now?: number): CustomerOrder {
    const order = this.#requiredOrder(orderId);
    const fulfilment = this.#requiredFulfilment(order, fulfilmentId);
    if (!new Set(["accepted", "picking", "packed", "ready_for_handover", "shipped"]).has(fulfilment.status)) {
      throw new Error(`Cannot deliver fulfilment in ${fulfilment.status}`);
    }
    fulfilment.status = "delivered";
    if (now !== undefined) fulfilment.deliveredAt = now;
    for (const lineId of fulfilment.lineIds) {
      const line = this.#requiredLine(order, lineId);
      if (line.status !== "cancelled") { line.status = "fulfilled"; line.fulfilledQuantity = line.quantity; if (now !== undefined) line.fulfilledAt = now; }
    }
    const active = order.fulfilments.filter((f) => f.status !== "rejected" && f.status !== "cancelled");
    if (active.every((f) => f.status === "delivered")) order.status = "fulfilled";
    else if (active.some((f) => f.status === "delivered")) order.status = "partially_fulfilled";
    return structuredClone(order);
  }

  refundLine(input: { orderId: string; lineId: string; quantity: number; idempotencyKey: string; now: number }): CustomerOrder {
    const order = this.#requiredOrder(input.orderId);
    const line = this.#requiredLine(order, input.lineId);
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Refund quantity must be a positive integer");
    if (line.status === "cancelled") throw new Error("Cancelled line cannot be refunded");
    const remaining = line.quantity - line.refundedQuantity;
    if (input.quantity > remaining) throw new Error("Refund quantity exceeds refundable quantity");
    const payment = this.payments.get(order.paymentId);
    if (payment.status !== "captured" && payment.status !== "partially_refunded") throw new Error("Order payment is not refundable");
    const oldRefundedQuantity = line.refundedQuantity;
    const nextRefundedQuantity = oldRefundedQuantity + input.quantity;
    const priorDiscountShare = proportionalDiscountShare(line.discountAllocation.minor, oldRefundedQuantity, line.quantity);
    const nextDiscountShare = proportionalDiscountShare(line.discountAllocation.minor, nextRefundedQuantity, line.quantity);
    const discountShare = nextDiscountShare - priorDiscountShare;
    const grossRefundAmount = multiplyMoney(line.retailUnitPrice, input.quantity);
    const refundAmount = money(grossRefundAmount.minor - discountShare, grossRefundAmount.currency);
    this.payments.refund({ paymentId: order.paymentId, idempotencyKey: input.idempotencyKey, amount: refundAmount });
    line.refundedQuantity = nextRefundedQuantity;
    if (line.refundedQuantity === line.quantity) line.status = "refunded";

    const relevantLines = order.lines.filter((entry) => entry.status !== "cancelled");
    const fullyRefunded = relevantLines.length > 0 && relevantLines.every((entry) => entry.refundedQuantity === entry.quantity);
    order.status = fullyRefunded ? "refunded" : "partially_refunded";
    return structuredClone(order);
  }

  refundLineAmount(input: { orderId: string; lineId: string; amount: Money; idempotencyKey: string; now: number }): CustomerOrder {
    const order = this.#requiredOrder(input.orderId);
    const line = this.#requiredLine(order, input.lineId);
    if (input.amount.currency !== line.retailUnitPrice.currency || input.amount.minor <= 0) throw new Error("Price reduction refund must be a positive matching-currency amount");
    if (line.status === "cancelled" || line.status === "refunded") throw new Error("Line is not eligible for a price reduction refund");
    const lineGross = multiplyMoney(line.retailUnitPrice, line.quantity);
    const currentAdjustment = line.adjustmentRefundedAmount ?? money(0, line.retailUnitPrice.currency);
    const refundedDiscountShare = proportionalDiscountShare(line.discountAllocation.minor, line.refundedQuantity, line.quantity);
    const netQuantityRefunded = (line.refundedQuantity * line.retailUnitPrice.minor) - refundedDiscountShare;
    const remainingValue = lineGross.minor - line.discountAllocation.minor - currentAdjustment.minor - netQuantityRefunded;
    if (input.amount.minor > remainingValue) throw new Error("Price reduction exceeds remaining line value");
    const payment = this.payments.get(order.paymentId);
    if (payment.status !== "captured" && payment.status !== "partially_refunded") throw new Error("Order payment is not refundable");
    this.payments.refund({ paymentId: order.paymentId, idempotencyKey: input.idempotencyKey, amount: input.amount });
    line.adjustmentRefundedAmount = addMoney(currentAdjustment, input.amount);
    order.status = "partially_refunded";
    return structuredClone(order);
  }

  cancelOrder(input: { orderId: string; reason: string; idempotencyKey: string; now: number }): CustomerOrder {
    const order = this.#requiredOrder(input.orderId);
    const reason = input.reason.trim();
    if (!reason) throw new Error("Cancellation reason is required");
    if (order.status === "cancelled") return structuredClone(order);
    if (new Set(["fulfilled", "completed", "refunded"]).has(order.status)) throw new Error(`Order cannot be cancelled in ${order.status}`);
    if (order.lines.some((line) => line.fulfilledQuantity > line.refundedQuantity || line.status === "fulfilled")) {
      throw new Error("Fulfilled items must use the return/withdrawal workflow rather than order cancellation");
    }
    if (order.fulfilments.some((fulfilment) => new Set(["ready_for_handover", "shipped", "delivered"]).has(fulfilment.status))) {
      throw new Error("Order can no longer be cancelled because physical handover has started");
    }

    const payment = this.payments.get(order.paymentId);
    if (payment.status === "authorised") {
      this.payments.cancel({ paymentId: order.paymentId, idempotencyKey: input.idempotencyKey });
    } else if (payment.status === "captured" || payment.status === "partially_refunded") {
      const remaining = subtractMoney(payment.capturedAmount, payment.refundedAmount);
      if (remaining.minor > 0) this.payments.refund({ paymentId: order.paymentId, idempotencyKey: input.idempotencyKey, amount: remaining });
    } else if (!new Set(["cancelled", "refunded"]).has(payment.status)) {
      throw new Error(`Order payment cannot be cancelled in ${payment.status}`);
    }

    const reservations = new Map(this.inventory.reservations().map((reservation) => [reservation.id, reservation]));
    for (const line of order.lines) {
      if (line.status === "cancelled" || line.status === "refunded") continue;
      const reservation = reservations.get(line.reservationId);
      if (reservation?.status === "active") this.inventory.release(reservation.id, input.now, "order_cancellation");
      else if (reservation?.status === "consumed") this.inventory.reverseConsumed(reservation.id, input.now, "order_cancellation");
      line.status = "cancelled";
    }
    for (const fulfilment of order.fulfilments) {
      if (!new Set(["rejected", "cancelled"]).has(fulfilment.status)) fulfilment.status = "cancelled";
    }
    order.status = "cancelled";
    order.cancelledAt = input.now;
    order.cancellationReason = reason;
    return structuredClone(order);
  }

  reserveSubstitution(input: { orderId: string; lineId: string; vendorId: string; proposedCanonicalVariantId: string; requestId: string; now: number }): { reservationId: string; offerId: string; vendorId: string; locationId: string; supplierUnitPrice: Money; retailUnitPrice: Money; title: string } {
    const order = this.#requiredOrder(input.orderId);
    const line = this.#requiredLine(order, input.lineId);
    if (line.vendorId !== input.vendorId) throw new Error("Only the assigned vendor can propose a substitution");
    if (!new Set(["awaiting_vendor", "accepted"]).has(line.status)) throw new Error(`Line cannot be substituted in ${line.status}`);
    const fulfilment = order.fulfilments.find((entry) => entry.lineIds.includes(line.id) && entry.vendorId === input.vendorId && entry.status !== "rejected" && entry.status !== "cancelled");
    if (!fulfilment) throw new Error("Active fulfilment for order line was not found");
    if (new Set(["ready_for_handover", "shipped", "delivered"]).has(fulfilment.status)) throw new Error("Substitution is no longer possible after handover starts");
    const variant = this.#requiredVariant(input.proposedCanonicalVariantId);
    if (variant.marketId !== order.marketId) throw new Error("Substitute product belongs to another market");
    const offers = this.#runtimeOffers(variant.id, input.now, { marketId: order.marketId, postcode: order.postcode, fulfilmentMode: order.fulfilmentMode }).filter((offer) => offer.vendorId === input.vendorId && offer.locationId === line.locationId);
    const eligible = offers.find((offer) => this.fairness.evaluateEligibility(offer).eligible);
    if (!eligible) throw new Error("Vendor has no eligible substitute offer at the assigned location");
    const reservation = this.inventory.reserve({ offerId: eligible.offerId, quantity: line.quantity, checkoutKey: `substitution:${input.requestId}`, now: input.now });
    return { reservationId: reservation.id, offerId: eligible.offerId, vendorId: eligible.vendorId, locationId: eligible.locationId, supplierUnitPrice: (this.#requiredOffer(variant.id, eligible.offerId)).supplierUnitPrice, retailUnitPrice: variant.platformPrice, title: variant.title };
  }

  applySubstitution(input: { orderId: string; lineId: string; vendorId: string; proposedCanonicalVariantId: string; proposedOfferId: string; proposedReservationId: string; retailUnitPrice: Money; sourceReference: string; now: number }): CustomerOrder {
    const order = this.#requiredOrder(input.orderId);
    const line = this.#requiredLine(order, input.lineId);
    if (line.vendorId !== input.vendorId) throw new Error("Substitution vendor no longer matches assigned order line");
    if (!new Set(["awaiting_vendor", "accepted"]).has(line.status)) throw new Error(`Line cannot be substituted in ${line.status}`);
    const variant = this.#requiredVariant(input.proposedCanonicalVariantId);
    const offer = this.#requiredOffer(variant.id, input.proposedOfferId);
    if (offer.vendorId !== input.vendorId || offer.locationId !== line.locationId) throw new Error("Substitute offer must use the same assigned vendor/location");
    if (input.retailUnitPrice.currency !== line.retailUnitPrice.currency) throw new Error("Substitute price currency mismatch");
    if (input.retailUnitPrice.minor > line.retailUnitPrice.minor) throw new Error("Higher-priced substitutions require a new customer payment flow and are not supported");
    const proposedReservation = this.inventory.reservations().find((reservation) => reservation.id === input.proposedReservationId);
    if (!proposedReservation || proposedReservation.offerId !== offer.offerId || proposedReservation.status !== "active") throw new Error("Substitute stock reservation is not active");

    const payment = this.payments.get(order.paymentId);
    const oldRetailUnitPrice = line.retailUnitPrice;
    const oldReservation = this.inventory.reservations().find((reservation) => reservation.id === line.reservationId);
    if (oldReservation?.status === "active") this.inventory.release(oldReservation.id, input.now, "approved_substitution");
    else if (oldReservation?.status === "consumed") this.inventory.reverseConsumed(oldReservation.id, input.now, "approved_substitution");

    if (payment.status === "captured" || payment.status === "partially_refunded") {
      this.inventory.consume(input.proposedReservationId, input.now);
      const reductionMinor = (oldRetailUnitPrice.minor - input.retailUnitPrice.minor) * line.quantity;
      if (reductionMinor > 0) this.payments.refund({ paymentId: order.paymentId, idempotencyKey: `substitution-refund:${input.sourceReference}`, amount: money(reductionMinor, input.retailUnitPrice.currency) });
    } else if (payment.status !== "authorised") {
      throw new Error(`Substitution cannot be applied while payment is ${payment.status}`);
    }

    line.canonicalVariantId = variant.id;
    line.titleSnapshot = variant.title;
    line.retailUnitPrice = input.retailUnitPrice;
    line.taxRateBps = variant.taxRateBps;
    line.categoryCodeSnapshot = variant.categoryCode;
    line.pricingSource = "substitution";
    line.sourceReference = input.sourceReference;
    line.supplierUnitPrice = offer.supplierUnitPrice;
    line.supplierTaxRateBps = offer.supplierTaxRateBps ?? 2400;
    line.assignedOfferId = offer.offerId;
    line.reservationId = input.proposedReservationId;

    const fulfilment = order.fulfilments.find((entry) => entry.lineIds.includes(line.id) && entry.vendorId === input.vendorId && entry.status !== "rejected" && entry.status !== "cancelled");
    if (fulfilment) fulfilment.merchandiseSubtotal = sumMoney(fulfilment.lineIds.map((lineId) => this.#requiredLine(order, lineId)).filter((entry) => entry.status !== "cancelled").map((entry) => multiplyMoney(entry.retailUnitPrice, entry.quantity)));
    order.merchandiseSubtotal = sumMoney(order.lines.filter((entry) => entry.status !== "cancelled").map((entry) => multiplyMoney(entry.retailUnitPrice, entry.quantity)));
    order.total = addMoney(order.merchandiseSubtotal, order.deliveryCharge);
    return structuredClone(order);
  }

  releaseSubstitutionReservation(reservationId: string, now: number): void {
    const reservation = this.inventory.reservations().find((entry) => entry.id === reservationId);
    if (!reservation || reservation.status !== "active") return;
    this.inventory.release(reservationId, now, "substitution_declined");
  }

  getOrder(orderId: string): CustomerOrder {
    return structuredClone(this.#requiredOrder(orderId));
  }

  orders(): readonly CustomerOrder[] {
    return [...this.#orders.values()].map((order) => structuredClone(order));
  }

  supplierAccruedValue(orderId: string, vendorId: string): Money {
    const order = this.#requiredOrder(orderId);
    const lines = order.lines.filter((line) => line.vendorId === vendorId && line.status === "fulfilled");
    return lines.reduce((acc, line) => addMoney(acc, multiplyMoney(line.supplierUnitPrice, line.quantity)), money(0));
  }

  #runtimeOffers(variantId: string, now: number, context?: { marketId: string; postcode: string; fulfilmentMode: CustomerOrder["fulfilmentMode"] }): EligibleOffer[] {
    const offers = this.#offersByVariant.get(variantId) ?? [];
    return offers.map((offer) => {
      const resolved = context ? this.#runtimeResolver?.(offer, { ...context, now }) : undefined;
      const runtime = typeof resolved === "boolean" ? { canServe: resolved } : resolved ?? { canServe: true };
      return { ...offer, availableToSell: this.inventory.availableToSell(offer.offerId), stockFresh: offerStockIsFresh(offer, now), canServe: offer.canServe && runtime.canServe, capacityOpen: offer.capacityOpen && (runtime.capacityOpen ?? true), capacityWeight: runtime.capacityWeight ?? offer.capacityWeight };
    });
  }

  #requiredVariant(variantId: string): SellableVariant {
    const variant = this.#variants.get(variantId);
    if (!variant) throw new Error(`Unknown canonical variant ${variantId}`);
    return variant;
  }

  #requiredOffer(variantId: string, offerId: string): SupplierOffer {
    const offer = (this.#offersByVariant.get(variantId) ?? []).find((entry) => entry.offerId === offerId);
    if (!offer) throw new Error(`Unknown offer ${offerId}`);
    return offer;
  }

  #requiredOrder(orderId: string): CustomerOrder {
    const order = this.#orders.get(orderId);
    if (!order) throw new Error(`Unknown order ${orderId}`);
    return order;
  }

  #requiredFulfilment(order: CustomerOrder, fulfilmentId: string): FulfilmentOrder {
    const fulfilment = order.fulfilments.find((entry) => entry.id === fulfilmentId);
    if (!fulfilment) throw new Error(`Unknown fulfilment ${fulfilmentId}`);
    return fulfilment;
  }

  #requiredLine(order: CustomerOrder, lineId: string): OrderLine {
    const line = order.lines.find((entry) => entry.id === lineId);
    if (!line) throw new Error(`Unknown order line ${lineId}`);
    return line;
  }
}

export function proportionalDiscountShare(totalDiscountMinor: number, quantity: number, totalQuantity: number): number {
  if (quantity <= 0 || totalDiscountMinor <= 0) return 0;
  if (quantity >= totalQuantity) return totalDiscountMinor;
  return Math.floor((totalDiscountMinor * quantity) / totalQuantity);
}

function groupFulfilments(lines: readonly OrderLine[]): FulfilmentOrder[] {
  const groups = new Map<string, FulfilmentOrder>();
  for (const line of lines) {
    const key = `${line.vendorId}:${line.locationId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        id: id("ful"),
        vendorId: line.vendorId,
        locationId: line.locationId,
        lineIds: [],
        merchandiseSubtotal: money(0, line.retailUnitPrice.currency),
        deliveryCharge: money(0, line.retailUnitPrice.currency),
        waivedDeliveryAmount: money(0, line.retailUnitPrice.currency),
        status: "awaiting_acceptance"
      };
      groups.set(key, group);
    }
    group.lineIds.push(line.id);
    group.merchandiseSubtotal = addMoney(group.merchandiseSubtotal, multiplyMoney(line.retailUnitPrice, line.quantity));
  }
  return [...groups.values()];
}
