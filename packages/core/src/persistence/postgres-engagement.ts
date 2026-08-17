import { randomUUID } from "node:crypto";
import type { SavedProductAlertEvent, SavedProductAlertPreference, SavedSearch, SavedSearchAlertEvent } from "../engagement/types.ts";
import { PostgresUnitOfWork, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

function epoch(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid timestamp returned by database");
  return parsed;
}
async function userUuid(db: SqlExecutor, publicId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [publicId]);
  if (result.rowCount !== 1) throw new Error(`User ${publicId} was not found`);
  return String(result.rows[0].id);
}

async function marketUuid(db: SqlExecutor, publicId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code=$1 OR id::text=$1", [publicId]);
  if (result.rowCount !== 1) throw new Error(`Market ${publicId} was not found`);
  return String(result.rows[0].id);
}

async function canonicalUuid(db: SqlExecutor, publicId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM canonical_variants WHERE public_id=$1 OR id::text=$1", [publicId]);
  if (result.rowCount !== 1) throw new Error(`Canonical variant ${publicId} was not found`);
  return String(result.rows[0].id);
}

export class PostgresEngagementRepository {
  readonly #uow: PostgresUnitOfWork;
  constructor(pool: SqlPool) { this.#uow = new PostgresUnitOfWork(pool); }

  async saveAlertPreference(input: { scope: DatabaseScope; preference: SavedProductAlertPreference }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.preference.userId);
      const cid = await canonicalUuid(tx, input.preference.canonicalVariantId);
      await tx.query(`INSERT INTO saved_product_alert_preferences
        (id,public_id,user_id,canonical_variant_id,back_in_stock_enabled,price_drop_enabled,minimum_price_drop_minor,last_observed_available,last_observed_price_minor,last_observed_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (user_id,canonical_variant_id) DO UPDATE SET
          back_in_stock_enabled=EXCLUDED.back_in_stock_enabled,
          price_drop_enabled=EXCLUDED.price_drop_enabled,
          minimum_price_drop_minor=EXCLUDED.minimum_price_drop_minor,
          last_observed_available=EXCLUDED.last_observed_available,
          last_observed_price_minor=EXCLUDED.last_observed_price_minor,
          last_observed_at=EXCLUDED.last_observed_at,
          updated_at=EXCLUDED.updated_at`,
      [randomUUID(), input.preference.id, uid, cid, input.preference.backInStockEnabled, input.preference.priceDropEnabled,
        input.preference.minimumPriceDropMinor, input.preference.lastObservedAvailable, input.preference.lastObservedPriceMinor,
        new Date(input.preference.lastObservedAt), new Date(input.preference.createdAt), new Date(input.preference.updatedAt)]);
    });
  }

  async removeAlertPreference(input: { scope: DatabaseScope; userId: string; canonicalVariantId: string }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId); const cid = await canonicalUuid(tx, input.canonicalVariantId);
      await tx.query("SELECT set_config('app.privacy_erasure','true',true)");
      await tx.query("DELETE FROM saved_product_alert_events WHERE user_id=$1 AND canonical_variant_id=$2", [uid, cid]);
      await tx.query("DELETE FROM saved_product_alert_preferences WHERE user_id=$1 AND canonical_variant_id=$2", [uid, cid]);
    });
  }

  async clearUserAlerts(input: { scope: DatabaseScope; userId: string }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId);
      await tx.query("SELECT set_config('app.privacy_erasure','true',true)");
      await tx.query("DELETE FROM saved_product_alert_events WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_product_alert_preferences WHERE user_id=$1", [uid]);
    });
  }

  async listAlertPreferences(input: { scope: DatabaseScope; userId: string }): Promise<SavedProductAlertPreference[]> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId);
      const result = await tx.query<SqlRow>(`SELECT sap.public_id,cv.public_id AS canonical_variant_id,sap.back_in_stock_enabled,sap.price_drop_enabled,
        sap.minimum_price_drop_minor,sap.last_observed_available,sap.last_observed_price_minor,sap.last_observed_at,sap.created_at,sap.updated_at
        FROM saved_product_alert_preferences sap JOIN canonical_variants cv ON cv.id=sap.canonical_variant_id
        WHERE sap.user_id=$1 ORDER BY sap.updated_at DESC`, [uid]);
      return result.rows.map((r) => ({
        id: String(r.public_id), userId: input.userId, canonicalVariantId: String(r.canonical_variant_id),
        backInStockEnabled: Boolean(r.back_in_stock_enabled), priceDropEnabled: Boolean(r.price_drop_enabled),
        minimumPriceDropMinor: Number(r.minimum_price_drop_minor), lastObservedAvailable: Boolean(r.last_observed_available),
        lastObservedPriceMinor: Number(r.last_observed_price_minor), lastObservedAt: epoch(r.last_observed_at), createdAt: epoch(r.created_at), updatedAt: epoch(r.updated_at)
      }));
    }, { readOnly: true });
  }

  async recordAlertEvent(input: { scope: DatabaseScope; event: SavedProductAlertEvent }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, platformAccess: true }, async (tx) => {
      const uid = await userUuid(tx, input.event.userId); const cid = await canonicalUuid(tx, input.event.canonicalVariantId);
      const pref = await tx.query<SqlRow>("SELECT id::text AS id FROM saved_product_alert_preferences WHERE public_id=$1 AND user_id=$2 AND canonical_variant_id=$3", [input.event.preferenceId, uid, cid]);
      if (pref.rowCount !== 1) throw new Error("Saved-product alert preference was not found");
      await tx.query(`INSERT INTO saved_product_alert_events
        (id,public_id,preference_id,user_id,canonical_variant_id,event_type,previous_available,available,previous_price_minor,price_minor,price_drop_minor,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [randomUUID(), input.event.id, String(pref.rows[0].id), uid, cid, input.event.type, input.event.previousAvailable ?? null, input.event.available ?? null,
        input.event.previousPriceMinor ?? null, input.event.priceMinor ?? null, input.event.priceDropMinor ?? null, new Date(input.event.createdAt)]);
    });
  }

  async saveSavedSearch(input: { scope: DatabaseScope; search: SavedSearch }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.search.userId);
      const mid = await marketUuid(tx, input.search.marketId);
      await tx.query(`INSERT INTO saved_searches
        (id,public_id,user_id,market_id,name,query,alerts_enabled,seen_canonical_public_ids,last_observed_count,last_observed_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::text[],$9,$10,$11,$12)
        ON CONFLICT (public_id) DO UPDATE SET name=EXCLUDED.name,query=EXCLUDED.query,alerts_enabled=EXCLUDED.alerts_enabled,
          seen_canonical_public_ids=EXCLUDED.seen_canonical_public_ids,last_observed_count=EXCLUDED.last_observed_count,
          last_observed_at=EXCLUDED.last_observed_at,updated_at=EXCLUDED.updated_at`,
      [randomUUID(), input.search.id, uid, mid, input.search.name, JSON.stringify(input.search.query), input.search.alertsEnabled,
        [...input.search.seenCanonicalVariantIds], input.search.lastObservedCount, new Date(input.search.lastObservedAt),
        new Date(input.search.createdAt), new Date(input.search.updatedAt)]);
    });
  }

  async listSavedSearches(input: { scope: DatabaseScope; userId: string }): Promise<SavedSearch[]> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId);
      const result = await tx.query<SqlRow>(`SELECT ss.public_id,m.code AS market_id,ss.name,ss.query,ss.alerts_enabled,ss.seen_canonical_public_ids,
        ss.last_observed_count,ss.last_observed_at,ss.created_at,ss.updated_at
        FROM saved_searches ss JOIN markets m ON m.id=ss.market_id WHERE ss.user_id=$1 ORDER BY ss.updated_at DESC`, [uid]);
      return result.rows.map((r) => ({
        id: String(r.public_id), userId: input.userId, marketId: String(r.market_id), name: String(r.name),
        query: (r.query && typeof r.query === "object" ? r.query : {}) as SavedSearch["query"], alertsEnabled: Boolean(r.alerts_enabled),
        seenCanonicalVariantIds: Array.isArray(r.seen_canonical_public_ids) ? r.seen_canonical_public_ids.map(String) : [],
        lastObservedCount: Number(r.last_observed_count), lastObservedAt: epoch(r.last_observed_at), createdAt: epoch(r.created_at), updatedAt: epoch(r.updated_at)
      }));
    }, { readOnly: true });
  }

  async removeSavedSearch(input: { scope: DatabaseScope; userId: string; searchId: string }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId);
      await tx.query("SELECT set_config('app.privacy_erasure','true',true)");
      await tx.query("DELETE FROM saved_search_alert_events WHERE user_id=$1 AND saved_search_id=(SELECT id FROM saved_searches WHERE public_id=$2 AND user_id=$1)", [uid, input.searchId]);
      await tx.query("DELETE FROM saved_searches WHERE public_id=$2 AND user_id=$1", [uid, input.searchId]);
    });
  }

  async clearUserSavedSearches(input: { scope: DatabaseScope; userId: string }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId);
      await tx.query("SELECT set_config('app.privacy_erasure','true',true)");
      await tx.query("DELETE FROM saved_search_alert_events WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_searches WHERE user_id=$1", [uid]);
    });
  }

  async recordSavedSearchAlertEvent(input: { scope: DatabaseScope; event: SavedSearchAlertEvent }): Promise<void> {
    await this.#uow.withTransaction({ ...input.scope, platformAccess: true }, async (tx) => {
      const uid = await userUuid(tx, input.event.userId);
      const cid = await canonicalUuid(tx, input.event.canonicalVariantId);
      const search = await tx.query<SqlRow>("SELECT id::text AS id FROM saved_searches WHERE public_id=$1 AND user_id=$2", [input.event.savedSearchId, uid]);
      if (search.rowCount !== 1) throw new Error("Saved search was not found");
      await tx.query(`INSERT INTO saved_search_alert_events (id,public_id,saved_search_id,user_id,canonical_variant_id,event_type,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (saved_search_id,canonical_variant_id) DO NOTHING`,
      [randomUUID(), input.event.id, String(search.rows[0].id), uid, cid, input.event.type, new Date(input.event.createdAt)]);
    });
  }

}
