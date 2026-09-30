import { requireAdminSession } from "../../../../../../lib/admin-session";
import { mediaPipelineReadiness, mediaUploadMode } from "../../../../../../lib/media-upload-service";

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "catalog.write" });
    const mode = mediaUploadMode();
    const readiness = await mediaPipelineReadiness();
    return Response.json(
      {
        ready: mode === "direct" && readiness.ready,
        mode,
        message: readiness.message
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (error) {
    return Response.json(
      { ready: false, error: error instanceof Error ? error.message : "media_readiness_failed" },
      { status: 400, headers: { "cache-control": "private, no-store" } }
    );
  }
}
