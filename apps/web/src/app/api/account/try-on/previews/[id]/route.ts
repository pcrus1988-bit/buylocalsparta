import { requireAccountSession } from "../../../../../../lib/account-session";
import {
  deleteCustomerTryOnPreview,
  readCustomerTryOnPreview,
  saveCustomerTryOnPreview
} from "../../../../../../lib/try-on-runtime";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession();
    const { id } = await params;
    const result = await readCustomerTryOnPreview(principal.userId, id);
    if (!result) return new Response(null, { status: 404, headers: noStore() });
    return new Response(toWebStream(result.object.stream), {
      status: 200,
      headers: {
        ...noStore(),
        "Content-Type": result.object.contentType || "image/webp",
        ...(result.object.byteSize ? { "Content-Length": String(result.object.byteSize) } : {}),
        "Content-Disposition": "inline",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_PREVIEW_FAILED";
    return new Response(null, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: noStore() });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    const preview = await saveCustomerTryOnPreview(principal.userId, id);
    return Response.json({ preview }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_PREVIEW_SAVE_FAILED";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    const removed = await deleteCustomerTryOnPreview(principal.userId, id);
    return Response.json({ removed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_PREVIEW_DELETE_FAILED";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
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
