import { requireAccountSession } from "../../../../../../lib/account-session";
import { getCustomerBuildStudioDocument } from "../../../../../../lib/build-studio-project-documents";
import { renderBuildStudioProjectPdf } from "../../../../../../lib/build-studio-project-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAccountSession();
    const { id } = await context.params;
    const snapshot = await getCustomerBuildStudioDocument(principal.userId, id);
    if (!snapshot) return Response.json({ error: "document_not_found" }, { status: 404 });

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
    const message = error instanceof Error ? error.message : "document_pdf_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 503 });
  }
}
