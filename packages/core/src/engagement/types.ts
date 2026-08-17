export type SavedProductAlertPreference = Readonly<{
  id: string;
  userId: string;
  canonicalVariantId: string;
  backInStockEnabled: boolean;
  priceDropEnabled: boolean;
  minimumPriceDropMinor: number;
  lastObservedAvailable: boolean;
  lastObservedPriceMinor: number;
  lastObservedAt: number;
  createdAt: number;
  updatedAt: number;
}>;

export type SavedProductAlertEvent = Readonly<{
  id: string;
  preferenceId: string;
  userId: string;
  canonicalVariantId: string;
  type: "back_in_stock" | "price_drop";
  previousAvailable?: boolean;
  available?: boolean;
  previousPriceMinor?: number;
  priceMinor?: number;
  priceDropMinor?: number;
  createdAt: number;
}>;

export type SavedSearchQuery = Readonly<{
  q: string;
  availability?: "any" | "in_stock" | "pickup_today";
  adviceOnly?: boolean;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  categoryCode?: string;
  attributeFilters?: Readonly<Record<string, string | readonly string[]>>;
}>;

export type SavedSearch = Readonly<{
  id: string;
  userId: string;
  marketId: string;
  name: string;
  query: SavedSearchQuery;
  alertsEnabled: boolean;
  seenCanonicalVariantIds: readonly string[];
  lastObservedCount: number;
  lastObservedAt: number;
  createdAt: number;
  updatedAt: number;
}>;

export type SavedSearchAlertEvent = Readonly<{
  id: string;
  savedSearchId: string;
  userId: string;
  canonicalVariantId: string;
  type: "new_match";
  createdAt: number;
}>;

export type RecommendationProduct = Readonly<{
  canonicalVariantId: string;
  categoryCode: string;
  brand?: string;
  available: boolean;
  adviceAvailable?: boolean;
}>;

export type RecommendationSignal = Readonly<{
  canonicalVariantId: string;
  categoryCode: string;
  brand?: string;
  viewedAt?: number;
}>;

export type CustomerRecommendation = Readonly<{
  canonicalVariantId: string;
  score: number;
  reasons: readonly string[];
  explanation: string;
}>;
