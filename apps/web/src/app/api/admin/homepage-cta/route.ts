import { createHomepagePromoCta, listHomepagePromoCtas } from "../../../../lib/homepage-promo-cta-runtime";
import { requireAdminSession } from "../../../../lib/admin-session";

export async function POST(request: Request) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as Record<string, unknown>;
    const cta = await createHomepagePromoCta({
      eyebrow: String(body.eyebrow ?? ""),
      headline: String(body.headline ?? ""),
      body: String(body.body ?? ""),
      buttonLabel: String(body.buttonLabel ?? ""),
      linkUrl: String(body.linkUrl ?? ""),
      supportingText: String(body.supportingText ?? ""),
      sortOrder: Number(body.sortOrder ?? 100),
      isVisible: body.isVisible !== false
    });
    return Response.json({ cta, ctas: await listHomepagePromoCtas() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "homepage_cta_create_failed" }, { status: 400 });
  }
}
