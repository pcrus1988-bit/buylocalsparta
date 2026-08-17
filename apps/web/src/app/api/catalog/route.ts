import { getCatalogCards } from "../../../lib/catalog-view";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const visitorKey = request.headers.get("x-bls-visitor")?.trim();
  if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) return Response.json({ error: "visitor_identity_missing" }, { status: 400 });
  const postcode = url.searchParams.get("postcode")?.trim() || "23100";
  const query = url.searchParams.get("q")?.trim().slice(0, 160) || "";
  const category = url.searchParams.get("category")?.trim().slice(0, 100) || "";
  const products = (await getCatalogCards(visitorKey, postcode.slice(0, 16), query, category)).map((product) => ({
    id: product.id,
    title: product.title,
    price: product.price,
    priceMinor: product.priceMinor,
    categoryCode: product.categoryCode,
    available: product.available,
    availableToSell: product.availableToSell,
    vendor: product.vendorId && product.vendorName && product.adviser ? { id: product.vendorId, name: product.vendorName, adviser: product.adviser } : null
  }));
  return Response.json({ market: "sparta", products });
}
