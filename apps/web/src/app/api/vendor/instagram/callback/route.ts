import { requireVendorSession } from "../../../../../lib/vendor-session";
import { completeVendorInstagramOAuth } from "../../../../../lib/vendor-instagram-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  if (denied || !code || !state) {
    return Response.redirect(new URL("/vendor/storefront?instagram=cancelled", request.url), 302);
  }
  try {
    const principal = await requireVendorSession(request);
    await completeVendorInstagramOAuth(principal, request, { code, state });
    return Response.redirect(new URL("/vendor/storefront?instagram=connected", request.url), 302);
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "vendor.instagram_oauth_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.redirect(new URL("/vendor/storefront?instagram=error", request.url), 302);
  }
}
