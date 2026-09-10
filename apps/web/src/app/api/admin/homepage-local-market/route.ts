import { updateHomepageLocalMarketScene } from "../../../../lib/homepage-local-market-runtime";
import { requireAdminSession } from "../../../../lib/admin-session";

export async function PATCH(request: Request) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const data = await request.formData();
    const candidate = data.get("file");
    const file = candidate instanceof File && candidate.size > 0 ? candidate : null;
    const scene = await updateHomepageLocalMarketScene({
      eyebrow: String(data.get("eyebrow") ?? ""),
      headline: String(data.get("headline") ?? ""),
      body: String(data.get("body") ?? ""),
      ctaLabel: String(data.get("ctaLabel") ?? ""),
      ctaUrl: String(data.get("ctaUrl") ?? ""),
      altText: String(data.get("altText") ?? ""),
      isVisible: String(data.get("isVisible") ?? "false") === "true",
      file
    });
    return Response.json({ scene });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "homepage_local_market_update_failed" }, { status: 400 });
  }
}
