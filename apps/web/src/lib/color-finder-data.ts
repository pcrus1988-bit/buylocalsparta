import { unstable_cache } from "next/cache";
import { getPublishedDropshipCatalogPage } from "./published-dropship-catalog-page";
import {
  inferColorFinish,
  inferColorProductType,
  resolveCatalogColor,
  type ColorFinderProduct
} from "./color-finder";

const PAGE_SIZE = 36;
const MAX_WINDOWS = 3;
const CACHE_SECONDS = 300;

async function loadCandidatePages() {
  const products: Awaited<ReturnType<typeof getPublishedDropshipCatalogPage>>["products"][number][] = [];
  for (let window = 0; window < MAX_WINDOWS; window += 1) {
    const page = await getPublishedDropshipCatalogPage({
      category: "beauty",
      filters: { subcategory: "nail-care-colour" },
      limit: PAGE_SIZE,
      offset: window * PAGE_SIZE
    });
    products.push(...page.products);
    if (!page.hasMore) break;
  }

  if (products.length > 0) return products;

  // Graceful bridge while supplier taxonomy enrichment catches up.
  const fallback = await getPublishedDropshipCatalogPage({
    category: "beauty",
    query: "nail",
    limit: PAGE_SIZE,
    offset: 0
  });
  return [...fallback.products];
}

async function loadColorFinderProductsUncached(): Promise<readonly ColorFinderProduct[]> {
  const candidates = await loadCandidatePages();
  const seen = new Set<string>();
  const products: ColorFinderProduct[] = [];

  for (const product of candidates) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);

    const resolved = resolveCatalogColor({ color: product.color, title: product.title });
    if (!resolved) continue;

    const productText = [product.title, product.categoryLabel, product.color].filter(Boolean).join(" ");
    const imageSrc = product.mediaId
      ? `/api/media/${encodeURIComponent(product.mediaId)}`
      : product.previewImageSrc ?? `/api/catalog-source-image/${encodeURIComponent(product.id)}`;

    products.push({
      id: product.id,
      slug: product.slug,
      title: product.title,
      brand: product.brand,
      brandShade: product.color,
      colorHex: resolved.hex,
      colorLabel: resolved.label,
      finish: inferColorFinish(productText),
      productType: inferColorProductType(productText),
      priceMinor: product.priceMinor,
      price: product.price,
      imageSrc,
      mediaAlt: product.mediaAlt
    });
  }

  return products;
}

export const getColorFinderProducts = unstable_cache(
  loadColorFinderProductsUncached,
  ["color-finder-nail-products-v1"],
  { revalidate: CACHE_SECONDS }
);
