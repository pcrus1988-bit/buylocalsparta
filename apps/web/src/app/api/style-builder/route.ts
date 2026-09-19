import { getPublishedDropshipCatalogPage } from "../../../lib/published-dropship-catalog-page";

type BuilderProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  categoryLabel?: string;
  brand?: string;
  color?: string;
  sizes: readonly string[];
  fit?: string;
  composition?: string;
  vendorId?: string;
  vendorName?: string;
  imageSrc?: string;
}>;

function publicProduct(product: Awaited<ReturnType<typeof getPublishedDropshipCatalogPage>>["products"][number]): BuilderProduct {
  const extended = product as typeof product & Readonly<{ previewImageSrc?: string }>;
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    price: product.price,
    priceMinor: product.priceMinor,
    categoryCode: product.categoryCode,
    categoryLabel: product.categoryLabel,
    brand: product.brand,
    color: product.color,
    sizes: product.sizes,
    fit: product.fit,
    composition: product.composition,
    vendorId: product.vendorId,
    vendorName: product.vendorName,
    imageSrc: product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : extended.previewImageSrc
  };
}

const WOMEN_CLOTHING = [
  "fashion-womens-tops","fashion-womens-shirts","fashion-womens-knitwear","fashion-womens-jackets-coats",
  "fashion-womens-trousers-jeans","fashion-womens-skirts","fashion-womens-dresses","fashion-womens-shorts"
] as const;
const MEN_CLOTHING = [
  "fashion-mens-tshirts-tops","fashion-mens-shirts","fashion-mens-knitwear","fashion-mens-jackets-coats",
  "fashion-mens-trousers-jeans","fashion-mens-shorts","fashion-mens-suits-formal"
] as const;
const WOMEN_FINISHING = ["womens-sneakers","womens-formal-shoes","womens-sandals","womens-boots","handbags","belts","scarves-hats-gloves","sunglasses"] as const;
const MEN_FINISHING = ["mens-sneakers","mens-formal-shoes","mens-boots","belts","scarves-hats-gloves","sunglasses","wallets-cardholders"] as const;
const BEAUTY = ["fragrance","lip-makeup","face-makeup","eye-makeup","nail-care-colour","grooming-care","beauty-tools-accessories"] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const audience = url.searchParams.get("audience") === "men" ? "men" : "women";

  try {
    const [clothing, finishing, beauty] = await Promise.all([
      getPublishedDropshipCatalogPage({
        category: "fashion",
        filters: { subcategories: audience === "women" ? WOMEN_CLOTHING : MEN_CLOTHING },
        limit: 30,
        sort: "recommended"
      }),
      getPublishedDropshipCatalogPage({
        category: "fashion",
        filters: { subcategories: audience === "women" ? WOMEN_FINISHING : MEN_FINISHING },
        limit: 24,
        sort: "recommended"
      }),
      getPublishedDropshipCatalogPage({
        category: "beauty",
        filters: { subcategories: BEAUTY },
        limit: 18,
        sort: "recommended"
      })
    ]);

    const seen = new Set<string>();
    const products = [...clothing.products, ...finishing.products, ...beauty.products]
      .map(publicProduct)
      .filter((product) => {
        if (seen.has(product.id)) return false;
        seen.add(product.id);
        return product.priceMinor > 0;
      });

    return Response.json(
      { audience, products },
      {
        headers: {
          "Cache-Control": "public, max-age=20",
          "CDN-Cache-Control": "public, max-age=60",
          "Vercel-CDN-Cache-Control": "public, max-age=120"
        }
      }
    );
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "style_builder.catalogue_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ error: "style_catalogue_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
