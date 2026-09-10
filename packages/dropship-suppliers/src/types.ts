export const KONTA_MOU_DROPSHIP_VENDOR_ID = "vendor_e8cb57b3c67b469d9a9d" as const;

export type SupplierCapability =
  | "csvBootstrap"
  | "catalogueDelta"
  | "deletedFeed"
  | "bulkStatusCheck"
  | "productLookup"
  | "createOrder"
  | "readOrders"
  | "tracking"
  | "shippingQuote"
  | "cancelOrder"
  | "returns"
  | "webhooks";

export type SupplierCapabilities = Readonly<Record<SupplierCapability, boolean>>;

export type SupplierPublicationState =
  | "STAGED"
  | "PUBLISHABLE"
  | "LIVE"
  | "WITHDRAWN"
  | "BLOCKED";

export type SupplierOrderSubmissionState =
  | "NOT_SUBMITTED"
  | "SUBMITTING"
  | "SUBMITTED"
  | "SUBMISSION_UNKNOWN"
  | "FAILED";

export type SupplierShippingStrategy =
  | "API_QUOTE"
  | "RATE_TABLE"
  | "FIXED"
  | "ABSORBED"
  | "MANUAL";

export interface SupplierConnectionResult {
  ok: boolean;
  supplierCode: string;
  message?: string;
}

export interface SupplierVariantSnapshot {
  externalProductId: string;
  externalVariationId: string;
  sku: string | null;
  barcode: string | null;
  mpn: string | null;
  stockQuantity: number | null;
  stockStatus: string | null;
  inStock: boolean;
  manageStock: boolean;
  backordersAllowed: boolean;
  regularPriceRaw: string | null;
  salePriceRaw: string | null;
  weightRaw: string | null;
  dimensions: Readonly<Record<string, unknown>> | null;
  hsCode: string | null;
  attributes: readonly unknown[];
  raw: Readonly<Record<string, unknown>>;
}

export interface SupplierProductSnapshot {
  supplierCode: string;
  commercialVendorId: string;
  externalProductId: string;
  sourceVendorId: string | null;
  sourceVendorName: string | null;
  sourceLanguage: string | null;
  name: string | null;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  mpn: string | null;
  brandId: string | null;
  brandName: string | null;
  categoryIds: readonly string[];
  regularPriceRaw: string | null;
  salePriceRaw: string | null;
  publicationState: SupplierPublicationState;
  variants: readonly SupplierVariantSnapshot[];
  raw: Readonly<Record<string, unknown>>;
}

export interface SupplierProductPage {
  items: readonly SupplierProductSnapshot[];
  raw: unknown;
}

export interface SupplierDeletedProduct {
  externalProductId: string;
  deletedAt: string | null;
  raw: Readonly<Record<string, unknown>>;
}

export interface SupplierAdapter {
  readonly code: string;
  readonly name: string;
  readonly capabilities: SupplierCapabilities;
  readonly commercialVendorId: string;
  readonly shippingStrategy: SupplierShippingStrategy;
  testConnection(): Promise<SupplierConnectionResult>;
}

export function assertSupplierCapability(
  adapter: Pick<SupplierAdapter, "code" | "capabilities">,
  capability: SupplierCapability,
): void {
  if (!adapter.capabilities[capability]) {
    throw new Error(`Supplier ${adapter.code} does not support capability ${capability}`);
  }
}
