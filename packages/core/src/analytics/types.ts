export type AnalyticsEventName =
  | "search.performed"
  | "search.result_clicked"
  | "product.impression"
  | "product.viewed"
  | "cart.item_added"
  | "checkout.authorised"
  | "order.vendor_attributed"
  | "advice.started"
  | "appointment.booked"
  | "counteroffer.requested"
  | "counteroffer.offer_sent"
  | "counteroffer.accepted";

export type AnalyticsEvent = Readonly<{
  id: string;
  eventName: AnalyticsEventName;
  marketId: string;
  occurredAt: number;
  visitorHash?: string;
  customerId?: string;
  vendorId?: string;
  canonicalVariantId?: string;
  orderId?: string;
  searchEventId?: string;
  valueMinor?: number;
  quantity?: number;
  metadata: Readonly<Record<string, unknown>>;
  dedupeKey?: string;
}>;

export type SearchDemandRow = Readonly<{
  query: string;
  normalizedQuery: string;
  searches: number;
  zeroResults: number;
  clicks: number;
  resultCountTotal: number;
  successRate: number;
  clickThroughRate: number;
}>;

export type MarketAnalyticsReport = Readonly<{
  marketId: string;
  from: number;
  to: number;
  searches: number;
  successfulSearches: number;
  zeroResultSearches: number;
  searchSuccessRate: number;
  searchClickThroughRate: number;
  productImpressions: number;
  productViews: number;
  cartAdds: number;
  authorisedOrders: number;
  gmvMinor: number;
  averageOrderValueMinor: number;
  adviceStarts: number;
  appointmentsBooked: number;
  counterofferRequests: number;
  counterofferOffers: number;
  counterofferAccepted: number;
  counterofferConversionRate: number;
  topQueries: readonly SearchDemandRow[];
  topZeroResultQueries: readonly SearchDemandRow[];
  categoryDemand: readonly Readonly<{ categoryCode: string; searches: number; productViews: number; cartAdds: number }>[];
}>;

export type VendorAnalyticsReport = Readonly<{
  marketId: string;
  vendorId: string;
  from: number;
  to: number;
  qualifiedImpressions: number;
  productViews: number;
  cartAdds: number;
  attributedOrders: number;
  attributedUnits: number;
  attributedRetailSalesMinor: number;
  adviceStarts: number;
  appointmentsBooked: number;
  counterofferRequests: number;
  counterofferOffers: number;
  counterofferAccepted: number;
}>;
