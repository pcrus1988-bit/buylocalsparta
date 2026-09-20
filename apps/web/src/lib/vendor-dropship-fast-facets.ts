import type { VendorDropshipFacets } from "./vendor-dropship-catalog-page";
import { getContextualVendorDropshipFacets } from "./vendor-dropship-contextual-facets";

/**
 * The initial vendor facet payload must reflect the same live family overlay as
 * filtered catalogue requests. The old five-minute cached materialized facet
 * table could advertise only a few hundred Nova families while tens of thousands
 * already had fresh authoritative availability.
 *
 * The contextual facet query reads the compact incremental Nova projection plus
 * the stable materialized projection for all other suppliers, so it remains
 * bounded without rebuilding supplier families in a customer request.
 */
export function getFastVendorDropshipFacets(vendorId: string): Promise<VendorDropshipFacets> {
  return getContextualVendorDropshipFacets(vendorId);
}
