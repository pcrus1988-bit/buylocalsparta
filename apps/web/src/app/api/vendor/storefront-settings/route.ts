import { requireVendorSession } from "../../../../lib/vendor-session";
import { updateVendorStorefront, vendorStorefrontWorkspace } from "../../../../lib/vendor-storefront-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireVendorSession();
    return Response.json(await vendorStorefrontWorkspace(principal), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "vendor_storefront_settings_failed" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const workspace = await updateVendorStorefront(principal, {
      shortDescription: body.shortDescription,
      story: body.story,
      settings: body.settings
    });
    return Response.json(workspace, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "vendor_storefront_settings_update_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
