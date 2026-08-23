import { adminStageAiProductImport, AI_PRODUCT_IMPORT_LIMITS } from "../../../../../lib/admin-ai-product-import";
import { readAiProductUpload } from "../../../../../lib/ai-product-upload";
import { requireAdminSession } from "../../../../../lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_BYTES = AI_PRODUCT_IMPORT_LIMITS.maxUploadedBytes + 512 * 1024;

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) throw new Error("AI product import request exceeds the multipart safety limit");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("A CSV, TSV or gzip product file is required");
    const sourceCode = String(form.get("sourceCode") ?? "").trim();
    const sourceName = String(form.get("sourceName") ?? "").trim();
    const upload = await readAiProductUpload(file);
    const result = await adminStageAiProductImport(principal, {
      sourceCode,
      sourceName,
      sourceFilename: upload.sourceFilename,
      sourceText: upload.sourceText
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "product_import_stage_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
