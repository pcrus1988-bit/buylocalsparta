export type SearchDocumentType = "product" | "vendor" | "category" | "advice";

export type SearchDocument = Readonly<{
  id: string;
  type: SearchDocumentType;
  marketId: string;
  title: string;
  titleEl?: string;
  titleEn?: string;
  body?: string;
  brand?: string;
  model?: string;
  identifiers?: readonly string[];
  categoryCodes?: readonly string[];
  synonyms?: readonly string[];
  available?: boolean;
  pickupToday?: boolean;
  adviceAvailable?: boolean;
  priceMinor?: number;
  vendorId?: string;
  attributes?: Readonly<Record<string, string>>;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type SearchQuery = Readonly<{
  marketId: string;
  q: string;
  type?: SearchDocumentType | "all";
  availability?: "any" | "in_stock" | "pickup_today";
  adviceOnly?: boolean;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  categoryCode?: string;
  attributeFilters?: Readonly<Record<string, string | readonly string[]>>;
  limit?: number;
}>;

export type SearchHit = Readonly<{
  document: SearchDocument;
  score: number;
  reasons: readonly string[];
}>;
