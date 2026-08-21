import { deleteHomepagePromoCta, updateHomepagePromoCta } from "../../../../../lib/homepage-promo-cta-runtime";
import { requireAdminSession } from "../../../../../lib/admin-session";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const cta = await updateHomepagePromoCta(id, {
      eyebrow: body.eyebrow === undefined ? undefined : String(body.eyebrow),
      headline: body.headline === undefined ? undefined : String(body.headline),
      body: body.body === undefined ? undefined : String(body.body),
      buttonLabel: body.buttonLabel === undefined ? undefined : String(body.buttonLabel),
      linkUrl: body.linkUrl === undefined ? undefined : String(body.linkUrl),
      supportingText: body.supportingText === undefined ? undefined : String(body.supportingText),
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
      isVisible: body.isVisible === undefined ? undefined : Boolean(body.isVisible)
    });
    return Response.json({ cta });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "homepage_cta_update_failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const { id } = await context.params;
    await deleteHomepagePromoCta(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "homepage_cta_delete_failed" }, { status: 400 });
  }
}
