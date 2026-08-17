import { randomUUID } from "node:crypto";
import { id as publicId } from "../common/ids.ts";
import { money, type Currency } from "../common/money.ts";
import type { CatalogFulfilmentMode, CanonicalCatalogProduct, VendorProductSubmission } from "../catalog/management.ts";
import type { ProductCondition, ProductIdentity } from "../catalog/types.ts";
import type { InventoryBalance, StockReservation } from "../inventory/types.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlQueryResult, type SqlRow } from "./sql.ts";

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed)) throw new Error(`Database field ${field} is not a safe integer`);
  return parsed;
}

function epoch(value: unknown, field: string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  throw new Error(`Database field ${field} is not a timestamp`);
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return structuredClone(value as Record<string, unknown>);
  if (typeof value === "string") {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }
  return {};
}

function textArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export class PostgresCatalogRepository {
  readonly #db: SqlExecutor;

  constructor(db: SqlExecutor) {
    this.#db = db;
  }

  async canonical(id: string): Promise<CanonicalCatalogProduct | undefined> {
    const result = await this.#db.query<SqlRow>(`
      SELECT cv.id, COALESCE(cv.public_id, cv.id::text) AS public_id, cv.market_id, m.code AS market_code, c.code AS category_code, cv.gtin, cv.mpn, cv.model, cv.condition,
             cv.variant_attributes, cv.warranty_basis, cv.platform_price_minor, cv.currency, cv.tax_rate_bps,
             cv.active, cv.suppressed, cv.recalled, cv.created_at, cv.updated_at,
             COALESCE(el.title, en.title, cv.model, cv.slug) AS title_el,
             en.title AS title_en, el.description AS description_el
      FROM canonical_variants cv
      JOIN markets m ON m.id = cv.market_id
      JOIN categories c ON c.id = cv.category_id
      LEFT JOIN product_translations el ON el.canonical_variant_id = cv.id AND el.locale = 'el'
      LEFT JOIN product_translations en ON en.canonical_variant_id = cv.id AND en.locale = 'en'
      WHERE cv.public_id = $1 OR cv.id::text = $1
    `, [id]);
    if (result.rowCount === 0) return undefined;
    return this.#mapCanonical(result.rows[0]);
  }

  async listCanonicals(input: { marketId: string; categoryCode?: string; activeOnly?: boolean }): Promise<readonly CanonicalCatalogProduct[]> {
    const result = await this.#db.query<SqlRow>(`
      SELECT cv.id, COALESCE(cv.public_id, cv.id::text) AS public_id, cv.market_id, m.code AS market_code, c.code AS category_code, cv.gtin, cv.mpn, cv.model, cv.condition,
             cv.variant_attributes, cv.warranty_basis, cv.platform_price_minor, cv.currency, cv.tax_rate_bps,
             cv.active, cv.suppressed, cv.recalled, cv.created_at, cv.updated_at,
             COALESCE(el.title, en.title, cv.model, cv.slug) AS title_el,
             en.title AS title_en, el.description AS description_el
      FROM canonical_variants cv
      JOIN markets m ON m.id = cv.market_id
      JOIN categories c ON c.id = cv.category_id
      LEFT JOIN product_translations el ON el.canonical_variant_id = cv.id AND el.locale = 'el'
      LEFT JOIN product_translations en ON en.canonical_variant_id = cv.id AND en.locale = 'en'
      WHERE (m.code = $1 OR cv.market_id::text = $1)
        AND ($2::text IS NULL OR c.code = $2)
        AND ($3::boolean = false OR (cv.active = true AND cv.suppressed = false AND cv.recalled = false))
      ORDER BY cv.created_at DESC, cv.id
    `, [input.marketId, input.categoryCode ?? null, input.activeOnly ?? false]);
    return result.rows.map((row) => this.#mapCanonical(row));
  }

  async vendorSubmission(id: string, vendorId: string): Promise<VendorProductSubmission | undefined> {
    const result = await this.#db.query<SqlRow>(`
      SELECT s.*, COALESCE(s.public_id, s.id::text) AS public_id, c.code AS category_code,
             m.code AS market_code, COALESCE(v.public_id, v.id::text) AS vendor_public_id,
             COALESCE(l.public_id, l.id::text) AS location_public_id,
             COALESCE(cv.public_id, cv.id::text) AS canonical_public_id
      FROM vendor_product_submissions s
      JOIN markets m ON m.id = s.market_id
      JOIN vendor_businesses v ON v.id = s.vendor_id
      JOIN vendor_locations l ON l.id = s.location_id
      JOIN categories c ON c.id = s.category_id
      LEFT JOIN canonical_variants cv ON cv.id = s.canonical_variant_id
      WHERE (s.public_id = $1 OR s.id::text = $1) AND (v.public_id = $2 OR v.id::text = $2)
    `, [id, vendorId]);
    if (result.rowCount === 0) return undefined;
    return this.#mapSubmission(result.rows[0]);
  }

  async listVendorSubmissions(vendorId: string): Promise<readonly VendorProductSubmission[]> {
    const result = await this.#db.query<SqlRow>(`
      SELECT s.*, COALESCE(s.public_id, s.id::text) AS public_id, c.code AS category_code,
             m.code AS market_code, COALESCE(v.public_id, v.id::text) AS vendor_public_id,
             COALESCE(l.public_id, l.id::text) AS location_public_id,
             COALESCE(cv.public_id, cv.id::text) AS canonical_public_id
      FROM vendor_product_submissions s
      JOIN markets m ON m.id = s.market_id
      JOIN vendor_businesses v ON v.id = s.vendor_id
      JOIN vendor_locations l ON l.id = s.location_id
      JOIN categories c ON c.id = s.category_id
      LEFT JOIN canonical_variants cv ON cv.id = s.canonical_variant_id
      WHERE v.public_id = $1 OR v.id::text = $1
      ORDER BY s.updated_at DESC, s.id
    `, [vendorId]);
    return result.rows.map((row) => this.#mapSubmission(row));
  }

  async createVendorDraft(input: {
    marketId: string;
    vendorId: string;
    locationId: string;
    createdBy?: string;
    vendorSku?: string;
    categoryCode: string;
    identity: ProductIdentity;
    supplierUnitPriceMinor: number;
    currency?: Currency;
    supplierTaxRateBps: number;
    stockOnHand: number;
    safetyStock: number;
    fulfilmentModes: readonly CatalogFulfilmentMode[];
    adviceAvailable: boolean;
    source: "manual" | "csv" | "api";
    sourcePayload?: Readonly<Record<string, unknown>>;
  }): Promise<VendorProductSubmission> {
    const submissionId = publicId("vps");
    const result = await this.#db.query<SqlRow>(`
      WITH inserted AS (
        INSERT INTO vendor_product_submissions (
          id, public_id, market_id, vendor_id, location_id, vendor_sku, category_id, source_identity,
          supplier_unit_price_minor, currency, supplier_tax_rate_bps, stock_on_hand, safety_stock,
          fulfilment_modes, advice_available, source, source_payload, status, created_by
        )
        SELECT $1, $2, m.id, v.id, l.id, $6, c.id, $8::jsonb, $9, $10, $11, $12, $13,
               $14::fulfilment_mode[], $15, $16, $17::jsonb, 'draft', u.id
        FROM categories c
        JOIN markets m ON (m.code = $3 OR m.id::text = $3)
        JOIN vendor_businesses v ON (v.public_id = $4 OR v.id::text = $4)
        JOIN vendor_locations l ON (l.public_id = $5 OR l.id::text = $5) AND l.vendor_id = v.id
        LEFT JOIN users u ON ($18::text IS NOT NULL AND (u.public_id = $18 OR u.id::text = $18))
        WHERE c.code = $7 AND ($18::text IS NULL OR u.id IS NOT NULL)
        RETURNING *
      )
      SELECT s.*, c.code AS category_code, m.code AS market_code,
             COALESCE(v.public_id, v.id::text) AS vendor_public_id,
             COALESCE(l.public_id, l.id::text) AS location_public_id,
             COALESCE(cv.public_id, cv.id::text) AS canonical_public_id
      FROM inserted s
      JOIN categories c ON c.id = s.category_id
      JOIN markets m ON m.id = s.market_id
      JOIN vendor_businesses v ON v.id = s.vendor_id
      JOIN vendor_locations l ON l.id = s.location_id
      LEFT JOIN canonical_variants cv ON cv.id = s.canonical_variant_id
    `, [
      randomUUID(), submissionId, input.marketId, input.vendorId, input.locationId, input.vendorSku ?? null, input.categoryCode,
      JSON.stringify(input.identity), input.supplierUnitPriceMinor, input.currency ?? "EUR", input.supplierTaxRateBps,
      input.stockOnHand, input.safetyStock, [...input.fulfilmentModes], input.adviceAvailable, input.source,
      JSON.stringify(input.sourcePayload ?? {}), input.createdBy ?? null
    ]);
    return this.#mapSubmission(requireSingleRow(result, "Unable to create vendor product draft: market, vendor, location, category or creator could not be resolved"));
  }

  #mapCanonical(row: SqlRow): CanonicalCatalogProduct {
    const id = asOptionalString(row.public_id) ?? asString(row.id, "id");
    const attributes = jsonObject(row.variant_attributes);
    const identity: ProductIdentity = {
      id,
      title: asString(row.title_el, "title_el"),
      brand: undefined,
      model: asOptionalString(row.model),
      mpn: asOptionalString(row.mpn),
      gtin: asOptionalString(row.gtin),
      condition: (asOptionalString(row.condition) ?? "new") as ProductCondition,
      warrantyBasis: asOptionalString(row.warranty_basis),
      attributes: Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, String(value)]))
    };
    return {
      id,
      marketId: asOptionalString(row.market_code) ?? asString(row.market_id, "market_id"),
      categoryCode: asString(row.category_code, "category_code"),
      identity,
      titleEl: asString(row.title_el, "title_el"),
      titleEn: asOptionalString(row.title_en),
      descriptionEl: asOptionalString(row.description_el),
      platformPrice: money(asNumber(row.platform_price_minor, "platform_price_minor"), asString(row.currency, "currency") as Currency),
      taxRateBps: asNumber(row.tax_rate_bps, "tax_rate_bps"),
      active: Boolean(row.active),
      suppressed: Boolean(row.suppressed),
      recalled: Boolean(row.recalled),
      createdAt: epoch(row.created_at, "created_at"),
      updatedAt: epoch(row.updated_at, "updated_at")
    };
  }

  #mapSubmission(row: SqlRow): VendorProductSubmission {
    const identityJson = jsonObject(row.source_identity);
    const submissionPublicId = asOptionalString(row.public_id) ?? asString(row.id, "id");
    const identity: ProductIdentity = {
      id: submissionPublicId,
      title: String(identityJson.title ?? ""),
      brand: asOptionalString(identityJson.brand),
      model: asOptionalString(identityJson.model),
      mpn: asOptionalString(identityJson.mpn),
      gtin: asOptionalString(identityJson.gtin),
      condition: (asOptionalString(identityJson.condition) ?? "new") as ProductCondition,
      warrantyBasis: asOptionalString(identityJson.warrantyBasis),
      attributes: jsonObject(identityJson.attributes) as Record<string, string>
    };
    return {
      id: submissionPublicId,
      marketId: asOptionalString(row.market_code) ?? asString(row.market_id, "market_id"),
      vendorId: asOptionalString(row.vendor_public_id) ?? asString(row.vendor_id, "vendor_id"),
      locationId: asOptionalString(row.location_public_id) ?? asString(row.location_id, "location_id"),
      vendorSku: asOptionalString(row.vendor_sku),
      categoryCode: asString(row.category_code, "category_code"),
      identity,
      supplierUnitPrice: money(asNumber(row.supplier_unit_price_minor, "supplier_unit_price_minor"), asString(row.currency, "currency") as Currency),
      supplierTaxRateBps: asNumber(row.supplier_tax_rate_bps, "supplier_tax_rate_bps"),
      stockOnHand: asNumber(row.stock_on_hand, "stock_on_hand"),
      safetyStock: asNumber(row.safety_stock, "safety_stock"),
      fulfilmentModes: textArray(row.fulfilment_modes) as CatalogFulfilmentMode[],
      adviceAvailable: Boolean(row.advice_available),
      source: asString(row.source, "source") as "manual" | "csv" | "api",
      sourcePayload: jsonObject(row.source_payload),
      status: asString(row.status, "status") as VendorProductSubmission["status"],
      canonicalVariantId: asOptionalString(row.canonical_public_id) ?? asOptionalString(row.canonical_variant_id),
      rejectionReason: asOptionalString(row.rejection_reason),
      createdAt: epoch(row.created_at, "created_at"),
      updatedAt: epoch(row.updated_at, "updated_at")
    };
  }
}

type InventoryBalanceRow = SqlRow & {
  offer_id: string;
  on_hand: number | string;
  active_reservations: number | string;
  safety_stock: number | string;
  blocked: number | string;
  updated_at: string | Date;
};

type ReservationRow = SqlRow & {
  id: string;
  checkout_key: string;
  offer_id: string;
  quantity: number | string;
  status: string;
  created_at: string | Date;
  expires_at: string | Date;
};

export class PostgresInventoryRepository {
  readonly #uow: PostgresUnitOfWork;
  readonly #db: SqlExecutor;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
    this.#db = pool;
  }

  async balance(offerId: string): Promise<InventoryBalance | undefined> {
    const result = await this.#db.query<InventoryBalanceRow>(`
      SELECT ib.offer_id, COALESCE(vo.public_id, vo.id::text) AS offer_public_id, ib.on_hand, ib.active_reservations, ib.safety_stock, ib.blocked, ib.updated_at
      FROM inventory_balances ib JOIN vendor_offers vo ON vo.id = ib.offer_id
      WHERE vo.public_id = $1 OR vo.id::text = $1
    `, [offerId]);
    if (result.rowCount === 0) return undefined;
    return this.#mapBalance(result.rows[0]);
  }

  async reserve(input: {
    scope: DatabaseScope;
    marketId: string;
    checkoutKey: string;
    offerId: string;
    cartItemId?: string;
    quantity: number;
    now: number;
    expiresAt: number;
  }): Promise<StockReservation> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const result = await tx.query<ReservationRow>(
        `SELECT r.*, COALESCE(r.public_id, r.id::text) AS reservation_public_id, COALESCE(vo.public_id, vo.id::text) AS offer_public_id
         FROM reserve_stock(
           (SELECT id FROM markets WHERE code = $1 OR id::text = $1),
           $2,
           (SELECT id FROM vendor_offers WHERE public_id = $3 OR id::text = $3),
           (SELECT id FROM cart_items WHERE $4::text IS NOT NULL AND (public_id = $4 OR id::text = $4)),
           $5, $6, $7
         ) r JOIN vendor_offers vo ON vo.id = r.offer_id`,
        [input.marketId, input.checkoutKey, input.offerId, input.cartItemId ?? null, input.quantity, new Date(input.now), new Date(input.expiresAt)]
      );
      return this.#mapReservation(requireSingleRow(result, "Stock reservation failed"));
    }, { isolation: "read committed" });
  }

  async consume(input: { scope: DatabaseScope; reservationId: string; now: number; actorUserId?: string }): Promise<StockReservation> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const result = await tx.query<ReservationRow>(`SELECT r.*, COALESCE(r.public_id, r.id::text) AS reservation_public_id, COALESCE(vo.public_id, vo.id::text) AS offer_public_id
       FROM consume_stock_reservation((SELECT id FROM stock_reservations WHERE public_id=$1 OR id::text=$1), $2,
         (SELECT id FROM users WHERE $3::text IS NOT NULL AND (public_id=$3 OR id::text=$3))) r
       JOIN vendor_offers vo ON vo.id=r.offer_id`, [input.reservationId, new Date(input.now), input.actorUserId ?? null]);
      return this.#mapReservation(requireSingleRow(result, "Reservation consumption failed"));
    });
  }

  async release(input: { scope: DatabaseScope; reservationId: string; now: number; reason: string; actorUserId?: string }): Promise<StockReservation> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const result = await tx.query<ReservationRow>(`SELECT r.*, COALESCE(r.public_id, r.id::text) AS reservation_public_id, COALESCE(vo.public_id, vo.id::text) AS offer_public_id
       FROM release_stock_reservation((SELECT id FROM stock_reservations WHERE public_id=$1 OR id::text=$1), $2, $3,
         (SELECT id FROM users WHERE $4::text IS NOT NULL AND (public_id=$4 OR id::text=$4))) r
       JOIN vendor_offers vo ON vo.id=r.offer_id`, [input.reservationId, new Date(input.now), input.reason, input.actorUserId ?? null]);
      return this.#mapReservation(requireSingleRow(result, "Reservation release failed"));
    });
  }

  async expireReservations(input: { now: number; limit?: number }): Promise<number> {
    const result = await this.#db.query<SqlRow>("SELECT expire_stock_reservations($1, $2) AS expired_count", [new Date(input.now), input.limit ?? 500]);
    return asNumber(requireSingleRow(result).expired_count, "expired_count");
  }

  #mapBalance(row: InventoryBalanceRow): InventoryBalance {
    return {
      offerId: asOptionalString(row.offer_public_id) ?? asString(row.offer_id, "offer_id"),
      onHand: asNumber(row.on_hand, "on_hand"),
      activeReservations: asNumber(row.active_reservations, "active_reservations"),
      safetyStock: asNumber(row.safety_stock, "safety_stock"),
      blocked: asNumber(row.blocked, "blocked"),
      updatedAt: epoch(row.updated_at, "updated_at")
    };
  }

  #mapReservation(row: ReservationRow): StockReservation {
    return {
      id: asOptionalString(row.reservation_public_id) ?? asOptionalString(row.public_id) ?? asString(row.id, "id"),
      checkoutKey: asString(row.checkout_key, "checkout_key"),
      offerId: asOptionalString(row.offer_public_id) ?? asString(row.offer_id, "offer_id"),
      quantity: asNumber(row.quantity, "quantity"),
      status: asString(row.status, "status") as StockReservation["status"],
      createdAt: epoch(row.created_at, "created_at"),
      expiresAt: epoch(row.expires_at, "expires_at")
    };
  }
}

export type PgLikeClient = Readonly<{
  query(text: string, params?: readonly unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
  release?: () => void;
}>;

export type PgLikePool = Readonly<{
  query(text: string, params?: readonly unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
  connect(): Promise<PgLikeClient>;
}>;

export function adaptPgPool(pool: PgLikePool): SqlPool {
  return {
    async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
      const result = await pool.query(text, params);
      const rows = result.rows as Row[];
      return { rows, rowCount: result.rowCount ?? rows.length };
    },
    async connect() {
      const client = await pool.connect();
      return {
        async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
          const result = await client.query(text, params);
          const rows = result.rows as Row[];
          return { rows, rowCount: result.rowCount ?? rows.length };
        },
        release() { client.release?.(); }
      };
    }
  };
}
