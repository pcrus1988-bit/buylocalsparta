import { createHash } from "node:crypto";
import { getCatalogCard, type CatalogCard } from "./catalog-view";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const ROTATION_WINDOW_MS = 30 * 60 * 1000;
const OPEN_FULFILMENT_STATUSES = ["awaiting_acceptance", "accepted", "picking", "packed", "ready_for_handover", "shipped"] as const;

type HomepageCandidateRow = Readonly<{
  canonical_public_id: string;
  offer_uuid: string;
  offer_public_id: string;
  vendor_uuid: string;
  vendor_public_id: string;
  stock_confirmed_at: Date | string;
  deficit: number | string | null;
  sticky_offer_uuid: string | null;
}>;

type HomepageCandidate = Readonly<{
  id: string;
  predictedVendorId: string;
}>;

function score(seed: string, value: string): string {
  return createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

function visitorHash(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
}

function epoch(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function deterministicTie(input: { variantId: string; postcode: string; now: number; vendorId: string }): string {
  const day = Math.floor(input.now / 86_400_000);
  return createHash("sha256").update(`${input.variantId}|${input.postcode}|${day}|${input.vendorId}`).digest("hex");
}

function predictFairVendor(rows: readonly HomepageCandidateRow[], postcode: string, now: number): string | undefined {
  if (!rows.length) return undefined;

  const stickyOfferUuid = rows.find((row) => row.sticky_offer_uuid)?.sticky_offer_uuid;
  if (stickyOfferUuid) {
    const sticky = rows.find((row) => row.offer_uuid === stickyOfferUuid);
    if (sticky) return sticky.vendor_public_id;
  }

  // Match the fairness engine's "one ticket per vendor" representative rule:
  // freshest eligible offer wins, with offer public id as the stable tie-break.
  const representatives = new Map<string, HomepageCandidateRow>();
  for (const row of rows) {
    const existing = representatives.get(row.vendor_uuid);
    if (!existing || epoch(row.stock_confirmed_at) > epoch(existing.stock_confirmed_at) ||
      (epoch(row.stock_confirmed_at) === epoch(existing.stock_confirmed_at) && row.offer_public_id < existing.offer_public_id)) {
      representatives.set(row.vendor_uuid, row);
    }
  }

  const reps = [...representatives.values()];
  if (!reps.length) return undefined;
  const existingDeficits = reps.flatMap((row) => row.deficit == null ? [] : [Number(row.deficit)]);
  const warmBaseline = existingDeficits.length ? Math.max(...existingDeficits) : 0;
  const increment = 1 / reps.length;
  const canonicalVariantId = rows[0].canonical_public_id;

  return [...reps].sort((left, right) => {
    const leftDeficit = (left.deficit == null ? warmBaseline + 0.25 : Number(left.deficit)) + increment;
    const rightDeficit = (right.deficit == null ? warmBaseline + 0.25 : Number(right.deficit)) + increment;
    const deficitDiff = rightDeficit - leftDeficit;
    if (Math.abs(deficitDiff) > 1e-12) return deficitDiff;

    const freshDiff = epoch(right.stock_confirmed_at) - epoch(left.stock_confirmed_at);
    if (freshDiff) return freshDiff;

    return deterministicTie({ variantId: canonicalVariantId, postcode, now, vendorId: left.vendor_public_id })
      .localeCompare(deterministicTie({ variantId: canonicalVariantId, postcode, now, vendorId: right.vendor_public_id }));
  })[0]?.vendor_public_id;
}

async function loadHomepageCandidates(visitorKey: string, postcode: string, now: number): Promise<readonly HomepageCandidate[]> {
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query<HomepageCandidateRow>(`
    SELECT cv.public_id AS canonical_public_id,
           vo.id::text AS offer_uuid,
           vo.public_id AS offer_public_id,
           v.id::text AS vendor_uuid,
           v.public_id AS vendor_public_id,
           ib.stock_confirmed_at,
           frs.deficit,
           sa.offer_id::text AS sticky_offer_uuid
    FROM canonical_variants cv
    JOIN markets m ON m.id=cv.market_id
    JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    JOIN inventory_balances ib ON ib.offer_id=vo.id
    LEFT JOIN LATERAL (
      SELECT r.max_open_fulfilments
      FROM fulfilment_capacity_rules r
      WHERE r.vendor_id=vo.vendor_id
        AND r.location_id=vo.location_id
        AND r.mode='pickup'::fulfilment_mode
        AND r.active=true
        AND r.starts_at <= $3
        AND (r.ends_at IS NULL OR r.ends_at > $3)
      ORDER BY r.priority DESC,r.starts_at DESC,r.public_id
      LIMIT 1
    ) cap ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS open_count
      FROM fulfilment_orders fo
      JOIN customer_orders co ON co.id=fo.order_id
      WHERE fo.vendor_id=vo.vendor_id
        AND fo.location_id=vo.location_id
        AND fo.mode='pickup'::fulfilment_mode
        AND fo.status=ANY($4::fulfilment_status[])
        AND co.status <> 'pending_payment'
    ) load ON true
    LEFT JOIN fairness_rotation_state frs
      ON frs.market_id=cv.market_id
     AND frs.canonical_variant_id=cv.id
     AND frs.vendor_id=vo.vendor_id
    LEFT JOIN sticky_assignments sa
      ON sa.market_id=cv.market_id
     AND sa.canonical_variant_id=cv.id
     AND sa.visitor_hash=$1
     AND sa.postcode_scope=$2
     AND sa.released_at IS NULL
     AND sa.expires_at>$3
    WHERE m.code='sparta'
      AND cv.active=true
      AND cv.suppressed=false
      AND cv.recalled=false
      AND vo.status='approved'
      AND v.status='active'
      AND l.active=true
      AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
      AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) >= 1
      AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $3
      AND (cap.max_open_fulfilments IS NULL OR COALESCE(load.open_count,0)<cap.max_open_fulfilments)
    ORDER BY cv.public_id,ib.stock_confirmed_at DESC,vo.public_id
  `, [visitorHash(visitorKey), postcode, new Date(now), [...OPEN_FULFILMENT_STATUSES]]);

  const byCanonical = new Map<string, HomepageCandidateRow[]>();
  for (const row of result.rows) {
    const rows = byCanonical.get(row.canonical_public_id) ?? [];
    rows.push(row);
    byCanonical.set(row.canonical_public_id, rows);
  }

  return [...byCanonical.entries()].flatMap(([id, rows]) => {
    const predictedVendorId = predictFairVendor(rows, postcode, now);
    return predictedVendorId ? [{ id, predictedVendorId }] : [];
  });
}

/**
 * Homepage discovery first predicts the existing fairness engine's next vendor
 * read-only, then uses that prediction only to choose a varied set of product
 * families. It never overrides the vendor selected by Fair Vendor Assignment.
 *
 * Crucially, only cards that are actually selected for the four homepage slots
 * call getCatalogCard(). Unshown candidates therefore receive no sticky assignment
 * and no qualified exposure event. When more than one vendor is fairly due across
 * the available products, unseen vendors are preferred for the next homepage slot.
 */
export async function getHomepageCatalogCards(
  visitorKey: string,
  postcode = "23100",
  limit = 4
): Promise<readonly CatalogCard[]> {
  if (limit <= 0 || !productionDatabaseConfigured()) return [];

  const now = Date.now();
  const rotationSlot = Math.floor(now / ROTATION_WINDOW_MS);
  const seed = `${visitorKey}:${rotationSlot}`;
  const remaining = [...await loadHomepageCandidates(visitorKey, postcode, now)]
    .sort((left, right) => score(seed, left.id).localeCompare(score(seed, right.id)));
  const cards: CatalogCard[] = [];
  const visibleVendorIds = new Set<string>();

  while (cards.length < limit && remaining.length) {
    const diverseIndex = remaining.findIndex((candidate) => !visibleVendorIds.has(candidate.predictedVendorId));
    const candidateIndex = diverseIndex >= 0 ? diverseIndex : 0;
    const [candidate] = remaining.splice(candidateIndex, 1);
    if (!candidate) break;

    try {
      const card = await getCatalogCard(candidate.id, visitorKey, postcode);
      if (!card?.available) continue;
      cards.push(card);
      if (card.vendorId) visibleVendorIds.add(card.vendorId);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.homepage_assignment_degraded",
        canonicalVariantId: candidate.id,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  return cards;
}
