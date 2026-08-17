import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminSetMerchantStoryMedia } from "../../../../../lib/admin-merchant-story-media";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as Record<string, unknown>;
    const storyId = String(body.storyId ?? "");
    const mediaId = typeof body.mediaId === "string" ? body.mediaId : undefined;
    const result = await adminSetMerchantStoryMedia(principal, { storyId, mediaId });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "merchant_story_media_failed" }, { status: 400 });
  }
}
