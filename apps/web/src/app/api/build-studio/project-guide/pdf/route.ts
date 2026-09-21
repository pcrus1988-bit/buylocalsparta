import { buildCurrentBuildStudioProjectSnapshot, type BuildStudioProjectGuideRequest } from "../../../../../lib/build-studio-project-documents";
import { renderBuildStudioProjectPdf } from "../../../../../lib/build-studio-project-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as BuildStudioProjectGuideRequest;
    const snapshot = await buildCurrentBuildStudioProjectSnapshot(body);
    const pdf = await renderBuildStudioProjectPdf(snapshot);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="konta-mou-paint-build-project-guide.pdf"',
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "project_guide_failed";
    const validation = /required|invalid|not found|not technically verified|blocked|requires technical/i.test(message);
    return Response.json(
      { error: validation ? "project_guide_not_issuable" : "project_guide_failed", message },
      { status: validation ? 400 : 503, headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}
