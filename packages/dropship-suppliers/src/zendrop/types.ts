export type ZendropScalarId = string | number;

export interface ZendropAvailability {
  in_stock?: boolean;
  inventory_level?: string | null;
  [key: string]: unknown;
}

export interface ZendropSupplier {
  id?: ZendropScalarId;
  name?: string | null;
  country?: string | null;
  type?: string | null;
  [key: string]: unknown;
}

export interface ZendropVariant {
  variant_id?: ZendropScalarId;
  id?: ZendropScalarId;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  price?: string | number | null;
  weight?: string | number | null;
  weight_unit?: string | null;
  dimensions?: Readonly<Record<string, unknown>> | null;
  available?: number | null;
  inventory_level?: string | null;
  tracked?: boolean | null;
  [key: string]: unknown;
}

export interface ZendropCategory {
  id?: ZendropScalarId;
  name?: string | null;
  [key: string]: unknown;
}

export interface ZendropImage {
  id?: ZendropScalarId;
  url?: string | null;
  [key: string]: unknown;
}

export interface ZendropProduct {
  id?: ZendropScalarId;
  product_id?: ZendropScalarId;
  productId?: ZendropScalarId;
  product_url?: string | null;
  name?: string | null;
  title?: string | null;
  description?: string | null;
  price?: string | number | null;
  image?: string | null;
  images?: ZendropImage[] | string[];
  availability?: ZendropAvailability | null;
  variants?: ZendropVariant[];
  variants_total?: number;
  variants_has_more?: boolean;
  categories?: ZendropCategory[];
  supplier?: ZendropSupplier | null;
  [key: string]: unknown;
}

export interface ZendropCatalogProductsQuery {
  limit?: number;
  page?: number;
  category_id?: number;
  keyword?: string;
  min_price?: number;
  max_price?: number;
}

export interface ZendropTrendingQuery {
  limit?: number;
  page?: number;
}

export interface ZendropProductsEnvelope {
  total?: number;
  products?: ZendropProduct[];
  data?: ZendropProduct[];
  items?: ZendropProduct[];
  results?: ZendropProduct[];
  [key: string]: unknown;
}

export interface ZendropShippingOption {
  type?: string | null;
  price?: number | null;
  estimated_delivery?: string | null;
  [key: string]: unknown;
}

export interface ZendropShippingEstimate {
  product_id?: ZendropScalarId;
  country_code?: string | null;
  shipping_options?: ZendropShippingOption[];
  [key: string]: unknown;
}


export interface ZendropMyProductListItem {
  import_list_id?: number | null;
  product_id?: number | null;
  product_name?: string | null;
  product_image_url?: string | null;
  import_status?: string | null;
  store_product_id?: string | null;
  status?: string | null;
  store_product_name?: string | null;
  store_product_image_url?: string | null;
  [key: string]: unknown;
}

export interface ZendropMyProductsEnvelope {
  total?: number;
  items?: ZendropMyProductListItem[];
  [key: string]: unknown;
}

export interface ZendropMyProductVariant {
  variant_title?: string | null;
  variant_sku?: string | null;
  store_variant_id?: string | null;
  variant_image_url?: string | null;
  variant_price?: number | null;
  [key: string]: unknown;
}

export interface ZendropMyProduct {
  import_list_id?: number;
  product_id?: number | null;
  product_name?: string | null;
  product_image_url?: string | null;
  import_status?: string | null;
  store_product_id?: string | null;
  store_sync_status?: string | null;
  zendrop_linked?: boolean;
  variants?: ZendropMyProductVariant[];
  [key: string]: unknown;
}

export interface ZendropImportOperation {
  operation_id?: number;
  status?: string | null;
  failed_reason?: string | null;
  store_product_id?: string | null;
  [key: string]: unknown;
}
