import { createHash, randomUUID } from "node:crypto";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";
import { ANALYTICS_ID_COOKIE, cookieValue } from "../../../../lib/privacy-consent";
import { hasVerifiedAnalyticsConsent } from "../../../../lib/privacy-consent-server";
import { getVisitorKey } from "../../../../lib/visitor";

type ClientEventType = "page_view" | "engagement" | "add_to_cart";
const EVENT_TYPES = new Set<ClientEventType>(["page_view", "engagement", "add_to_cart"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ANALYTICS_ID_RE = /^[A-Za-z0-9_-]{16,128}$/;

function visitorHash(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
}

export async function POST(request: Request) {
  try {
    if (!productionDatabaseConfigured()) return Response.json({ accepted: false }, { status: 503 });

    const cookieHeader = request.headers.get("cookie") ?? "";
    if (!hasVerifiedAnalyticsConsent(cookieHeader)) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    const analyticsKey = cookieValue(cookieHeader, ANALYTICS_ID_COOKIE);
    if (!analyticsKey || !SAFE_ANALYTICS_ID_RE.test(analyticsKey)) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

    const raw = await request.json() as Record<string, unknown>;
    const eventType = raw.eventType as ClientEventType;
    const canonicalVariantPublicId = typeof raw.canonicalVariantId === "string" ? raw.canonicalVariantId.trim() : "";
    const eventId = typeof raw.eventId === "string" ? raw.eventId.trim() : "";
    const viewId = typeof raw.viewId === "string" && UUID_RE.test(raw.viewId) ? raw.viewId : null;
    const surface = typeof raw.surface === "string" && /^[a-z0-9_-]{1,40}$/i.test(raw.surface) ? raw.surface : "unknown";
    const engagedSeconds = eventType === "engagement" ? Number(raw.engagedSeconds) : 0;

    if (!EVENT_TYPES.has(eventType) || !canonicalVariantPublicId || canonicalVariantPublicId.length > 160 || !SAFE_ID_RE.test(eventId)) {
      return Response.json({ error: "invalid_product_analytics_event" }, { status: 400 });
    }
    if (eventType === "engagement" && (!Number.isSafeInteger(engagedSeconds) || engagedSeconds < 1 || engagedSeconds > 30 || !viewId)) {
      return Response.json({ error: "invalid_engagement_heartbeat" }, { status: 400 });
    }

    const marketplaceHash = visitorHash(await getVisitorKey());
    const analyticsHash = visitorHash(analyticsKey);
    const pool = getProductionPostgresRuntime().nativePool;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const assignment = await client.query(`
        SELECT fae.id, fae.canonical_variant_id, fae.selected_offer_id, fae.selected_vendor_id, c.code AS category_code
        FROM fairness_assignment_events fae
        JOIN canonical_variants cv ON cv.id=fae.canonical_variant_id
        JOIN categories c ON c.id=cv.category_id
        JOIN vendor_offers vo ON vo.id=fae.selected_offer_id AND vo.vendor_id=fae.selected_vendor_id AND vo.canonical_variant_id=fae.canonical_variant_id
        WHERE fae.visitor_hash=$1 AND cv.public_id=$2 AND fae.created_at >= now() - interval '31 days'
        ORDER BY fae.created_at DESC
        LIMIT 1
      `, [marketplaceHash, canonicalVariantPublicId]);

      if (!assignment.rowCount) {
        await client.query("ROLLBACK");
        return Response.json({ accepted: false, reason: "no_fairness_assignment" }, { status: 202, headers: { "cache-control": "no-store" } });
      }
      const row = assignment.rows[0];
      const dedupeKey = `client:${eventType}:${eventId}`;
      await client.query(`
        INSERT INTO product_analytics_events (
          event_type, visitor_hash, canonical_variant_id, vendor_id, vendor_offer_id,
          fairness_event_id, view_id, engaged_seconds, quantity, attribution_source, idempotency_key, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'fairness',$10,$11::jsonb)
        ON CONFLICT (idempotency_key) DO NOTHING
      `, [eventType, analyticsHash, row.canonical_variant_id, row.selected_vendor_id, row.selected_offer_id, row.id, viewId, engagedSeconds,
        eventType === "add_to_cart" ? 1 : null, dedupeKey, JSON.stringify({ surface, categoryCode: row.category_code })]);

      const eventName = eventType === "page_view" ? "product.viewed" : eventType === "add_to_cart" ? "cart.item_added" : undefined;
      if (eventName) {
        await client.query(`
          INSERT INTO analytics_events (
            id,public_id,market_id,event_name,occurred_at,visitor_hash,vendor_id,canonical_variant_id,
            quantity,metadata,dedupe_key,retention_until
          ) VALUES (
            $1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,now(),$4,$5,$6,$7,$8::jsonb,$9,now()+interval '13 months'
          )
          ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        `, [randomUUID(), `an_${randomUUID()}`, eventName, analyticsHash, row.selected_vendor_id, row.canonical_variant_id,
          eventType === "add_to_cart" ? 1 : null, JSON.stringify({ surface, categoryCode: row.category_code }), dedupeKey]);
      }
      await client.query("COMMIT");
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "product_analytics.capture_failed", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "product_analytics_capture_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
