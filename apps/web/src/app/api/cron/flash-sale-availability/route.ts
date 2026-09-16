import { runFlashSaleAvailabilityWarmup } from "../../../../lib/flash-sale-availability-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const configured = Number(process.env.BLS_FLASH_AVAILABILITY_CRON_PRODUCTS || 14);
    const maxProducts = Number.isSafeInteger(configured) && configured > 0 ? configured : 14;
    const result = await runFlashSaleAvailabilityWarmup(maxProducts);
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "flash_sale_availability_warmup_failed";
    console.error(JSON.stringify({ level: "error", event: "flash_sale.availability_warmup_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
