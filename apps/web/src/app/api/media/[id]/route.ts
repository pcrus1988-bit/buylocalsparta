import { readApprovedPublicMedia } from "../../../../lib/public-media-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^media_[A-Za-z0-9_-]{8,128}$/.test(id)) return new Response(null, { status: 404, headers: noStoreHeaders() });

  try {
    const media = await readApprovedPublicMedia(id);
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
    console.error(JSON.stringify({ level: "error", event: "storefront.public_media_read_failed", mediaId: id, message: error instanceof Error ? error.message : String(error) }));
    return new Response(null, { status: 503, headers: { ...noStoreHeaders(), "Retry-After": "30" } });
  }
}

function noStoreHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache"
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
