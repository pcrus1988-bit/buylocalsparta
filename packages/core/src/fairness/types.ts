export type FulfilmentMode = "pickup" | "local_delivery" | "shipping" | "bulky_special";

export type EligibleOffer = Readonly<{
  offerId: string;
  vendorId: string;
  locationId: string;
  canonicalVariantId: string;
  marketId: string;
  approved: boolean;
  vendorActive: boolean;
  locationActive: boolean;
  productAllowed: boolean;
  availableToSell: number;
  stockFresh: boolean;
  canServe: boolean;
  costWithinCeiling: boolean;
  capacityOpen: boolean;
  capacityWeight?: number;
  fulfilmentMode: FulfilmentMode;
  fulfilmentFit: number;
  stockConfirmedAt: number;
  stockTtlMs?: number;
}>;

export type AssignmentContext = Readonly<{
  marketId: string;
  canonicalVariantId: string;
  visitorKey: string;
  postcode: string;
  desiredFulfilment: FulfilmentMode;
  now: number;
  reason: "product_view" | "search_card" | "recommendation_card" | "add_to_cart" | "chat" | "appointment" | "counteroffer" | "checkout" | "rescue";
}>;

export type EligibilityReason =
  | "offer_not_approved"
  | "vendor_inactive"
  | "location_inactive"
  | "product_not_allowed"
  | "out_of_stock"
  | "stock_stale"
  | "cannot_serve_context"
  | "cost_above_ceiling"
  | "capacity_closed";

export type EligibilityDecision = Readonly<{
  eligible: boolean;
  reasons: readonly EligibilityReason[];
}>;

export type Assignment = Readonly<{
  offerId: string;
  vendorId: string;
  locationId: string;
  canonicalVariantId: string;
  selectedAt: number;
  stickyUntil: number;
  reusedStickyAssignment: boolean;
  reason: string;
  eligibleVendorIds: readonly string[];
  deficitsAfterSelection: Readonly<Record<string, number>>;
  eligibilityByOffer: Readonly<Record<string, EligibilityDecision>>;
}>;
