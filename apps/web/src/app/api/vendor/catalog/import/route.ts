import { requireVendorSession } from "../../../../../lib/vendor-session";
import { isDropshippingOnlyVendor } from "../../../../../lib/vendor-dropshipping-access";
import { previewOrCommitVendorCsv } from "../../../../../lib/vendor-backoffice-service";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request,true);
    if (await isDropshippingOnlyVendor(principal.vendorId)) throw new Error("CSV catalogue import is disabled for the dropshipping-only vendor");
    const body = await request.json() as { csv?: unknown; confirm?: unknown };
    if (typeof body.csv !== "string") throw new Error("CSV content is required");
    return Response.json(await previewOrCommitVendorCsv(principal, body.csv, body.confirm === true));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "csv_import_failed" }, { status: 400 });
  }
}
