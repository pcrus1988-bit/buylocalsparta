import { deliveryManagerStatistics, parseDeliveryReportFilters } from "../../../../../lib/delivery-report-runtime";
import { requireDeliveryManagerSession } from "../../../../../lib/delivery-manager-session";

export async function GET(request: Request) {
  try {
    const principal = await requireDeliveryManagerSession(request, false);
    const url = new URL(request.url);
    const filters = parseDeliveryReportFilters(url);
    return Response.json(await deliveryManagerStatistics(principal, filters), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "delivery_statistics_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
