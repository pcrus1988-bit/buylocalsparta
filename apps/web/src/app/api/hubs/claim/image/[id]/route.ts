import type { SqlRow } from "@buy-local-sparta/core";
import { serverObjectStorageFromEnv } from "@buy-local-sparta/object-storage";
import { getProductionPostgresRuntime } from "../../../../../../lib/postgres-runtime";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^media_[a-f0-9]{32}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const record = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
      SELECT pm.object_key,pm.content_type,pm.byte_size
      FROM hub_claim_profile_media cm
      JOIN hub_expansion_prospects h ON h.id=cm.claim_id
      JOIN product_media pm ON pm.id=cm.media_id
      WHERE pm.public_id=$1 AND h.plan_code='claim' AND h.status='converted'
        AND h.owner_user_id IS NOT NULL
        AND cm.publication_status='published'
        AND ((cm.role='logo' AND h.claim_logo_media_id=$1) OR
             (cm.role='cover' AND h.claim_cover_media_id=$1))
        AND pm.kind='image' AND pm.scan_status='clean'
        AND pm.rights_status='approved' AND pm.moderation_status='approved'
      LIMIT 1`, [id]);
    if (!record.rowCount) return new Response(null, { status: 404 });
    const row = record.rows[0];
    const contentType = String(row.content_type);
    const byteSize = Number(row.byte_size);
    if (!TYPES.has(contentType) || !Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > 4*1024*1024) {
      return new Response(null, { status: 404 });
    }
    const objectKey = String(row.object_key);
    if (!objectKey.startsWith("private/verified-media/" + id + "/")) return new Response(null, { status: 404 });
    const object = await serverObjectStorageFromEnv({ defaultBucket: "buy-local-sparta-private" }).read(objectKey);
    if (object.contentType !== contentType || (object.byteSize !== undefined && object.byteSize !== byteSize)) {
      throw new Error("Claim image storage metadata mismatch");
    }
    const iterator = object.stream[Symbol.asyncIterator]();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try { const item = await iterator.next(); if (item.done) controller.close(); else controller.enqueue(item.value); }
        catch (error) { controller.error(error); }
      },
      async cancel() { if (iterator.return) await iterator.return(); }
    });
    return new Response(stream, { headers: {
      "Content-Type": contentType, "Content-Length": String(byteSize),
      "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "public, max-age=60, must-revalidate"
    } });
  } catch (error) {
    console.error(JSON.stringify({ event: "hub_claim.public_media_error", mediaId: id, message: error instanceof Error ? error.message : String(error) }));
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
