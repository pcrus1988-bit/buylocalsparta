export type ProductCondition = "new" | "refurbished" | "used";

export type ProductIdentity = Readonly<{
  id: string;
  title: string;
  brand?: string;
  model?: string;
  mpn?: string;
  gtin?: string;
  condition: ProductCondition;
  warrantyBasis?: string;
  attributes: Readonly<Record<string, string>>;
}>;

export type MatchLevel = "exact" | "high_confidence" | "possible" | "different" | "requires_review";

export type MatchResult = Readonly<{
  level: MatchLevel;
  confidence: number;
  reasons: readonly string[];
  autoMergeAllowed: boolean;
}>;
