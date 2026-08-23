import { requireVendorSession } from "../../../../../lib/vendor-session";
import { findVendorCanonicalPrefillMatches } from "../../../../../lib/vendor-canonical-prefill-service";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request);
    const url = new URL(request.url);
    const title = url.searchParams.get("title")?.trim() ?? "";
    const gtin = url.searchParams.get("gtin")?.trim() ?? "";
    if (title.length < 4 && gtin.replace(/\D/g, "").length < 6) return Response.json({ matches: [] });
    const matches = await findVendorCanonicalPrefillMatches(principal, { title, gtin, limit: 5 });
    return Response.json({ matches });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "canonical_match_lookup_failed" }, { status: 400 });
  }
}
