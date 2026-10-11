import { requireAdminSession } from "../../../../../../lib/admin-session";
import { readHubClaimMediaObject } from "../../../../../../lib/hub-claim-media-runtime";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession(request, { permission: "vendor.manage" });
    const { id } = await params;
    const image = await readHubClaimMediaObject(id, true);
    if (!image) return new Response(null, { status: 404 });
    const iterator = image.stream[Symbol.asyncIterator]();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const part = await iterator.next();
          if (part.done) controller.close();
          else controller.enqueue(part.value);
        } catch (error) { controller.error(error); }
      },
      async cancel() { if (iterator.return) await iterator.return(); }
    });
    return new Response(stream, { headers: {
      "Content-Type": image.contentType, "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"
    } });
  } catch { return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } }); }
}
