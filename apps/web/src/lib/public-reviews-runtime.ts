import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PublicProductReview = Readonly<{
  id: string;
  rating: number;
  body?: string;
  interactionType: "verified_order" | "verified_advice";
  createdAt: number;
  vendorName: string;
  vendorResponse?: string;
}>;

export type PublicProductReviewSummary = Readonly<{
  count: number;
  average: number;
  reviews: readonly PublicProductReview[];
}>;

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const valueText = typeof value === "string" ? value.trim() : ""; return valueText || undefined; }
function epoch(value: unknown): number { const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function integer(value: unknown): number { const parsed = Number(value); return Number.isSafeInteger(parsed) ? parsed : 0; }

export async function publicProductReviews(productPublicId: string): Promise<PublicProductReviewSummary> {
  const productId = productPublicId.trim();
  if (!productId || !productionDatabaseConfigured()) return { count: 0, average: 0, reviews: [] };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  return uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT r.public_id,r.rating,r.body,r.interaction_type,r.published_at,r.created_at,
             vb.trading_name AS vendor_name,vrr.body AS vendor_response,
             COUNT(*) OVER()::integer AS review_count,
             AVG(r.rating) OVER()::numeric(10,4) AS average_rating
      FROM reviews r
      JOIN canonical_variants cv ON cv.id=r.canonical_variant_id
      JOIN vendor_businesses vb ON vb.id=r.vendor_id
      LEFT JOIN vendor_review_responses vrr ON vrr.review_id=r.id AND vrr.vendor_id=r.vendor_id
      WHERE cv.public_id=$1
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        AND r.status='published' AND r.published_at IS NOT NULL
      ORDER BY r.published_at DESC,r.created_at DESC,r.public_id
      LIMIT 100
    `, [productId]);
    const reviews = result.rows.map((row): PublicProductReview => ({
      id:text(row.public_id), rating:integer(row.rating), body:optionalText(row.body), interactionType:text(row.interaction_type) as PublicProductReview["interactionType"],
      createdAt:epoch(row.published_at ?? row.created_at), vendorName:text(row.vendor_name), vendorResponse:optionalText(row.vendor_response)
    }));
    const count = result.rowCount ? integer(result.rows[0].review_count) : 0;
    const average = result.rowCount ? Number(result.rows[0].average_rating ?? 0) : 0;
    return { count, average:Number.isFinite(average) ? Math.round(average * 10) / 10 : 0, reviews };
  }, { readOnly: true });
}
