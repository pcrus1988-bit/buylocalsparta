import { requireVendorSession } from "../../../../../lib/vendor-session";
import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";

export async function GET(request: Request) {
  try {
    const principal = await requireVendorSession(request, false);
    if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
    const result = await getProductionPostgresRuntime().sqlPool.query(`
      SELECT o.public_id AS offer_id,r.status,r.requested_at
      FROM public.vendor_product_activation_requests r
      JOIN public.vendor_offers o ON o.id=r.offer_id
      JOIN public.vendor_businesses v ON v.id=r.vendor_id
      WHERE (v.public_id=$1 OR v.id::text=$1) AND r.status='pending'
      ORDER BY r.requested_at DESC
    `, [principal.vendorId]);
    return Response.json({ requests: result.rows.map((row) => ({ offerId: String(row.offer_id), status: String(row.status), requestedAt: new Date(String(row.requested_at)).getTime() })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "activation_requests_failed" }, { status: 400 });
  }
}
