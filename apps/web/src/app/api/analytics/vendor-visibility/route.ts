import { getPublicVendorDirectoryEntry } from "../../../../lib/public-vendor-directory";
import { getVendorVisibilitySummary } from "../../../../lib/vendor-visibility";

export async function GET(request: Request) {
  const vendorId = new URL(request.url).searchParams.get("vendorId")?.trim();
  if (!vendorId || vendorId.length > 160) return Response.json({ error: "invalid_vendor" }, { status: 400 });
  const vendor = await getPublicVendorDirectoryEntry(vendorId);
  if (!vendor) return Response.json({ error: "vendor_not_found" }, { status: 404 });
  const summary = await getVendorVisibilitySummary(vendor.id);
  return Response.json({ vendorId: vendor.id, research: vendor.directoryStatus === "research", summary }, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" }
  });
}
