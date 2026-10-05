import { requireAccountSession } from "../../../../../../../lib/account-session";
import { readCustomerSavedTryOnImage } from "../../../../../../../lib/try-on-runtime";

type RouteProps = Readonly<{ params: Promise<{ id: string }> }>;

function streamBody(source: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return?.();
    }
  });
}

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const principal = await requireAccountSession();
    const { id } = await params;
    const image = await readCustomerSavedTryOnImage(principal.userId, id);
    if (!image) return Response.json({ error: "TRY_ON_NOT_FOUND" }, { status: 404 });
    return new Response(streamBody(image.stream), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRY_ON_IMAGE_FAILED";
    return Response.json({ error: message }, {
      status: message === "AUTH_REQUIRED" ? 401 : 400,
      headers: { "Cache-Control": "no-store, private" }
    });
  }
}
