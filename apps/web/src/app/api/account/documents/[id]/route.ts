import { requireAccountSession } from "../../../../../lib/account-session";
import { readPaintBuildDocument } from "../../../../../lib/paint-build-project-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(_request: Request, { params }: Props) {
  try {
    const principal = await requireAccountSession();
    const { id } = await params;
    if (!/^PBD_[a-f0-9]{32}$/i.test(id)) {
      return Response.json({ error: "invalid_document_id" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const pdf = await readPaintBuildDocument(id, principal);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="konta-mou-paint-build-guide.pdf"',
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "AUTH_REQUIRED" ? 401 : /NOT_FOUND/.test(message) ? 404 : 503;
    return Response.json({ error: status >= 500 ? "document_unavailable" : "document_not_found" }, {
      status,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }
}
