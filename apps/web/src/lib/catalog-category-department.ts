import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

type DepartmentRow = Readonly<{
  canonical_public_id: string;
  department_code: string;
}>;

/**
 * Resolve each canonical leaf category to its governed top-level department.
 * Storefront discovery categories can then remain stable even as the PIM grows
 * hundreds of specific product classes whose codes do not share a text prefix.
 */
export async function loadCatalogDepartmentCodes(
  canonicalVariantIds: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  const ids = [...new Set(canonicalVariantIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0 || !productionDatabaseConfigured()) return new Map();

  try {
    const result = await getProductionPostgresRuntime().nativePool.query<DepartmentRow>(`
      WITH RECURSIVE category_tree AS (
        SELECT c.id,c.parent_id,c.code,c.code AS department_code
        FROM categories c
        JOIN markets m ON m.id=c.market_id
        WHERE m.code='sparta' AND c.parent_id IS NULL
        UNION ALL
        SELECT child.id,child.parent_id,child.code,parent.department_code
        FROM categories child
        JOIN category_tree parent ON child.parent_id=parent.id
      )
      SELECT cv.public_id AS canonical_public_id,tree.department_code
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id
      JOIN category_tree tree ON tree.id=cv.category_id
      WHERE m.code='sparta'
        AND cv.public_id=ANY($1::text[])
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
    `, [ids]);
    return new Map(result.rows.map((row) => [String(row.canonical_public_id), String(row.department_code)]));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.catalog_department_projection_failed",
      canonicalVariantCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Map();
  }
}
