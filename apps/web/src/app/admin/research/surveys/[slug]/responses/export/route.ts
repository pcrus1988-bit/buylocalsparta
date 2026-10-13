import type { NextRequest } from "next/server";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import {
  exportResearchResponseCsv, rawResearchAnswerAccess
} from "../../../../../../../lib/research-survey-response-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: {
  params: Promise<{ slug: string }>;
}): Promise<Response> {
  const principal = await getAdminSession();
  if (!principal) return new Response("Authentication required", { status: 401 });
  if (!hasAdminPermission(principal, "research.read") || !rawResearchAnswerAccess(principal)) {
    return new Response("Research analysis permission required", { status: 403 });
  }
  const { slug } = await context.params;
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const id = request.nextUrl.searchParams.get("q") ?? undefined;
  try {
    const csv = await exportResearchResponseCsv(principal, slug, status, id);
    if (csv === undefined) return new Response("Study not found", { status: 404 });
    const safeName = /^[a-z0-9-]{3,80}$/.test(slug) ? slug : "study";
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="' + safeName + '-answers.csv"',
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RESEARCH_EXPORT_INVALID_ID") {
      return new Response("Enter a valid full questionnaire ID", { status: 400 });
    }
    if (error instanceof Error && error.message === "RESEARCH_EXPORT_TOO_LARGE") {
      return new Response("Export exceeds 50,000 answer rows. Apply a status filter or use an approved batch export.", {
        status: 413, headers: { "Cache-Control": "no-store" }
      });
    }
    console.error(JSON.stringify({
      event: "research.responses.csv_export_failed",
      type: error instanceof Error ? error.name : "unknown"
    }));
    return new Response("Questionnaire export is temporarily unavailable", {
      status: 503, headers: { "Cache-Control": "no-store" }
    });
  }
}
