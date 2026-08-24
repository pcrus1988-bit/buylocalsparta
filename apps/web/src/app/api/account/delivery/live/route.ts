import { requireAccountSession } from "../../../../../lib/account-session";
import { deliveryCustomerLiveSnapshot } from "../../../../../lib/delivery-customer-live";

export async function GET(request: Request) {
  try {
    const principal = await requireAccountSession(request);
    const jobId = new URL(request.url).searchParams.get("jobId")?.trim() ?? "";
    if (!jobId) {
      return Response.json({ error: "jobId_required" }, { status: 400 });
    }
    return Response.json(await deliveryCustomerLiveSnapshot(principal, jobId), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "delivery_live_unavailable";
    return Response.json({ error: message }, { status: message === "delivery_job_not_found" ? 404 : 401 });
  }
}
