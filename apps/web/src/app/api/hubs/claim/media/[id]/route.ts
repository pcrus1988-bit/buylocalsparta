import { readHubClaimMediaObject } from "../../../../../../lib/hub-claim-media-runtime";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const image = await readHubClaimMediaObject(id);
    if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
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
      "Content-Type": image.contentType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "public, max-age=300, must-revalidate"
    } });
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
