import { novaBrandsGatewaySourceCategoryPath } from "./nova-brandsgateway-source-category";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

/**
 * Load the provider-native NOVA/BrandsGateway category evidence for the visible
 * vendor page in one bounded query. Canonical taxonomy can legitimately still
 * be empty while the supplier API category is already known, so pricing must
 * use the source evidence instead of waiting for canonical classification.
 */
export async function loadNovaBrandsGatewaySourceCategories(
  vendorIdentity: string,
  offerPublicIds: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  const offerIds = [...new Set(offerPublicIds.map((value) => value.trim()).filter(Boolean))].slice(0, 100);
  if (!productionDatabaseConfigured() || !vendorIdentity || !offerIds.length) return new Map();

  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT vo.public_id offer_id,
           csp.normalized_payload->'categoryDetails' category_details,
           csp.normalized_payload->'categories' categories
      FROM vendor_offers vo
      JOIN vendor_businesses vb ON vb.id=vo.vendor_id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      LEFT JOIN catalog_source_products csp ON csp.id=dso.source_product_id
     WHERE (vb.public_id=$1 OR vb.id::text=$1)
       AND ds.owner_vendor_id=vb.id
       AND ds.code='nova_brandsgateway'
       AND vo.public_id=ANY($2::text[])
  `, [vendorIdentity, offerIds]);

  const categories = new Map<string, string>();
  for (const row of result.rows) {
    const path = novaBrandsGatewaySourceCategoryPath(row.category_details, row.categories);
    if (path) categories.set(String(row.offer_id), path);
  }
  return categories;
}
