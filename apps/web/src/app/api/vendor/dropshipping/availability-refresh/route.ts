import { runNovaAvailabilityRefreshForProduct } from "../../../../../lib/nova-availability-refresh-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../lib/postgres-runtime";
import { assertDropshippingOnlyVendor } from "../../../../../lib/vendor-dropshipping-access";
import { requireVendorSession } from "../../../../../lib/vendor-session";

const NOVA_SUPPLIER_CODE = "nova_brandsgateway";
const TARGETED_REFRESH_COOLDOWN_MS = 2 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    if (!principal.vendorId) throw new Error("VENDOR_AUTH_REQUIRED");
    await assertDropshippingOnlyVendor(principal.vendorId);
    if (!productionDatabaseConfigured()) throw new Error("Η ανανέωση διαθεσιμότητας απαιτεί ενεργή βάση δεδομένων.");

    const body = await request.json() as Record<string, unknown>;
    const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
    if (!offerId) throw new Error("Απαιτείται προϊόν.");

    const db = getProductionPostgresRuntime().sqlPool;
    const product = await db.query(`
      SELECT dso.external_product_id,
             dso.availability_checked_at,
             ds.owner_vendor_id::text owner_vendor_id
      FROM public.vendor_offers vo
      JOIN public.vendor_businesses vb ON vb.id=vo.vendor_id
      JOIN public.dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN public.dropship_suppliers ds ON ds.id=dso.supplier_id
      WHERE vo.public_id=$1
        AND (vb.public_id=$2 OR vb.id::text=$2)
        AND ds.owner_vendor_id=vo.vendor_id
        AND ds.code=$3
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND dso.active=true
        AND dso.external_product_id IS NOT NULL
      LIMIT 1
    `, [offerId, principal.vendorId, NOVA_SUPPLIER_CODE]);

    if (product.rowCount !== 1) {
      throw new Error("Το προϊόν δεν βρέθηκε στον ενεργό NOVA/BrandsGateway supplier ή δεν ανήκει στον vendor.");
    }

    const row = product.rows[0];
    const checkedAt = row.availability_checked_at ? new Date(String(row.availability_checked_at)).getTime() : Number.NaN;
    if (Number.isFinite(checkedAt) && Date.now() - checkedAt < TARGETED_REFRESH_COOLDOWN_MS) {
      return Response.json({ ok: true, alreadyFresh: true, updatedOffers: 0 });
    }

    const externalProductId = String(row.external_product_id).trim();
    const ownerVendorId = String(row.owner_vendor_id).trim();
    const refreshed = await runNovaAvailabilityRefreshForProduct(externalProductId, ownerVendorId);
    if (refreshed.updatedOffers < 1) {
      throw new Error("Η NOVA επέστρεψε availability, αλλά δεν αντιστοιχίστηκε σε ενεργό variant του vendor.");
    }
    return Response.json({ ok: true, alreadyFresh: false, ...refreshed });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "dropshipping_availability_refresh_failed" },
      { status: 400 }
    );
  }
}
