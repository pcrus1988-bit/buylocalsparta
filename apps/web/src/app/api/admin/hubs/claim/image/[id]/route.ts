import type { SqlRow } from "@buy-local-sparta/core";
import { serverObjectStorageFromEnv } from "@buy-local-sparta/object-storage";
import { getAdminSession } from "../../../../../../../lib/admin-session";
import { hasAdminPermission } from "../../../../../../../lib/admin-runtime";
import { getProductionPostgresRuntime } from "../../../../../../../lib/postgres-runtime";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin || (!admin.roles.includes("super_admin") && !hasAdminPermission(admin, "vendor.manage"))) {
    return new Response(null, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
  const { id } = await params;
  if (!/^media_[a-f0-9]{32}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const q = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
      SELECT pm.object_key,pm.content_type,pm.byte_size
      FROM hub_claim_profile_media cm
      JOIN hub_expansion_prospects h ON h.id=cm.claim_id AND h.plan_code='claim'
      JOIN product_media pm ON pm.id=cm.media_id
      WHERE pm.public_id=$1
        AND pm.kind='image'
        AND pm.scan_status='clean'
        AND cm.publication_status IN ('pending_review','published')
      LIMIT 1`, [id]);
    if (!q.rowCount) return new Response(null, { status: 404 });
    const row = q.rows[0];
    const type = String(row.content_type);
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return new Response(null, { status: 404 });
    const objectKey = String(row.object_key);
    if (!objectKey.startsWith("private/verified-media/" + id + "/")) return new Response(null, { status: 404 });
    const expected = Number(row.byte_size);
    if (!Number.isSafeInteger(expected) || expected <= 0 || expected > 4 * 1024 * 1024) return new Response(null, { status: 404 });
    const media = await serverObjectStorageFromEnv({ defaultBucket: "buy-local-sparta-private" }).read(objectKey);
    if (media.contentType !== type || (media.byteSize !== undefined && media.byteSize !== expected)) throw new Error("CLAIM_ADMIN_MEDIA_MISMATCH");
    const iterator = media.stream[Symbol.asyncIterator]();
    return new Response(new ReadableStream<Uint8Array>({
      async pull(controller) {
        try { const item = await iterator.next(); if (item.done) controller.close(); else controller.enqueue(item.value); }
        catch (error) { controller.error(error); }
      },
      async cancel() { if (iterator.return) await iterator.return(); }
    }), { headers: {
      "Content-Type": type, "Content-Length": String(expected),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline", "Cross-Origin-Resource-Policy": "same-origin"
    } });
  } catch (error) {
    console.error(JSON.stringify({ event: "hub_claim.admin_image_failed", mediaId: id, message: error instanceof Error ? error.message : String(error) }));
    return new Response(null, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
