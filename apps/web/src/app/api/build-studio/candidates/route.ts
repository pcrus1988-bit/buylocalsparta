import { getShopCatalogPage } from "../../../../lib/shop-catalog-page";
import { getVisitorKey } from "../../../../lib/visitor";
import { productPublicPath } from "../../../../lib/product-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Candidate = Readonly<{
  id: string;
  slug: string;
  url: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  categoryLabel?: string;
  brand?: string;
  mediaId?: string;
  mediaAlt?: string;
  vendorName?: string;
  score: number;
  matchedTerms: readonly string[];
}>;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeTerms(url: URL): readonly string[] {
  const terms = url.searchParams
    .getAll("term")
    .flatMap((value) => value.split("|"))
    .map((value) => value.trim().slice(0, 90))
    .filter(Boolean);

  return [...new Set(terms)].slice(0, 8);
}

function candidateScore(
  product: Readonly<{
    title: string;
    categoryCode: string;
    categoryLabel?: string;
    brand?: string;
    description?: string;
  }>,
  terms: readonly string[]
): Readonly<{ score: number; matchedTerms: readonly string[] }> {
  const haystack = normalize([
    product.title,
    product.categoryCode,
    product.categoryLabel,
    product.brand,
    product.description
  ].filter(Boolean).join(" "));

  const matchedTerms = terms.filter((term) => {
    const normalized = normalize(term);
    if (!normalized) return false;
    if (haystack.includes(normalized)) return true;
    return normalized.split(" ").filter((token) => token.length >= 4).some((token) => haystack.includes(token));
  });

  return {
    score: matchedTerms.length * 20,
    matchedTerms
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const terms = safeTerms(url);
  const postcode = url.searchParams.get("postcode")?.trim().slice(0, 16) || "23100";
  if (!terms.length) return Response.json({ products: [], degraded: false });

  try {
    const visitorKey = await getVisitorKey();
    const queryTerms = terms.slice(0, 4);
    const pages = await Promise.all(queryTerms.map((query) =>
      getShopCatalogPage({
        visitorKey,
        postcode,
        query,
        limit: 18,
        offset: 0
      }).catch(() => ({ products: [], total: 0, hasMore: false }))
    ));

    const unique = new Map<string, Candidate>();
    for (const product of pages.flatMap((page) => page.products)) {
      if (!product.available || product.availableToSell <= 0 || product.priceMinor <= 0) continue;
      const match = candidateScore(product, terms);
      if (match.score <= 0) continue;

      const candidate: Candidate = {
        id: product.id,
        slug: product.slug,
        url: productPublicPath(product),
        title: product.title,
        price: product.price,
        priceMinor: product.priceMinor,
        categoryCode: product.categoryCode,
        categoryLabel: product.categoryLabel,
        brand: product.brand,
        mediaId: product.mediaId,
        mediaAlt: product.mediaAlt,
        vendorName: product.vendorName,
        score: match.score,
        matchedTerms: match.matchedTerms
      };

      const existing = unique.get(candidate.id);
      if (!existing || candidate.score > existing.score) unique.set(candidate.id, candidate);
    }

    const products = [...unique.values()]
      .sort((left, right) =>
        right.score - left.score
        || left.priceMinor - right.priceMinor
        || left.title.localeCompare(right.title, "el")
      )
      .slice(0, 18);

    return Response.json(
      { products, degraded: false },
      { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } }
    );
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "build_studio.candidates_degraded",
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ products: [], degraded: true });
  }
}
