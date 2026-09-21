import { getAccountSession } from "../../../../lib/account-session";
import {
  readPaintBuildSnapshot,
  savePaintBuildProjectDocument
} from "../../../../lib/paint-build-project-documents";
import { renderPaintBuildProjectPdf } from "../../../../lib/paint-build-project-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeSnapshotId(value: string | null): string {
  const id = value?.trim() ?? "";
  if (!/^PBS_[a-f0-9]{32}$/i.test(id)) throw new Error("INVALID_SNAPSHOT_ID");
  return id;
}

export async function GET(request: Request) {
  try {
    const snapshotId = safeSnapshotId(new URL(request.url).searchParams.get("snapshotId"));
    const principal = await getAccountSession();
    const customerPrincipal = principal?.roles.includes("customer") ? principal : undefined;
    const record = await readPaintBuildSnapshot(snapshotId, customerPrincipal);
    const pdf = await renderPaintBuildProjectPdf(record.snapshot, record.publicId);
    let documentId = "";
    if (record.userId && customerPrincipal) {
      const saved = await savePaintBuildProjectDocument(record, customerPrincipal, pdf);
      documentId = saved.publicId;
    }
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="konta-mou-paint-build-guide.pdf"',
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        ...(documentId ? { "X-Konta-Mou-Document-Id": documentId } : {})
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "AUTH_REQUIRED" ? 401
      : message === "FORBIDDEN" ? 403
      : /NOT_FOUND/.test(message) ? 404
      : /INVALID/.test(message) ? 400
      : 503;
    if (status >= 500) console.error(JSON.stringify({ level: "error", event: "build_studio.project_pdf_failed", message }));
    return Response.json({ error: status >= 500 ? "pdf_unavailable" : message.toLowerCase() }, {
      status,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }
}
