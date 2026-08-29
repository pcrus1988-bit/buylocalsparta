export const OPEN_ICECAT_GREEK_LOCALE = "EL";
export const OPEN_ICECAT_GREEK_FULL_INDEX_URL = "https://data.icecat.biz/export/freexml/EL/files.index.csv.gz";
export const OPEN_ICECAT_GREEK_DAILY_INDEX_URL = "https://data.icecat.biz/export/freexml/EL/daily.index.csv.gz";

export type IcecatFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type OpenIcecatClientConfig = Readonly<{
  username: string;
  apiToken: string;
  contentToken?: string;
  endpoint?: string;
  fetch?: IcecatFetch;
  requestTimeoutMs?: number;
}>;

export type IcecatTextOrigin = "ICECAT_NATIVE_EL" | "TRANSLATED_VERIFIED" | "ICECAT_SOURCE_FALLBACK";

export type IcecatLocalizedText = Readonly<{
  value: string;
  locale: string;
  origin: IcecatTextOrigin;
}>;

export type IcecatSpecification = Readonly<{
  key: string;
  name: IcecatLocalizedText;
  value: IcecatLocalizedText;
  rawValue?: string;
  unit?: string;
  searchable?: boolean;
}>;

export type IcecatImage = Readonly<{
  url: string;
  kind: "primary" | "gallery";
}>;

export type GreekProductContentQuality = Readonly<{
  score: number;
  status: "READY" | "NEEDS_ENRICHMENT";
  required: Readonly<{
    title: boolean;
    description: boolean;
    category: boolean;
    specifications: boolean;
  }>;
  missing: readonly ("title" | "description" | "category" | "specifications")[];
}>;

export type OpenIcecatProductDraft = Readonly<{
  icecatId?: string;
  gtins: readonly string[];
  primaryGtin: string;
  brand?: string;
  brandPartCode?: string;
  productName?: IcecatLocalizedText;
  title: IcecatLocalizedText;
  description?: IcecatLocalizedText;
  category?: IcecatLocalizedText;
  specifications: readonly IcecatSpecification[];
  images: readonly IcecatImage[];
  variants: readonly Readonly<{
    id?: string;
    identifiers: readonly Readonly<{ type: string; value: string; approved?: boolean }>[];
  }>[];
  sourceLocale: "EL";
  sourcePayload: Readonly<Record<string, unknown>>;
  greekQuality: GreekProductContentQuality;
}>;

export type GreekProductLocalizationInput = Readonly<{
  title?: string;
  description?: string;
  category?: string;
  specifications?: readonly Readonly<{
    key: string;
    name: string;
    value: string;
    rawValue?: string;
    unit?: string;
    searchable?: boolean;
  }>[];
}>;

export type VerifiedSourceSpecification = Readonly<{
  key: string;
  name: string;
  value: string;
  rawValue?: string;
  unit?: string;
  searchable?: boolean;
}>;

export type OpenIcecatSourceProduct = Readonly<{
  brand?: string;
  brandPartCode?: string;
  title: string;
  description?: string;
  category?: string;
  specifications: readonly VerifiedSourceSpecification[];
}>;

export type GreekProductLocalizer = (
  input: Readonly<{
    gtin: string;
    brand?: string;
    brandPartCode?: string;
    sourceTitle: string;
    sourceDescription?: string;
    sourceCategory?: string;
    sourceSpecifications: readonly VerifiedSourceSpecification[];
  }>
) => Promise<GreekProductLocalizationInput>;

export type OpenIcecatIndexEntry = Readonly<{
  path: string;
  productId: string;
  updated?: string;
  quality?: string;
  supplierId?: string;
  productCode?: string;
  categoryId?: string;
  mappedProductCode?: string;
  gtins: readonly string[];
  onMarket?: boolean;
  countryMarkets: readonly string[];
  modelName?: string;
  productViews?: number;
  highPic?: string;
  gtinsApproved?: boolean;
  limited?: boolean;
}>;

export type OpenIcecatIndexFilter = Readonly<{
  requireOnMarket?: boolean;
  requireApprovedGtin?: boolean;
  country?: string;
  qualities?: readonly string[];
}>;
