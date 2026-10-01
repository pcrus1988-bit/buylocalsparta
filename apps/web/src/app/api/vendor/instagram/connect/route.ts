import { requireVendorSession } from "../../../../../lib/vendor-session";
import { beginVendorInstagramOAuth } from "../../../../../lib/vendor-instagram-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request);
    return Response.redirect(beginVendorInstagramOAuth(principal, request), 302);
  } catch {
    return Response.redirect(new URL("/vendor/storefront?instagram=not-configured", request.url), 302);
  }
}
