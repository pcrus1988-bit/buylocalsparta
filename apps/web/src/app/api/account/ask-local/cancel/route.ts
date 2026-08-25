import { requireAccountSession } from "../../../../../lib/account-session";
import { customerAskLocalBrowserRequests } from "../../../../../lib/customer-ask-local-browser-view";
import { customerCancelAskLocalRequest } from "../../../../../lib/ask-local-lifecycle-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const requestReference = typeof body.requestReference === "string" ? body.requestReference.trim() : "";
    if (!requestReference) throw new Error("Ask Local request is required.");
    await customerCancelAskLocalRequest(principal, requestReference);
    return Response.json({ requests: await customerAskLocalBrowserRequests(principal) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ask_local_cancel_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
