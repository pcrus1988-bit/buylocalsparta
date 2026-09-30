import { requireVendorCapability } from "../../../../../lib/vendor-session";
import { updateVendorHubSeoSource } from "../../../../../lib/vendor-hub-controls-service";

export async function PUT(request: Request) {
  try {
    const { principal } = await requireVendorCapability("seo.source_data.manage", request, true);
    const body = await request.json() as Record<string, unknown>;
    const locale = body.locale === "en" ? "en" : body.locale === "el" ? "el" : undefined;
    if (!locale) throw new Error("Locale is required");
    return Response.json(await updateVendorHubSeoSource(principal, {
      locale,
      story: body.story,
      expertise: body.expertise,
      shortDescription: body.shortDescription,
      seoTitle: body.seoTitle,
      seoDescription: body.seoDescription
    }), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "hub_seo_failed";
    return Response.json({ error: message }, { status: /AUTH_REQUIRED|capability denied|SELF_GOVERNED/.test(message) ? 403 : 400 });
  }
}
