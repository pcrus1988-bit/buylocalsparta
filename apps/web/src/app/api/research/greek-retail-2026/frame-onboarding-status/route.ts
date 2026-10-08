import { researchB2cFrameStatus } from "../../../../../lib/research-b2c-frame-onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Minimal operational status only. Never returns email identities or counts. */
export async function GET() {
  try {
    const status = await researchB2cFrameStatus();
    return Response.json(
      { coverage: "greek-retail-kad-2025-all-retail-v2", ...status },
      {
        status: status.state === "unavailable" ? 503 : 200,
        headers: { "Cache-Control": "private, no-store, max-age=0" }
      }
    );
  } catch (error) {
    console.error(JSON.stringify({
      level: "error", event: "research.b2c_frame_status_failed",
      error: error instanceof Error ? error.message : "unknown"
    }));
    return Response.json(
      { coverage: "greek-retail-kad-2025-all-retail-v2", state: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
