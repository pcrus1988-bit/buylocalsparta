import { requireAccountSession } from "../../../../lib/account-session";
import { submitAskLocal } from "../../../../lib/ask-local-service";
import { customerAskLocalBrowserRequest, customerAskLocalBrowserRequests } from "../../../../lib/customer-ask-local-browser-view";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json({ requests: await customerAskLocalBrowserRequests(principal), csrfToken: principal.csrfToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const created = await submitAskLocal(principal, {
      need: typeof body.need === "string" ? body.need : "",
      postcode: typeof body.postcode === "string" ? body.postcode : "",
      quantity: typeof body.quantity === "number" ? body.quantity : Number(body.quantity),
      sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined,
      canonicalVariantId: typeof body.canonicalVariantId === "string" ? body.canonicalVariantId : undefined,
      preferredVendorId: typeof body.preferredVendorId === "string" ? body.preferredVendorId : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      voiceTranscript: typeof body.voiceTranscript === "string" ? body.voiceTranscript : undefined,
      barcode: typeof body.barcode === "string" ? body.barcode : undefined,
      referenceImageDataUrl: typeof body.referenceImageDataUrl === "string" ? body.referenceImageDataUrl : undefined,
      captureSource: typeof body.captureSource === "string" ? body.captureSource : undefined
    });
    return Response.json({ request: customerAskLocalBrowserRequest(principal, created) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
