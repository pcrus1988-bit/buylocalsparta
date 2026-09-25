export type ZendropScalarId = string | number;

export interface ZendropShippingEstimate {
  type?: unknown;
  cost?: unknown;
  estimated_days?: unknown;
  estimatedDays?: unknown;
  [key: string]: unknown;
}

export interface ZendropVariant {
  id?: ZendropScalarId;
  variant_id?: ZendropScalarId;
  variantId?: ZendropScalarId;
  sku?: unknown;
  barcode?: unknown;
  mpn?: unknown;
  name?: unknown;
  title?: unknown;
  price?: unknown;
  cost?: unknown;
  product_cost?: unknown;
  productCost?: unknown;
  weight?: unknown;
  dimensions?: unknown;
  inventory?: unknown;
  stock?: unknown;
  images?: unknown;
  attributes?: unknown;
  [key: string]: unknown;
}

export interface ZendropProduct {
  id?: ZendropScalarId;
  product_id?: ZendropScalarId;
  productId?: ZendropScalarId;
  name?: unknown;
  title?: unknown;
  description?: unknown;
  price?: unknown;
  suggested_retail_price?: unknown;
  suggestedRetailPrice?: unknown;
  retail_price?: unknown;
  supplier_name?: unknown;
  supplierName?: unknown;
  ships_from?: unknown;
  shipsFrom?: unknown;
  origin?: unknown;
  category?: unknown;
  category_id?: unknown;
  categoryId?: unknown;
  categories?: unknown;
  images?: unknown;
  variants?: ZendropVariant[];
  shipping_estimates?: ZendropShippingEstimate[];
  shippingEstimates?: ZendropShippingEstimate[];
  [key: string]: unknown;
}

export interface ZendropTrendingFilters {
  category?: string;
  price_min?: number;
  price_max?: number;
}

export interface ZendropProductsEnvelope {
  products?: ZendropProduct[];
  data?: ZendropProduct[];
  items?: ZendropProduct[];
  results?: ZendropProduct[];
  [key: string]: unknown;
}
