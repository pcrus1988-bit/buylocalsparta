import { deleteHomepageHeroSlide, updateHomepageHeroSlide } from "../../../../../lib/homepage-hero-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const slide = await updateHomepageHeroSlide(id, {
      title: body.title === undefined ? undefined : String(body.title),
      altText: body.altText === undefined ? undefined : String(body.altText),
      linkUrl: body.linkUrl === undefined ? undefined : String(body.linkUrl),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      isVisible: body.isVisible === undefined ? undefined : Boolean(body.isVisible)
    });
    return Response.json({ slide });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "hero_update_failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const { id } = await context.params;
    await deleteHomepageHeroSlide(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "hero_delete_failed" }, { status: 400 });
  }
}
