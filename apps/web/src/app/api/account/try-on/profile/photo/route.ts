import { requireAccountSession } from "../../../../../../lib/account-session";
import { readCustomerTryOnReference } from "../../../../../../lib/try-on-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const result = await readCustomerTryOnReference(principal.userId);
    if (!result) return new Response(null, { status: 404, headers: noStore() });
    return new Response(toWebStream(result.object.stream), {
      status: 200,
      headers: {
        ...noStore(),
        "Content-Type": result.profile.contentType,
        "Content-Length": String(result.profile.byteSize),
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_REFERENCE_FAILED";
    return new Response(null, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: noStore() });
  }
}

function noStore(): Record<string,string> {
  return { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache" };
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
