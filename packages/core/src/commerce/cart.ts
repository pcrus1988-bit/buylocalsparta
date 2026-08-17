import { id } from "../common/ids.ts";
import { FairVendorExposureEngine } from "../fairness/engine.ts";
import type { FulfilmentMode } from "../fairness/types.ts";
import { InventoryEngine } from "../inventory/engine.ts";
import { offerStockIsFresh } from "../inventory/freshness.ts";
import type { SupplierOffer } from "./types.ts";

export type CartItem = {
  id: string;
  canonicalVariantId: string;
  quantity: number;
  assignedOfferId: string;
  vendorId: string;
  locationId: string;
  retailUnitPriceOverride?: import("../common/money.ts").Money;
  sourceReference?: string;
  addedAt: number;
  updatedAt: number;
};

export type Cart = {
  id: string;
  marketId: string;
  visitorKey: string;
  userId?: string;
  postcode: string;
  fulfilmentMode: FulfilmentMode;
  couponCode?: string;
  items: CartItem[];
  createdAt: number;
  updatedAt: number;
};

export type CartOfferRuntimeResolver = (offer: SupplierOffer, context: { marketId: string; postcode: string; fulfilmentMode: FulfilmentMode; now: number }) => boolean | Readonly<{ canServe: boolean; capacityOpen?: boolean; capacityWeight?: number }>;

export class CartService {
  readonly #fairness: FairVendorExposureEngine;
  readonly #inventory: InventoryEngine;
  readonly #runtimeResolver?: CartOfferRuntimeResolver;
  readonly #carts = new Map<string, Cart>();
  readonly #visitorIndex = new Map<string, string>();
  readonly #offersByVariant = new Map<string, SupplierOffer[]>();

  constructor(fairness: FairVendorExposureEngine, inventory: InventoryEngine, runtimeResolver?: CartOfferRuntimeResolver) {
    this.#fairness = fairness;
    this.#inventory = inventory;
    this.#runtimeResolver = runtimeResolver;
  }

  registerVariantOffers(variantId: string, offers: readonly SupplierOffer[]): void {
    this.#offersByVariant.set(variantId, [...offers]);
  }

  upsertVariantOffer(variantId: string, offer: SupplierOffer): void {
    const offers = [...(this.#offersByVariant.get(variantId) ?? [])];
    const index = offers.findIndex((entry) => entry.offerId === offer.offerId);
    if (index >= 0) offers[index] = offer;
    else offers.push(offer);
    this.#offersByVariant.set(variantId, offers);
  }

  variantOffers(variantId: string): readonly SupplierOffer[] {
    return [...(this.#offersByVariant.get(variantId) ?? [])].map((offer) => structuredClone(offer));
  }

  getOrCreate(input: { marketId: string; visitorKey: string; postcode: string; fulfilmentMode?: FulfilmentMode; userId?: string; now: number }): Cart {
    const key = `${input.marketId}:${input.visitorKey}`;
    const existingId = this.#visitorIndex.get(key);
    if (existingId) {
      const cart = this.#required(existingId);
      if (input.userId) cart.userId = input.userId;
      cart.postcode = input.postcode;
      cart.fulfilmentMode = input.fulfilmentMode ?? cart.fulfilmentMode;
      cart.updatedAt = input.now;
      return structuredClone(cart);
    }
    const cart: Cart = {
      id: id("cart"),
      marketId: input.marketId,
      visitorKey: input.visitorKey,
      userId: input.userId,
      postcode: input.postcode,
      fulfilmentMode: input.fulfilmentMode ?? "pickup",
      items: [],
      createdAt: input.now,
      updatedAt: input.now
    };
    this.#carts.set(cart.id, cart);
    this.#visitorIndex.set(key, cart.id);
    return structuredClone(cart);
  }

  add(input: { cartId: string; canonicalVariantId: string; quantity: number; now: number }): Cart {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Cart quantity must be positive");
    const cart = this.#required(input.cartId);
    const existing = cart.items.find((item) => item.canonicalVariantId === input.canonicalVariantId);
    const totalQuantity = (existing?.quantity ?? 0) + input.quantity;
    const offers = this.#liveOffers(input.canonicalVariantId, input.now, cart);
    const assignment = this.#fairness.select({
      marketId: cart.marketId,
      canonicalVariantId: input.canonicalVariantId,
      visitorKey: cart.visitorKey,
      postcode: cart.postcode,
      desiredFulfilment: cart.fulfilmentMode,
      now: input.now,
      reason: "add_to_cart"
    }, offers);
    if (this.#inventory.availableToSell(assignment.offerId) < totalQuantity) throw new Error("Requested cart quantity exceeds current local stock");
    if (existing) {
      existing.quantity = totalQuantity;
      existing.assignedOfferId = assignment.offerId;
      existing.vendorId = assignment.vendorId;
      existing.locationId = assignment.locationId;
      existing.updatedAt = input.now;
    } else {
      cart.items.push({
        id: id("ci"),
        canonicalVariantId: input.canonicalVariantId,
        quantity: input.quantity,
        assignedOfferId: assignment.offerId,
        vendorId: assignment.vendorId,
        locationId: assignment.locationId,
        addedAt: input.now,
        updatedAt: input.now
      });
    }
    cart.updatedAt = input.now;
    return structuredClone(cart);
  }

  addLocked(input: {
    cartId: string;
    canonicalVariantId: string;
    quantity: number;
    lockedOfferId: string;
    retailUnitPriceOverride: import("../common/money.ts").Money;
    sourceReference: string;
    now: number;
  }): Cart {
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Cart quantity must be positive");
    if (!input.sourceReference.trim()) throw new Error("Special offer source reference is required");
    const cart = this.#required(input.cartId);
    const offer = this.#liveOffers(input.canonicalVariantId, input.now, cart).find((entry) => entry.offerId === input.lockedOfferId);
    if (!offer) throw new Error("Locked offer does not belong to canonical variant");
    const eligibility = this.#fairness.evaluateEligibility(offer);
    if (!eligibility.eligible) throw new Error(`Locked supplier offer is no longer eligible: ${eligibility.reasons.join(",")}`);
    if (this.#inventory.availableToSell(offer.offerId) < input.quantity) throw new Error("Requested cart quantity exceeds current local stock");
    const existing = cart.items.find((item) => item.canonicalVariantId === input.canonicalVariantId);
    if (existing) {
      existing.quantity = input.quantity;
      existing.assignedOfferId = offer.offerId;
      existing.vendorId = offer.vendorId;
      existing.locationId = offer.locationId;
      existing.retailUnitPriceOverride = input.retailUnitPriceOverride;
      existing.sourceReference = input.sourceReference;
      existing.updatedAt = input.now;
    } else {
      cart.items.push({
        id: id("ci"),
        canonicalVariantId: input.canonicalVariantId,
        quantity: input.quantity,
        assignedOfferId: offer.offerId,
        vendorId: offer.vendorId,
        locationId: offer.locationId,
        retailUnitPriceOverride: input.retailUnitPriceOverride,
        sourceReference: input.sourceReference,
        addedAt: input.now,
        updatedAt: input.now
      });
    }
    cart.updatedAt = input.now;
    return structuredClone(cart);
  }


  setCoupon(input: { cartId: string; couponCode?: string; now: number }): Cart {
    const cart = this.#required(input.cartId);
    cart.couponCode = input.couponCode?.trim() || undefined;
    cart.updatedAt = input.now;
    return structuredClone(cart);
  }

  setQuantity(input: { cartId: string; itemId: string; quantity: number; now: number }): Cart {
    const cart = this.#required(input.cartId);
    const item = cart.items.find((entry) => entry.id === input.itemId);
    if (!item) throw new Error("Cart item not found");
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) throw new Error("Cart quantity must be a non-negative integer");
    if (input.quantity === 0) return this.remove({ cartId: cart.id, itemId: item.id, now: input.now });
    if (this.#inventory.availableToSell(item.assignedOfferId) < input.quantity) throw new Error("Requested cart quantity exceeds current local stock");
    item.quantity = input.quantity;
    item.updatedAt = input.now;
    cart.updatedAt = input.now;
    return structuredClone(cart);
  }

  remove(input: { cartId: string; itemId: string; now: number }): Cart {
    const cart = this.#required(input.cartId);
    const before = cart.items.length;
    cart.items = cart.items.filter((item) => item.id !== input.itemId);
    if (cart.items.length === before) throw new Error("Cart item not found");
    cart.updatedAt = input.now;
    return structuredClone(cart);
  }

  clear(cartId: string, now: number): Cart {
    const cart = this.#required(cartId);
    cart.items = [];
    cart.couponCode = undefined;
    cart.updatedAt = now;
    return structuredClone(cart);
  }

  get(cartId: string): Cart {
    return structuredClone(this.#required(cartId));
  }

  forVisitor(marketId: string, visitorKey: string): Cart | undefined {
    const idValue = this.#visitorIndex.get(`${marketId}:${visitorKey}`);
    return idValue ? this.get(idValue) : undefined;
  }

  #liveOffers(variantId: string, now: number, cart: Pick<Cart, "marketId" | "postcode" | "fulfilmentMode">): SupplierOffer[] {
    const offers = this.#offersByVariant.get(variantId) ?? [];
    return offers.map((offer) => {
      const resolved = this.#runtimeResolver?.(offer, { marketId: cart.marketId, postcode: cart.postcode, fulfilmentMode: cart.fulfilmentMode, now });
      const runtime = typeof resolved === "boolean" ? { canServe: resolved } : resolved ?? { canServe: true };
      return { ...offer, availableToSell: this.#inventory.availableToSell(offer.offerId), stockFresh: offerStockIsFresh(offer, now), canServe: offer.canServe && runtime.canServe, capacityOpen: offer.capacityOpen && (runtime.capacityOpen ?? true), capacityWeight: runtime.capacityWeight ?? offer.capacityWeight };
    });
  }

  #required(cartId: string): Cart {
    const cart = this.#carts.get(cartId);
    if (!cart) throw new Error("Cart not found");
    return cart;
  }
}
