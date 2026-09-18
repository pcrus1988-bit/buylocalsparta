import { randomUUID } from "node:crypto";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const MARKET_CODE = "sparta";
const ATHENS_TIMEZONE = "Europe/Athens";
const FLASH_ITEM_COUNT = 10;
const FLASH_DISCOUNT_RATE = 0.20;
const MIN_PRICE_MINOR = 10_000;
const MAX_PRICE_MINOR = 50_000;
const RECENT_EXCLUSION_DAYS = 30;

type FlashDecision = "selected" | "skipped";

export type FlashSaleItem = Readonly<{
  id: string;
  canonicalVariantId: string;
  offerId: string;
  title: string;
  brand?: string;
  imageUrl: string;
  categoryCode?: string;
  attributes: Record<string, unknown>;
  listedPriceMinor: number;
  msrpMinor: number;
  flashPriceMinor: number;
  flashDiscountMinor: number;
  currentDiscountPct: number;
  decision?: FlashDecision;
}>;

export type FlashSaleState = Readonly<{
  sessionId: string;
  saleDate: string;
  status: "active" | "completed";
  expiresAt: string;
  decidedCount: number;
  selectedCount: number;
  items: readonly FlashSaleItem[];
}>;

type QueryClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

type Candidate = {
  variant_uuid: string;
  canonical_variant_id: string;
  offer_uuid: string;
  offer_public_id: string;
  family_uuid: string | null;
  category_uuid: string | null;
  category_code: string | null;
  listed_price_minor: string | number;
  msrp_minor: string | number;
  title: string;
  brand: string | null;
  image_url: string;
  variant_attributes: Record<string, unknown> | null;
};

function id(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function integer(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("FLASH_SALE_INVALID_MONEY");
  return parsed;
}

function chooseDiverseCandidates(rows: Candidate[]): Candidate[] {
  const chosen: Candidate[] = [];
  const usedVariants = new Set<string>();
  const usedFamilies = new Set<string>();
  const usedCategories = new Set<string>();

  for (const row of rows) {
    if (chosen.length >= FLASH_ITEM_COUNT) break;
    if (usedVariants.has(row.canonical_variant_id)) continue;
    if (row.family_uuid && usedFamilies.has(row.family_uuid)) continue;
    const categoryKey = row.category_uuid ?? "uncategorized";
    if (usedCategories.has(categoryKey)) continue;
    chosen.push(row);
    usedVariants.add(row.canonical_variant_id);
    if (row.family_uuid) usedFamilies.add(row.family_uuid);
    usedCategories.add(categoryKey);
  }

  for (const row of rows) {
    if (chosen.length >= FLASH_ITEM_COUNT) break;
    if (usedVariants.has(row.canonical_variant_id)) continue;
    if (row.family_uuid && usedFamilies.has(row.family_uuid)) continue;
    chosen.push(row);
    usedVariants.add(row.canonical_variant_id);
    if (row.family_uuid) usedFamilies.add(row.family_uuid);
  }

  return chosen;
}

const DISPLAY_FIELDS = `
  COALESCE(NULLIF(pt_el.title,''), NULLIF(pt_en.title,''), cv.public_id) AS title,
  NULLIF(b.name,'') AS brand
`;

const PRIMARY_MEDIA_LATERAL = `
  SELECT source_url
  FROM product_media
  WHERE canonical_variant_id=cv.id
    AND kind='image'
    AND moderation_status='approved'
    AND rights_status='approved'
    AND scan_status='clean'
    AND source_url IS NOT NULL
  ORDER BY sort_order ASC NULLS LAST, created_at ASC
  LIMIT 1
`;

async function loadState(client: QueryClient, sessionId: string): Promise<FlashSaleState> {
  const sessionResult = await client.query(`
    SELECT public_id, sale_date::text, status, expires_at
    FROM flash_sale_sessions
    WHERE id=$1
  `, [sessionId]);
  if (!sessionResult.rows.length) throw new Error("FLASH_SALE_SESSION_NOT_FOUND");
  const session = sessionResult.rows[0];

  const itemResult = await client.query(`
    SELECT
      fsi.public_id AS item_id,
      cv.public_id AS canonical_variant_id,
      vo.public_id AS offer_public_id,
      ${DISPLAY_FIELDS},
      pm.source_url AS image_url,
      c.code AS category_code,
      COALESCE(cv.variant_attributes, '{}'::jsonb) AS variant_attributes,
      fsi.listed_price_minor,
      fsi.msrp_minor,
      fsi.flash_price_minor,
      fsi.flash_discount_minor,
      fsi.decision
    FROM flash_sale_session_items fsi
    JOIN canonical_variants cv ON cv.id=fsi.canonical_variant_id
    JOIN vendor_offers vo ON vo.id=fsi.offer_id
    LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=cv.id AND pt_el.locale='el'
    LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=cv.id AND pt_en.locale='en'
    LEFT JOIN brands b ON b.id=cv.brand_id
    LEFT JOIN categories c ON c.id=fsi.category_id
    LEFT JOIN LATERAL (${PRIMARY_MEDIA_LATERAL}) pm ON true
    WHERE fsi.session_id=$1
    ORDER BY fsi.position
  `, [sessionId]);

  const items = itemResult.rows.map((row): FlashSaleItem => {
    const listedPriceMinor = integer(row.listed_price_minor);
    const msrpMinor = integer(row.msrp_minor);
    return {
      id: String(row.item_id),
      canonicalVariantId: String(row.canonical_variant_id),
      offerId: String(row.offer_public_id),
      title: String(row.title),
      brand: row.brand ? String(row.brand) : undefined,
      imageUrl: String(row.image_url ?? ""),
      categoryCode: row.category_code ? String(row.category_code) : undefined,
      attributes: row.variant_attributes && typeof row.variant_attributes === "object" ? row.variant_attributes : {},
      listedPriceMinor,
      msrpMinor,
      flashPriceMinor: integer(row.flash_price_minor),
      flashDiscountMinor: integer(row.flash_discount_minor),
      currentDiscountPct: Math.max(0, Math.round((1 - listedPriceMinor / msrpMinor) * 100)),
      decision: row.decision === "selected" || row.decision === "skipped" ? row.decision : undefined
    };
  });

  return {
    sessionId: String(session.public_id),
    saleDate: String(session.sale_date),
    status: session.status === "completed" ? "completed" : "active",
    expiresAt: new Date(session.expires_at).toISOString(),
    decidedCount: items.filter((item) => item.decision).length,
    selectedCount: items.filter((item) => item.decision === "selected").length,
    items
  };
}

async function identity(client: QueryClient, customerPublicId: string) {
  const result = await client.query(`
    SELECT u.id::text AS user_uuid, m.id::text AS market_uuid
    FROM users u
    CROSS JOIN markets m
    WHERE u.public_id=$1 AND m.code=$2
    LIMIT 1
  `, [customerPublicId, MARKET_CODE]);
  if (!result.rows.length) throw new Error("FLASH_SALE_IDENTITY_NOT_FOUND");
  return { userUuid: String(result.rows[0].user_uuid), marketUuid: String(result.rows[0].market_uuid) };
}

function candidateSql(withRecentExclusion: boolean): string {
  return `
    WITH candidate_core AS MATERIALIZED (
      SELECT
        cv.id AS variant_uuid_raw,
        cv.public_id AS canonical_variant_id,
        vo.id AS offer_uuid_raw,
        vo.public_id AS offer_public_id,
        cv.family_id AS family_uuid_raw,
        cv.category_id AS category_uuid_raw,
        cv.brand_id AS brand_uuid_raw,
        vo.customer_price_minor AS listed_price_minor,
        vo.msrp_minor,
        COALESCE(cv.variant_attributes, '{}'::jsonb) AS variant_attributes,
        random() AS random_key
      FROM dropship_supplier_offers dso
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      WHERE cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor BETWEEN $1 AND $2
        AND vo.msrp_minor > 0
        AND vo.customer_price_minor <= vo.msrp_minor * 0.40
        AND dso.active=true
        AND dso.cached_available=true
        AND dso.cached_quantity IS DISTINCT FROM 0
        AND (dso.availability_expires_at IS NULL OR dso.availability_expires_at > now())
        AND dso.supplier_cost_minor IS NOT NULL
        AND (vo.customer_price_minor - round(vo.customer_price_minor::numeric * $3::numeric)::bigint) > dso.supplier_cost_minor
        ${withRecentExclusion ? `AND NOT EXISTS (
          SELECT 1
          FROM flash_sale_session_items old_item
          JOIN flash_sale_sessions old_session ON old_session.id=old_item.session_id
          WHERE old_session.user_id=$4
            AND old_item.canonical_variant_id=cv.id
            AND old_session.sale_date >= ((now() AT TIME ZONE $5)::date - $6::int)
        )` : ""}
      ORDER BY random_key
      LIMIT 800
    )
    SELECT
      core.variant_uuid_raw::text AS variant_uuid,
      core.canonical_variant_id,
      core.offer_uuid_raw::text AS offer_uuid,
      core.offer_public_id,
      core.family_uuid_raw::text AS family_uuid,
      core.category_uuid_raw::text AS category_uuid,
      c.code AS category_code,
      core.listed_price_minor,
      core.msrp_minor,
      COALESCE(NULLIF(pt_el.title,''), NULLIF(pt_en.title,''), core.canonical_variant_id) AS title,
      NULLIF(b.name,'') AS brand,
      pm.source_url AS image_url,
      core.variant_attributes
    FROM candidate_core core
    LEFT JOIN product_translations pt_el ON pt_el.canonical_variant_id=core.variant_uuid_raw AND pt_el.locale='el'
    LEFT JOIN product_translations pt_en ON pt_en.canonical_variant_id=core.variant_uuid_raw AND pt_en.locale='en'
    LEFT JOIN brands b ON b.id=core.brand_uuid_raw
    LEFT JOIN categories c ON c.id=core.category_uuid_raw
    JOIN LATERAL (
      SELECT source_url
      FROM product_media
      WHERE canonical_variant_id=core.variant_uuid_raw
        AND kind='image'
        AND moderation_status='approved'
        AND rights_status='approved'
        AND scan_status='clean'
        AND source_url IS NOT NULL
      ORDER BY sort_order ASC NULLS LAST, created_at ASC
      LIMIT 1
    ) pm ON true
    WHERE COALESCE(NULLIF(pt_el.title,''), NULLIF(pt_en.title,'')) IS NOT NULL
    ORDER BY core.random_key
    LIMIT 240
  `;
}

export async function getTodayFlashSale(customerPublicId: string): Promise<FlashSaleState | undefined> {
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    const { userUuid, marketUuid } = await identity(client, customerPublicId);
    const result = await client.query(`
      SELECT id::text
      FROM flash_sale_sessions
      WHERE user_id=$1 AND market_id=$2
        AND sale_date=(now() AT TIME ZONE $3)::date
      LIMIT 1
    `, [userUuid, marketUuid, ATHENS_TIMEZONE]);
    if (!result.rows.length) return undefined;
    return loadState(client, String(result.rows[0].id));
  } finally {
    client.release();
  }
}

export async function startFlashSale(customerPublicId: string): Promise<FlashSaleState> {
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const { userUuid, marketUuid } = await identity(client, customerPublicId);
    const existing = await client.query(`
      SELECT id::text
      FROM flash_sale_sessions
      WHERE user_id=$1 AND market_id=$2
        AND sale_date=(now() AT TIME ZONE $3)::date
      FOR UPDATE
    `, [userUuid, marketUuid, ATHENS_TIMEZONE]);
    if (existing.rows.length) {
      const state = await loadState(client, String(existing.rows[0].id));
      await client.query("COMMIT");
      return state;
    }

    const candidates = await client.query(candidateSql(true), [
      MIN_PRICE_MINOR,
      MAX_PRICE_MINOR,
      FLASH_DISCOUNT_RATE,
      userUuid,
      ATHENS_TIMEZONE,
      RECENT_EXCLUSION_DAYS
    ]);

    let selected = chooseDiverseCandidates(candidates.rows as Candidate[]);
    if (selected.length < FLASH_ITEM_COUNT) {
      const fallback = await client.query(candidateSql(false), [
        MIN_PRICE_MINOR,
        MAX_PRICE_MINOR,
        FLASH_DISCOUNT_RATE
      ]);
      const seen = new Set(selected.map((entry) => entry.canonical_variant_id));
      const merged = [...selected, ...(fallback.rows as Candidate[]).filter((row) => !seen.has(row.canonical_variant_id))];
      selected = chooseDiverseCandidates(merged);
    }

    if (selected.length < FLASH_ITEM_COUNT) throw new Error("FLASH_SALE_POOL_TOO_SMALL");

    const sessionUuid = randomUUID();
    const sessionPublicId = id("flash");
    await client.query(`
      INSERT INTO flash_sale_sessions(
        id, public_id, user_id, market_id, sale_date, item_count, status, expires_at
      )
      VALUES(
        $1,$2,$3,$4,(now() AT TIME ZONE $5)::date,$6,'active',
        ((((now() AT TIME ZONE $5)::date + 1)::timestamp) AT TIME ZONE $5)
      )
    `, [sessionUuid, sessionPublicId, userUuid, marketUuid, ATHENS_TIMEZONE, FLASH_ITEM_COUNT]);

    for (let index = 0; index < FLASH_ITEM_COUNT; index += 1) {
      const row = selected[index];
      const listedPriceMinor = integer(row.listed_price_minor);
      const discountMinor = Math.round(listedPriceMinor * FLASH_DISCOUNT_RATE);
      await client.query(`
        INSERT INTO flash_sale_session_items(
          public_id, session_id, canonical_variant_id, offer_id, family_id, category_id, position,
          listed_price_minor, msrp_minor, flash_price_minor, flash_discount_minor, currency
        )
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'EUR')
      `, [
        id("flashitem"), sessionUuid, row.variant_uuid, row.offer_uuid, row.family_uuid, row.category_uuid, index + 1,
        listedPriceMinor, integer(row.msrp_minor), listedPriceMinor - discountMinor, discountMinor
      ]);
    }

    const state = await loadState(client, sessionUuid);
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function recordFlashSwipe(customerPublicId: string, itemPublicId: string, decision: FlashDecision): Promise<FlashSaleState> {
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const { userUuid, marketUuid } = await identity(client, customerPublicId);
    const result = await client.query(`
      SELECT
        fsi.id::text AS item_uuid,
        fsi.session_id::text AS session_uuid,
        fsi.decision,
        fsi.canonical_variant_id::text,
        fsi.offer_id::text,
        fsi.listed_price_minor,
        fsi.flash_price_minor,
        fsi.flash_discount_minor,
        fss.sale_date,
        fss.expires_at
      FROM flash_sale_session_items fsi
      JOIN flash_sale_sessions fss ON fss.id=fsi.session_id
      WHERE fsi.public_id=$1
        AND fss.user_id=$2
        AND fss.market_id=$3
        AND fss.sale_date=(now() AT TIME ZONE $4)::date
        AND fss.expires_at > now()
      FOR UPDATE OF fsi, fss
    `, [itemPublicId, userUuid, marketUuid, ATHENS_TIMEZONE]);
    if (!result.rows.length) throw new Error("FLASH_SALE_ITEM_NOT_FOUND");
    const row = result.rows[0];

    if (row.decision && row.decision !== decision) throw new Error("FLASH_SALE_ITEM_ALREADY_DECIDED");
    if (!row.decision) {
      await client.query(`
        UPDATE flash_sale_session_items
        SET decision=$1, decided_at=now()
        WHERE id=$2
      `, [decision, row.item_uuid]);

      if (decision === "selected") {
        await client.query(`
          INSERT INTO flash_sale_claims(
            public_id, session_id, session_item_id, user_id, market_id,
            canonical_variant_id, offer_id, sale_date, listed_price_minor, flash_price_minor,
            discount_minor, currency, quantity_cap, expires_at
          )
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'EUR',1,$12)
          ON CONFLICT(session_item_id) DO NOTHING
        `, [
          id("flashclaim"), row.session_uuid, row.item_uuid, userUuid, marketUuid,
          row.canonical_variant_id, row.offer_id, row.sale_date, row.listed_price_minor,
          row.flash_price_minor, row.flash_discount_minor, row.expires_at
        ]);
      }
    }

    await client.query(`
      UPDATE flash_sale_sessions s
      SET status='completed', completed_at=COALESCE(completed_at,now()), updated_at=now()
      WHERE s.id=$1
        AND status='active'
        AND (SELECT count(*) FROM flash_sale_session_items i WHERE i.session_id=s.id AND i.decision IS NOT NULL) >= s.item_count
    `, [row.session_uuid]);

    const state = await loadState(client, String(row.session_uuid));
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
