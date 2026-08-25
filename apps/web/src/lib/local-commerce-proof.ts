import { createHash } from "node:crypto";
import type { CatalogCard } from "./catalog-view";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type LocalCommerceProof = Readonly<{
  freshLocalStock: boolean;
  stockConfirmedToday: boolean;
  pickup: boolean;
  localDelivery: boolean;
  advice: boolean;
  stockConfirmedAt?: number;
  leadTimeMinutes?: number;
}>;

export type CatalogCardWithLocalProof = CatalogCard & Readonly<{ localProof?: LocalCommerceProof }>;

type ProofRow = Readonly<{
  canonical_id: string;
  vendor_id: string;
  fulfilment_modes: readonly string[] | null;
  lead_time_minutes: number | null;
  stock_confirmed_at: Date | string | null;
  freshness_ttl_seconds: number | null;
  available_to_sell: number | string | null;
}>;

function visitorHash(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
}

function athensDate(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function proofFromRow(row: ProofRow, card: CatalogCard, now: number): LocalCommerceProof {
  const stockConfirmedAt = row.stock_confirmed_at ? new Date(row.stock_confirmed_at).getTime() : undefined;
  const ttlSeconds = Number(row.freshness_ttl_seconds ?? 0);
  const availableToSell = Number(row.available_to_sell ?? 0);
  const freshLocalStock = Boolean(
    card.available
      && availableToSell > 0
      && stockConfirmedAt !== undefined
      && Number.isFinite(stockConfirmedAt)
      && ttlSeconds > 0
      && stockConfirmedAt + ttlSeconds * 1000 > now
  );
  const modes = new Set(row.fulfilment_modes ?? []);
  return {
    freshLocalStock,
    stockConfirmedToday: freshLocalStock && stockConfirmedAt !== undefined && athensDate(stockConfirmedAt) === athensDate(now),
    pickup: freshLocalStock && modes.has("pickup"),
    localDelivery: freshLocalStock && modes.has("local_delivery"),
    advice: Boolean(card.adviser),
    stockConfirmedAt: freshLocalStock ? stockConfirmedAt : undefined,
    leadTimeMinutes: row.lead_time_minutes !== null && Number.isSafeInteger(Number(row.lead_time_minutes)) && Number(row.lead_time_minutes) >= 0
      ? Number(row.lead_time_minutes)
      : undefined
  };
}

export async function enrichCatalogCardsWithLocalProof(
  cards: readonly CatalogCard[],
  visitorKey: string,
  postcode = "23100",
  now = Date.now()
): Promise<readonly CatalogCardWithLocalProof[]> {
  if (!cards.length || !visitorKey || !productionDatabaseConfigured()) return cards;
  const ids = [...new Set(cards.filter((card) => card.available && card.vendorId).map((card) => card.id))];
  if (!ids.length) return cards;

  try {
    const result = await getProductionPostgresRuntime().nativePool.query<ProofRow>(`
      SELECT
        cv.public_id AS canonical_id,
        v.public_id AS vendor_id,
        vo.fulfilment_modes::text[] AS fulfilment_modes,
        vo.lead_time_minutes,
        ib.stock_confirmed_at,
        ib.freshness_ttl_seconds,
        GREATEST(0, ib.on_hand - ib.active_reservations - ib.safety_stock - ib.blocked) AS available_to_sell
      FROM sticky_assignments sa
      JOIN canonical_variants cv ON cv.id=sa.canonical_variant_id
      JOIN vendor_offers vo ON vo.id=sa.offer_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE cv.public_id=ANY($1::text[])
        AND sa.visitor_hash=$2
        AND sa.postcode_scope=$3
        AND sa.released_at IS NULL
        AND sa.expires_at>$4
        AND vo.status='approved'
        AND v.status='active'
        AND l.active=true
      ORDER BY cv.public_id, sa.locked_at DESC
    `, [ids, visitorHash(visitorKey), postcode, new Date(now)]);

    const byCanonical = new Map<string, ProofRow>();
    for (const row of result.rows) if (!byCanonical.has(row.canonical_id)) byCanonical.set(row.canonical_id, row);

    return cards.map((card) => {
      const row = byCanonical.get(card.id);
      if (!row || row.vendor_id !== card.vendorId) return card;
      return { ...card, localProof: proofFromRow(row, card, now) };
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.local_commerce_proof_degraded",
      canonicalCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return cards;
  }
}

export async function enrichCatalogCardWithLocalProof(
  card: CatalogCard,
  visitorKey: string,
  postcode = "23100",
  now = Date.now()
): Promise<CatalogCardWithLocalProof> {
  return (await enrichCatalogCardsWithLocalProof([card], visitorKey, postcode, now))[0] ?? card;
}
