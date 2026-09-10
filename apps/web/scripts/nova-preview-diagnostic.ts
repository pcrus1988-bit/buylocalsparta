import {
  NovaV1ApiError,
  NovaV1Client,
  novaApiKeyFromEnvironment
} from "../../../integrations/dropship-suppliers/src/nova-v1.ts";

const EXPECTED_BRANCH = "feature/nova-live-integration-20260910";
// Keep this probe preview-only: it exists solely to validate the server-side Nova credential and documented read endpoints.

if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) {
  process.exit(0);
}

const prefix = "NOVA_PREVIEW_DIAGNOSTIC";

try {
  const client = new NovaV1Client({
    apiKey: novaApiKeyFromEnvironment(),
    baseUrl: process.env.NOVA_API_BASE_URL,
    requestsPerMinute: 60
  });

  const stores = await client.getStores();
  const store = stores[0];
  if (!store) throw new Error("Nova returned no retailer stores");

  let csv: Record<string, unknown>;
  try {
    const status = await client.getCsvStatus(store.id);
    csv = {
      enabled: booleanish(status.csv_enabled),
      downloadCount: numberish(status.download_count),
      downloadLimit: numberish(status.download_limit)
    };
  } catch (error) {
    if (error instanceof NovaV1ApiError && error.status === 403) {
      csv = { enabled: false, access: "not_enabled" };
    } else {
      throw error;
    }
  }

  const page = await client.listProducts(store.id, { page: 1, per_page: 1, lang: "en" });
  const first = page.items[0];
  const product = first ? await client.getProduct(store.id, first.id, "en") : null;
  const status = first ? await client.checkProductStatus(store.id, [first.id]) : [];
  const deleted = await client.listDeletedProducts(store.id, { page: 1, per_page: 1 });
  const greece = await client.getCountryCodes("GR");

  const result = {
    ok: true,
    store: { id: store.id, name: text(store.name) },
    storeCount: stores.length,
    csv,
    catalogue: {
      total: page.total,
      totalPages: page.totalPages,
      sample: product ? productSummary(product) : null,
      sampleStatus: status[0] ?? null
    },
    deletedFeed: {
      reachable: true,
      total: deleted.total,
      totalPages: deleted.totalPages,
      sampleKeys: deleted.items[0] ? Object.keys(deleted.items[0]).sort() : []
    },
    countryCodes: {
      greeceResolvable: greece.length > 0,
      code: greece[0] && typeof greece[0].code === "string" ? greece[0].code : null
    },
    writesPerformed: false
  };

  console.log(`${prefix} ${JSON.stringify(result)}`);
} catch (error) {
  const diagnostic = error instanceof NovaV1ApiError
    ? { ok: false, error: error.name, status: error.status, method: error.method, path: error.path, code: error.code ?? null, writesPerformed: false }
    : { ok: false, error: error instanceof Error ? error.message : "UnknownError", writesPerformed: false };
  console.error(`${prefix} ${JSON.stringify(diagnostic)}`);
  process.exitCode = 1;
}

function productSummary(product: Readonly<Record<string, unknown>>) {
  const brand = object(product.brand);
  const variations = Array.isArray(product.variations)
    ? product.variations.map(object).filter((value): value is Record<string, unknown> => value !== null)
    : [];
  const variant = variations[0] ?? null;
  return {
    id: product.id ?? null,
    name: text(product.name),
    brand: brand ? text(brand.name) : null,
    sku: text(product.sku),
    regularPriceRaw: scalar(product.regular_price),
    salePriceRaw: scalar(product.sale_price),
    stockQuantity: numberish(product.stock_quantity),
    stockStatus: text(product.stock_status),
    manageStock: booleanish(product.manage_stock),
    inStock: booleanish(product.in_stock),
    barcodePresent: Boolean(text(product.barcode)),
    mpnPresent: Boolean(text(product.mpn)),
    variationCount: variations.length,
    productKeys: Object.keys(product).sort(),
    firstVariation: variant ? {
      id: variant.id ?? null,
      sku: text(variant.sku),
      regularPriceRaw: scalar(variant.regular_price),
      salePriceRaw: scalar(variant.sale_price),
      stockQuantity: numberish(variant.stock_quantity),
      stockStatus: text(variant.stock_status),
      manageStock: booleanish(variant.manage_stock),
      inStock: booleanish(variant.in_stock),
      barcodePresent: Boolean(text(variant.barcode)),
      mpnPresent: Boolean(text(variant.mpn)),
      keys: Object.keys(variant).sort()
    } : null
  };
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scalar(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function numberish(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanish(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "yes") return true;
  if (value === 0 || value === "0" || value === "false" || value === "no") return false;
  return null;
}
