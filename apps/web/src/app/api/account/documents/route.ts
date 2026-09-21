import { requireAccountSession } from "../../../../lib/account-session";
import {
  createCustomerBuildStudioDocument,
  listCustomerBuildStudioDocuments,
  type BuildStudioProjectGuideRequest
} from "../../../../lib/build-studio-project-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const documents = await listCustomerBuildStudioDocuments(principal.userId);
    return Response.json({ documents }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "documents_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 503 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as BuildStudioProjectGuideRequest;
    const document = await createCustomerBuildStudioDocument(principal.userId, body);
    return Response.json({ document }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "document_save_failed";
    const status = message === "AUTH_REQUIRED" ? 401 : /csrf/i.test(message) ? 403 : /required|invalid|not found|not technically verified|blocked|requires technical/i.test(message) ? 400 : 503;
    return Response.json({ error: "document_save_failed", message }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
