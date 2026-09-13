import { NextResponse } from "next/server";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";

const BRAND_LIMIT = 24;

type HomepageBrandRow = Readonly<{
  name: string;
  logo_object_key: string;
  product_count: number | string;
}>;

export async function GET() {
  if (!productionDatabaseConfigured()) {
    return NextResponse.json(
      { brands: [] },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  }

  try {
    const result = await getProductionPostgresRuntime().nativePool.query<HomepageBrandRow>(`
      SELECT b.name,
             b.logo_object_key,
             COUNT(DISTINCT cv.id)::integer AS product_count
      FROM canonical_variants cv
      LEFT JOIN product_families pf ON pf.id = cv.family_id
      JOIN brands b ON b.id = COALESCE(cv.brand_id, pf.brand_id)
      WHERE cv.active = true
        AND cv.suppressed = false
        AND cv.recalled = false
        AND b.logo_object_key IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM vendor_offers vo
          JOIN vendor_businesses v ON v.id = vo.vendor_id
          JOIN vendor_locations l ON l.id = vo.location_id
          WHERE vo.canonical_variant_id = cv.id
            AND vo.status = 'approved'
            AND vo.merchant_visible = true
            AND vo.merchant_pause_active = false
            AND vo.customer_price_minor > 0
            AND v.status = 'active'
            AND l.active = true
        )
      GROUP BY b.id, b.name, b.logo_object_key
      ORDER BY product_count DESC, b.name
      LIMIT $1
    `, [BRAND_LIMIT]);

    const brands = result.rows.flatMap((row) => {
      const name = String(row.name ?? "").trim();
      const logoObjectKey = String(row.logo_object_key ?? "").trim();
      const productCount = Number(row.product_count);
      if (!name || !logoObjectKey) return [];
      return [{
        name,
        logoObjectKey,
        productCount: Number.isFinite(productCount) && productCount > 0 ? Math.floor(productCount) : 0
      }];
    });

    return NextResponse.json(
      { brands },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } }
    );
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "homepage.brand_runner_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return NextResponse.json(
      { brands: [] },
      { status: 200, headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } }
    );
  }
}
