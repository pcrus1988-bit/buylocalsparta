import {
  NovaV1ApiError,
  NovaV1Client,
  novaApiKeyFromEnvironment
} from "../../../../../../../integrations/dropship-suppliers/src/nova-v1.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_BRANCH = "feature/nova-live-integration-20260910";

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== ALLOWED_BRANCH) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let apiKey: string;
  try {
    apiKey = novaApiKeyFromEnvironment();
  } catch {
    return Response.json(
      { ok: false, novaApiKeyConfigured: false },
      { status: 503, headers: noStoreHeaders() }
    );
  }

  const client = new NovaV1Client({
    apiKey,
    baseUrl: process.env.NOVA_API_BASE_URL,
    requestsPerMinute: 60
  });

  try {
    const stores = await client.getStores();
    const selectedStore = stores[0];
    if (!selectedStore) {
      return Response.json(
        { ok: false, novaApiKeyConfigured: true, stores: [], error: "no_nova_store" },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    const storeId = selectedStore.id;
    let csv: ReturnType<typeof summarizeCsvStatus> | { enabled: false; access: "not_enabled" };
    try {
      csv = summarizeCsvStatus(await client.getCsvStatus(storeId));
    } catch (error) {
      if (error instanceof NovaV1ApiError && error.status === 403) {
        csv = { enabled: false, access: "not_enabled" };
      } else {
        throw error;
      }
    }

    const productPage = await client.listProducts(storeId, { page: 1, per_page: 1, lang: "en" });
    const listedProduct = productPage.items[0];
    const product = listedProduct ? await client.getProduct(storeId, listedProduct.id, "en") : null;
    const productStatus = listedProduct
      ? await client.checkProductStatus(storeId, [listedProduct.id])
      : [];
    const deletedPage = await client.listDeletedProducts(storeId, { page: 1, per_page: 1 });
    const greekCountry = await client.getCountryCodes("GR");

    return Response.json({
      ok: true,
      novaApiKeyConfigured: true,
      apiBaseUrl: client.baseUrl,
      rateLimitPerMinute: client.requestsPerMinute,
      stores: stores.map((store) => ({ id: store.id, name: text(store.name) })),
      selectedStoreId: storeId,
      csv,
      catalogue: {
        total: productPage.total,
        totalPages: productPage.totalPages,
        sample: product ? summarizeProduct(product) : null,
        sampleStatus: productStatus[0] ?? null
      },
      deletedFeed: {
        reachable: true,
        total: deletedPage.total,
        totalPages: deletedPage.totalPages,
        sampleKeys: deletedPage.items[0] ? Object.keys(deletedPage.items[0]).sort() : []
      },
      countryCodes: {
        greeceResolvable: greekCountry.length > 0,
        sample: greekCountry[0] ? summarizeCountry(greekCountry[0]) : null
      },
      writesPerformed: false
    }, { headers: noStoreHeaders() });
  } catch (error) {
    const diagnostic = error instanceof NovaV1ApiError
      ? { type: error.name, status: error.status, method: error.method, path: error.path, code: error.code ?? null }
      : { type: error instanceof Error ? error.name : "UnknownError" };

    return Response.json(
      { ok: false, novaApiKeyConfigured: true, diagnostic, writesPerformed: false },
      { status: 502, headers: noStoreHeaders() }
    );
  }
}

function summarizeCsvStatus(value: Readonly<Record<string, unknown>>) {
  return {
    enabled: booleanish(value.csv_enabled),
    downloadCount: numberish(value.download_count),
    downloadLimit: numberish(value.download_limit),
    keys: Object.keys(value).sort()
  };
}

function summarizeProduct(product: Readonly<Record<string, unknown>>) {
  const variations = Array.isArray(product.variations)
    ? product.variations.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value))
    : [];
  const firstVariation = variations[0] ?? null;
  const brand = product.brand && typeof product.brand === "object" && !Array.isArray(product.brand)
    ? product.brand as Record<string, unknown>
    : null;

  return {
    id: product.id ?? null,
    name: text(product.name),
    brand: brand ? text(brand.name) : null,
    sku: text(product.sku),
    barcodePresent: Boolean(text(product.barcode)),
    mpnPresent: Boolean(text(product.mpn)),
    regularPriceRaw: scalar(product.regular_price),
    salePriceRaw: scalar(product.sale_price),
    stockQuantity: numberish(product.stock_quantity),
    stockStatus: text(product.stock_status),
    manageStock: booleanish(product.manage_stock),
    inStock: booleanish(product.in_stock),
    variationCount: variations.length,
    productKeys: Object.keys(product).sort(),
    firstVariation: firstVariation ? {
      id: firstVariation.id ?? null,
      sku: text(firstVariation.sku),
      barcodePresent: Boolean(text(firstVariation.barcode)),
      mpnPresent: Boolean(text(firstVariation.mpn)),
      regularPriceRaw: scalar(firstVariation.regular_price),
      salePriceRaw: scalar(firstVariation.sale_price),
      stockQuantity: numberish(firstVariation.stock_quantity),
      stockStatus: text(firstVariation.stock_status),
      manageStock: booleanish(firstVariation.manage_stock),
      inStock: booleanish(firstVariation.in_stock),
      keys: Object.keys(firstVariation).sort()
    } : null
  };
}

function summarizeCountry(value: Readonly<Record<string, unknown>>) {
  const states = Array.isArray(value.states) ? value.states : [];
  return { name: text(value.name), code: text(value.code), stateCount: states.length };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scalar(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
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

function noStoreHeaders(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet"
  };
}
