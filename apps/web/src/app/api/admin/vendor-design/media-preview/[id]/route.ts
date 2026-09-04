import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { readAdminVendorMediaPreview } from "../../../../../../lib/admin-vendor-media-preview";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const principal = await getAdminSession();
  if (!principal) return new Response(null, { status: 401, headers: noStoreHeaders() });
  if (!hasAdminPermission(principal, "vendor.manage")) return new Response(null, { status: 403, headers: noStoreHeaders() });

  const { id } = await context.params;
  try {
    const media = await readAdminVendorMediaPreview(principal, id);
    if (!media) return new Response(null, { status: 404, headers: noStoreHeaders() });
    return new Response(toWebStream(media.stream), {
      status: 200,
      headers: {
        ...noStoreHeaders(),
        "Content-Type": media.contentType,
        "Content-Length": String(media.byteSize),
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "admin.vendor_design_media_preview_failed",
      mediaId: id,
      actorId: principal.userId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Response(null, { status: 503, headers: { ...noStoreHeaders(), "Retry-After": "30" } });
  }
}

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  };
}

function toWebStream(source: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      if (iterator.return) await iterator.return();
    }
  });
}
