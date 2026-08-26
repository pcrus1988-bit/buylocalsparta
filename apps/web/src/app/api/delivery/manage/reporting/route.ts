import {
  correctDeliveryDriverShift,
  deliveryManagerReportingSnapshot,
  type DeliveryHistoryView,
  type DeliveryShiftView,
} from "../../../../../lib/delivery-operations-reporting";
import { requireDeliveryManagerSession } from "../../../../../lib/delivery-manager-session";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function iso(value?: number) { return value ? new Date(value).toISOString() : ""; }

function deliveryCsv(rows: readonly DeliveryHistoryView[]) {
  const header = ["delivery_id","order_id","driver_id","driver_name","type","status","packages","assigned_at","started_at","completed_at","promised_by","completed_stops","total_stops","late"];
  return [header, ...rows.map((row) => [
    row.id,row.orderId,row.driverId,row.driverName,row.type,row.status,row.packageCount,
    iso(row.assignedAt),iso(row.startedAt),iso(row.completedAt),iso(row.promisedBy),
    row.completedStops,row.totalStops,row.late,
  ])].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function shiftCsv(rows: readonly DeliveryShiftView[]) {
  const header = ["shift_id","driver_id","driver_name","started_at","ended_at","break_minutes","net_minutes","source","adjusted","note"];
  return [header, ...rows.map((row) => [
    row.id,row.driverId,row.driverName,iso(row.startedAt),iso(row.endedAt),
    row.breakMinutes.toFixed(2),row.netMinutes.toFixed(2),row.source,row.adjusted,row.note,
  ])].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export async function GET(request: Request) {
  try {
    const principal = await requireDeliveryManagerSession(request, false);
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 30);
    const snapshot = await deliveryManagerReportingSnapshot(principal, days);
    if (url.searchParams.get("format") === "csv") {
      const dataset = url.searchParams.get("dataset") === "timekeeping" ? "timekeeping" : "deliveries";
      const csv = dataset === "timekeeping" ? shiftCsv(snapshot.recentShifts) : deliveryCsv(snapshot.history);
      return new Response(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="delivery-${dataset}-${snapshot.rangeDays}d.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_manager_auth_required" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireDeliveryManagerSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    if (String(body.action ?? "") !== "adjust_shift") {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }
    const startedAt = Date.parse(String(body.startedAt ?? ""));
    const endedText = String(body.endedAt ?? "").trim();
    const endedAt = endedText ? Date.parse(endedText) : undefined;
    return Response.json(await correctDeliveryDriverShift(principal, {
      shiftId: String(body.shiftId ?? ""),
      startedAt,
      endedAt,
      reason: String(body.reason ?? ""),
    }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "delivery_manager_operation_failed" }, { status: 400 });
  }
}
