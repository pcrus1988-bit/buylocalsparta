import { gunzipSync } from "node:zlib";
import { analyzeProductImport } from "../../../../../lib/product-import-intelligence-server";
import { requireAdminSession } from "../../../../../lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 512 * 1024;

export async function POST(request: Request) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      throw new Error("AI product import request exceeds the multipart safety limit");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("A CSV, TSV or gzip product file is required");
    if (file.size === 0) throw new Error("Uploaded product file is empty");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("Uploaded product file exceeds the 8 MB analysis limit");

    const uploaded = Buffer.from(await file.arrayBuffer());
    const gzip = file.name.toLowerCase().endsWith(".gz") || file.type.includes("gzip");
    let source: Buffer;
    if (gzip) {
      try {
        source = gunzipSync(uploaded, { maxOutputLength: MAX_SOURCE_BYTES });
      } catch (error) {
        throw new Error(`Unable to safely decompress product import: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else source = uploaded;

    if (source.length > MAX_SOURCE_BYTES) throw new Error("Decompressed product import exceeds the 20 MB analysis limit");
    if (source.includes(0)) throw new Error("Product import appears to be binary rather than CSV/TSV text");

    const sourceFilename = gzip ? file.name.replace(/\.gz$/i, "") : file.name;
    const analysis = analyzeProductImport(source.toString("utf8"), sourceFilename);
    return Response.json({
      ...analysis,
      transport: {
        uploadedFilename: file.name,
        compressed: gzip,
        uploadedBytes: uploaded.length,
        sourceBytes: source.length
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "product_import_analysis_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
