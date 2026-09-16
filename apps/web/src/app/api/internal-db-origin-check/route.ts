import { NextResponse } from "next/server";
import { getProductionPostgresRuntime } from "../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TARGET_SLUG = "black-crystal-embellished-high-slit-skirt-10739375-10739377-f0c9ff2d94db6638903f";

export async function GET() {
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query<{
    database_name: string;
    current_schema_name: string;
    canonical_variant_id: string;
    el_title: string | null;
    en_title: string | null;
    projected_title: string;
  }>(`
    SELECT current_database() AS database_name,
           current_schema() AS current_schema_name,
           cv.id::text AS canonical_variant_id,
           el.title AS el_title,
           en.title AS en_title,
           COALESCE(el.title,en.title,cv.model,cv.slug) AS projected_title
    FROM canonical_variants cv
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE cv.slug=$1
    LIMIT 1
  `,[TARGET_SLUG]);
  const row=result.rows[0];
  return NextResponse.json({
    found:Boolean(row),
    databaseName:row?.database_name ?? null,
    currentSchema:row?.current_schema_name ?? null,
    canonicalVariantId:row?.canonical_variant_id ?? null,
    hasGreek:Boolean(row?.el_title),
    greekTitle:row?.el_title ?? null,
    englishTitle:row?.en_title ?? null,
    projectedTitle:row?.projected_title ?? null
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
