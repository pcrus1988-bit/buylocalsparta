import { NIKOLAOU_IMPORT_LIMITS, adminStageNikolaouGzip } from "../../../../../lib/admin-catalogue-import";
import { requireAdminSession } from "../../../../../lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_BYTES = NIKOLAOU_IMPORT_LIMITS.maxCompressedBytes + 256 * 1024;

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) throw new Error("Catalogue import request exceeds the multipart safety limit");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("A gzip file is required");
    if (file.size === 0) throw new Error("Uploaded gzip is empty");
    if (file.size > NIKOLAOU_IMPORT_LIMITS.maxCompressedBytes) throw new Error("Uploaded gzip exceeds the 2 MB import limit");

    const result = await adminStageNikolaouGzip(principal, {
      uploadedFilename: file.name,
      compressed: new Uint8Array(await file.arrayBuffer())
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "catalogue_import_upload_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
