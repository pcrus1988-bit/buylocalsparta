import { createHash } from "node:crypto";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";
import { getVisitorKey } from "../../../../lib/visitor";

type ClientEventType = "page_view" | "engagement" | "add_to_cart";
const EVENT_TYPES = new Set<ClientEventType>(["page_view", "engagement", "add_to_cart"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

function visitorHash(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
}

export async function POST(request: Request) {
  try {
    if (!productionDatabaseConfigured()) return Response.json({ accepted: false }, { status: 503 });
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

    const hash = visitorHash(await getVisitorKey());
    const pool = getProductionPostgresRuntime().nativePool;
    const assignment = await pool.query(`
      SELECT fae.id, fae.canonical_variant_id, fae.selected_offer_id, fae.selected_vendor_id
      FROM fairness_assignment_events fae
      JOIN canonical_variants cv ON cv.id=fae.canonical_variant_id
      JOIN vendor_offers vo ON vo.id=fae.selected_offer_id AND vo.vendor_id=fae.selected_vendor_id AND vo.canonical_variant_id=fae.canonical_variant_id
      WHERE fae.visitor_hash=$1 AND cv.public_id=$2 AND fae.created_at >= now() - interval '31 days'
      ORDER BY fae.created_at DESC
      LIMIT 1
    `, [hash, canonicalVariantPublicId]);

    if (!assignment.rowCount) return Response.json({ accepted: false, reason: "no_fairness_assignment" }, { status: 202 });
    const row = assignment.rows[0];
    await pool.query(`
      INSERT INTO product_analytics_events (
        event_type, visitor_hash, canonical_variant_id, vendor_id, vendor_offer_id,
        fairness_event_id, view_id, engaged_seconds, attribution_source, idempotency_key, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'fairness',$9,$10::jsonb)
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [eventType, hash, row.canonical_variant_id, row.selected_vendor_id, row.selected_offer_id, row.id, viewId, engagedSeconds,
      `client:${eventType}:${eventId}`, JSON.stringify({ surface })]);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "product_analytics.capture_failed", message: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "product_analytics_capture_failed" }, { status: 500 });
  }
}
