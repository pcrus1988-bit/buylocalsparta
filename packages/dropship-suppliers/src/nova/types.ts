export type NovaScalarId = string | number;
export type NovaPrice = string | number | null;

export interface NovaNamedReference extends Record<string, unknown> {
  id?: NovaScalarId;
  name?: string;
  slug?: string;
}

export interface NovaVariation extends Record<string, unknown> {
  id?: NovaScalarId;
  sku?: string | null;
  barcode?: string | null;
  mpn?: string | null;
  regular_price?: NovaPrice;
  sale_price?: NovaPrice;
  stock_quantity?: number | string | null;
  stock_status?: string | null;
  in_stock?: boolean | null;
  manage_stock?: boolean | null;
  backorders_allowed?: boolean | null;
  backorders?: string | boolean | null;
  weight?: string | number | null;
  dimensions?: Record<string, unknown> | null;
  hs_code?: string | null;
  attributes?: unknown[] | null;
  image?: unknown;
}

export interface NovaProduct extends Record<string, unknown> {
  id?: NovaScalarId;
  name?: string | null;
  description?: string | null;
  sku?: string | null;
  barcode?: string | null;
  mpn?: string | null;
  regular_price?: NovaPrice;
  sale_price?: NovaPrice;
  stock_quantity?: number | string | null;
  stock_status?: string | null;
  in_stock?: boolean | null;
  manage_stock?: boolean | null;
  backorders_allowed?: boolean | null;
  variations?: NovaVariation[] | null;
  brand?: NovaNamedReference | null;
  vendor?: NovaNamedReference | null;
  groups?: NovaNamedReference[] | null;
  categories?: NovaNamedReference[] | null;
  lang?: string | null;
  language?: string | null;
  updated_at?: string | null;
}

export interface NovaDeletedProduct extends Record<string, unknown> {
  id?: NovaScalarId;
  product_id?: NovaScalarId;
  deleted_at?: string | null;
}

export interface NovaProductStatus extends Record<string, unknown> {
  id?: NovaScalarId;
  status?: string | null;
}

export interface NovaTrackingLineItem extends Record<string, unknown> {
  product_id?: NovaScalarId;
  variation_id?: NovaScalarId;
  quantity?: number;
}

export interface NovaTrackingInfo extends Record<string, unknown> {
  company?: string | null;
  number?: string | null;
  vendor_id?: NovaScalarId;
  line_items?: NovaTrackingLineItem[] | null;
}

export interface NovaOrder extends Record<string, unknown> {
  id?: NovaScalarId;
  status?: string | null;
  tracking_info?: NovaTrackingInfo[] | NovaTrackingInfo | null;
}

export interface NovaListEnvelope<T> extends Record<string, unknown> {
  data?: T[];
  items?: T[];
  results?: T[];
}

export interface NovaProductsQuery {
  page?: number;
  per_page?: number;
  updated_at_min?: string;
  updated_at_max?: string;
  lang?: "en" | "de";
  [key: string]: string | number | boolean | undefined;
}

export interface NovaDeletedProductsQuery {
  page?: number;
  per_page?: number;
  deleted_at_min?: string;
  deleted_at_max?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface NovaOrdersQuery {
  page?: number;
  per_page?: number;
  status?: string;
  [key: string]: string | number | boolean | undefined;
}
