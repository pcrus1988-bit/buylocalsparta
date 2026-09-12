import { NextRequest, NextResponse } from "next/server";
import { getVisibleOfferMsrpMinor } from "../../../../lib/public-offer-msrp";

export const dynamic = "force-dynamic";

const MSRP_BROWSER_CACHE = "public, max-age=60";
const MSRP_CDN_CACHE = "max-age=300, stale-while-revalidate=600";

function safeRetailMinor(raw: string | null): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId")?.trim();
  const vendorId = request.nextUrl.searchParams.get("vendorId")?.trim();
  const retailPriceMinor = safeRetailMinor(request.nextUrl.searchParams.get("retailPriceMinor"));

  if (!productId || !vendorId || retailPriceMinor === undefined || productId.length > 160 || vendorId.length > 160) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const msrpMinor = await getVisibleOfferMsrpMinor(productId, vendorId, retailPriceMinor);
  return NextResponse.json(
    msrpMinor === undefined ? {} : { msrpMinor },
    { headers: {
      "Cache-Control": MSRP_BROWSER_CACHE,
      "CDN-Cache-Control": MSRP_CDN_CACHE,
      "Vercel-CDN-Cache-Control": MSRP_CDN_CACHE
    } }
  );
}
