import { requireDailySession } from "../../../../../../lib/daily-session";
import { completeVendorMediaUpload } from "../../../../../../lib/media-upload-service";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const intentId = typeof body.intentId === "string" ? body.intentId.trim() : "";
    if (!intentId) throw new Error("Media upload intent is required");
    return Response.json(await completeVendorMediaUpload(principal, intentId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "daily_quickadd_media_complete_failed" }, { status: 400 });
  }
}
