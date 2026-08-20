import { createHomepageHeroSlide, listHomepageHeroSlides } from "../../../../lib/homepage-hero-runtime";
import { requireAdminSession } from "../../../../lib/admin-session";

export async function POST(request: Request) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Hero image is required.");
    const slide = await createHomepageHeroSlide({
      file,
      title: String(data.get("title") ?? ""),
      altText: String(data.get("altText") ?? ""),
      linkUrl: String(data.get("linkUrl") ?? ""),
      sortOrder: Number(data.get("sortOrder") ?? 100),
      isVisible: String(data.get("isVisible") ?? "false") === "true"
    });
    return Response.json({ slide, slides: await listHomepageHeroSlides() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "hero_create_failed" }, { status: 400 });
  }
}
