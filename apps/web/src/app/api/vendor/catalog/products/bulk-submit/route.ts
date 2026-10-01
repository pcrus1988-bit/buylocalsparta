import { isDropshippingOnlyVendor } from "../../../../../../lib/vendor-dropshipping-access";
import { submitVendorProducts } from "../../../../../../lib/vendor-backoffice-service";
import { requireVendorCapability } from "../../../../../../lib/vendor-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("catalogue.submit", request, true);
    if (await isDropshippingOnlyVendor(principal.vendorId)) {
      throw new Error("Manual product submission is disabled for the dropshipping-only vendor");
    }

    const body = await request.json() as { all?: unknown; submissionIds?: unknown; batchSize?: unknown };
    const submitAll = body.all === true;
    const submissionIds = Array.isArray(body.submissionIds)
      ? body.submissionIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())
      : [];

    if (!submitAll && submissionIds.length === 0) throw new Error("Επίλεξε τουλάχιστον ένα προϊόν για μαζική υποβολή.");
    if (submissionIds.length > 5000) throw new Error("Η μαζική υποβολή υποστηρίζει έως 5.000 προϊόντα ανά ενέργεια.");
    const batchSize = Math.max(1, Math.min(100, Number(body.batchSize ?? 50) || 50));

    return Response.json(await submitVendorProducts(principal, submitAll ? undefined : submissionIds, batchSize));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "catalog_bulk_submit_failed" }, { status: 400 });
  }
}
