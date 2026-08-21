import { createHash, randomUUID } from "node:crypto";
import type { PersonalizationPreferences, PrivacyRequest, PrivacyRetentionItem, RecentlyViewedProduct, SavedProduct, SavedVendor } from "../privacy/types.ts";
import { PostgresUnitOfWork, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

function epoch(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid timestamp returned by database");
  return parsed;
}

function jsonRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

function retentionItems(value: unknown): readonly PrivacyRetentionItem[] {
  return Array.isArray(value) ? value as readonly PrivacyRetentionItem[] : [];
}

function mapPrivacyRequest(row: SqlRow): PrivacyRequest {
  return {
    id: String(row.public_id),
    userId: String(row.user_public_id),
    type: String(row.request_type) as PrivacyRequest["type"],
    status: String(row.status) as PrivacyRequest["status"],
    submittedAt: epoch(row.created_at),
    targetAt: epoch(row.due_at),
    processingStartedAt: row.processing_started_at ? epoch(row.processing_started_at) : undefined,
    completedAt: row.completed_at ? epoch(row.completed_at) : undefined,
    completedBy: row.completed_by_public_id ? String(row.completed_by_public_id) : undefined,
    details: jsonRecord(row.details),
    retention: retentionItems(row.retention_snapshot),
    outcome: jsonRecord(row.outcome)
  };
}

async function userUuid(db: SqlExecutor, publicId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id = $1 OR id::text = $1", [publicId]);
  if (result.rowCount !== 1) throw new Error(`User ${publicId} was not found`);
  return String(result.rows[0].id);
}

async function canonicalUuid(db: SqlExecutor, publicId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM canonical_variants WHERE public_id = $1 OR id::text = $1", [publicId]);
  if (result.rowCount !== 1) throw new Error(`Canonical variant ${publicId} was not found`);
  return String(result.rows[0].id);
}

async function vendorUuid(db: SqlExecutor, publicId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM vendor_businesses WHERE public_id = $1 OR id::text = $1", [publicId]);
  if (result.rowCount !== 1) throw new Error(`Vendor ${publicId} was not found`);
  return String(result.rows[0].id);
}

export class PostgresCustomerPrivacyRepository {
  readonly #uow: PostgresUnitOfWork;
  readonly #db: SqlExecutor;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
    this.#db = pool;
  }

  async savePreferences(input: { scope: DatabaseScope; preferences: PersonalizationPreferences }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.preferences.userId);
      await tx.query(`INSERT INTO customer_profiles (user_id, recommendations_enabled, recently_viewed_enabled, personalization_updated_at)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id) DO UPDATE SET recommendations_enabled=EXCLUDED.recommendations_enabled,
          recently_viewed_enabled=EXCLUDED.recently_viewed_enabled, personalization_updated_at=EXCLUDED.personalization_updated_at, updated_at=now()`,
      [uid, input.preferences.recommendationsEnabled, input.preferences.recentlyViewedEnabled, new Date(input.preferences.updatedAt)]);
      if (!input.preferences.recentlyViewedEnabled) await tx.query("DELETE FROM recently_viewed_products WHERE user_id=$1", [uid]);
    });
  }

  async saveProduct(input: { scope: DatabaseScope; item: SavedProduct }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.item.userId);
      const cid = await canonicalUuid(tx, input.item.canonicalVariantId);
      await tx.query(`INSERT INTO saved_products (id,public_id,user_id,canonical_variant_id,saved_at) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id,canonical_variant_id) DO NOTHING`, [randomUUID(), `saved-product-${randomUUID()}`, uid, cid, new Date(input.item.savedAt)]);
    });
  }

  async removeProduct(input: { scope: DatabaseScope; userId: string; canonicalVariantId: string }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId); const cid = await canonicalUuid(tx, input.canonicalVariantId);
      await tx.query("DELETE FROM saved_products WHERE user_id=$1 AND canonical_variant_id=$2", [uid, cid]);
    });
  }

  async saveVendor(input: { scope: DatabaseScope; item: SavedVendor }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.item.userId); const vid = await vendorUuid(tx, input.item.vendorId);
      await tx.query(`INSERT INTO saved_vendors (id,public_id,user_id,vendor_id,saved_at) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id,vendor_id) DO NOTHING`, [randomUUID(), `saved-vendor-${randomUUID()}`, uid, vid, new Date(input.item.savedAt)]);
    });
  }

  async recordRecentlyViewed(input: { scope: DatabaseScope; item: RecentlyViewedProduct }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.item.userId); const cid = await canonicalUuid(tx, input.item.canonicalVariantId);
      await tx.query(`INSERT INTO recently_viewed_products (id,public_id,user_id,canonical_variant_id,viewed_at,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (user_id,canonical_variant_id) DO UPDATE SET viewed_at=EXCLUDED.viewed_at, expires_at=EXCLUDED.expires_at`,
      [randomUUID(), `recent-${randomUUID()}`, uid, cid, new Date(input.item.viewedAt), new Date(input.item.expiresAt)]);
    });
  }

  async listForUser(input: { scope: DatabaseScope; userId: string; now: number }): Promise<{ preferences: PersonalizationPreferences; savedProducts: SavedProduct[]; savedVendors: SavedVendor[]; recentlyViewed: RecentlyViewedProduct[] }> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId);
      const [profile, products, vendors, recent] = await Promise.all([
        tx.query<SqlRow>("SELECT recommendations_enabled,recently_viewed_enabled,COALESCE(personalization_updated_at,updated_at) AS updated_at FROM customer_profiles WHERE user_id=$1", [uid]),
        tx.query<SqlRow>(`SELECT cv.public_id AS canonical_variant_id, sp.saved_at FROM saved_products sp JOIN canonical_variants cv ON cv.id=sp.canonical_variant_id WHERE sp.user_id=$1 ORDER BY sp.saved_at DESC`, [uid]),
        tx.query<SqlRow>(`SELECT vb.public_id AS vendor_id, sv.saved_at FROM saved_vendors sv JOIN vendor_businesses vb ON vb.id=sv.vendor_id WHERE sv.user_id=$1 ORDER BY sv.saved_at DESC`, [uid]),
        tx.query<SqlRow>(`SELECT cv.public_id AS canonical_variant_id, rv.viewed_at, rv.expires_at FROM recently_viewed_products rv JOIN canonical_variants cv ON cv.id=rv.canonical_variant_id WHERE rv.user_id=$1 AND rv.expires_at>$2 ORDER BY rv.viewed_at DESC`, [uid, new Date(input.now)])
      ]);
      const p = profile.rows[0];
      return {
        preferences: { userId: input.userId, recommendationsEnabled: p ? Boolean(p.recommendations_enabled) : false, recentlyViewedEnabled: p ? Boolean(p.recently_viewed_enabled) : false, updatedAt: p ? epoch(p.updated_at) : input.now },
        savedProducts: products.rows.map((r) => ({ userId: input.userId, canonicalVariantId: String(r.canonical_variant_id), savedAt: epoch(r.saved_at) })),
        savedVendors: vendors.rows.map((r) => ({ userId: input.userId, vendorId: String(r.vendor_id), savedAt: epoch(r.saved_at) })),
        recentlyViewed: recent.rows.map((r) => ({ userId: input.userId, canonicalVariantId: String(r.canonical_variant_id), viewedAt: epoch(r.viewed_at), expiresAt: epoch(r.expires_at) }))
      };
    }, { readOnly: true });
  }

  async privacyRequestsForUser(input: { scope: DatabaseScope; userId: string }): Promise<PrivacyRequest[]> {
    const uid = await this.#uow.withTransaction(input.scope, (tx) => userUuid(tx, input.userId), { readOnly: true });
    return this.#privacyRequests(input.scope, "pr.user_id=$1", [uid]);
  }

  async privacyRequestsForPlatform(input: { scope: DatabaseScope }): Promise<PrivacyRequest[]> {
    if (!input.scope.platformAccess) throw new Error("Platform access is required for privacy operations");
    return this.#privacyRequests(input.scope, "TRUE", []);
  }

  async #privacyRequests(scope: DatabaseScope, where: string, params: unknown[]): Promise<PrivacyRequest[]> {
    return this.#uow.withTransaction(scope, async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT pr.public_id,u.public_id AS user_public_id,pr.request_type,pr.status,pr.due_at,pr.details,pr.processing_started_at,pr.completed_at,
          completed.public_id AS completed_by_public_id,pr.retention_snapshot,pr.outcome,pr.created_at
        FROM privacy_requests pr JOIN users u ON u.id=pr.user_id LEFT JOIN users completed ON completed.id=pr.completed_by
        WHERE ${where} ORDER BY pr.created_at DESC`, params);
      return result.rows.map(mapPrivacyRequest);
    }, { readOnly: true });
  }

  async eraseNonEssentialPersonalization(input: { scope: DatabaseScope; userId: string; now: number }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId);
      await tx.query("DELETE FROM saved_products WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_vendors WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM recently_viewed_products WHERE user_id=$1", [uid]);
      await tx.query("SELECT set_config('app.privacy_erasure','true',true)");
      await tx.query("DELETE FROM saved_product_alert_events WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_product_alert_preferences WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_search_alert_events WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_searches WHERE user_id=$1", [uid]);
      await tx.query(`INSERT INTO customer_profiles (user_id,recommendations_enabled,recently_viewed_enabled,personalization_updated_at)
        VALUES ($1,false,false,$2)
        ON CONFLICT (user_id) DO UPDATE SET recommendations_enabled=false,recently_viewed_enabled=false,personalization_updated_at=EXCLUDED.personalization_updated_at,updated_at=now()`, [uid, new Date(input.now)]);
    });
  }

  async savePrivacyRequest(input: { scope: DatabaseScope; request: PrivacyRequest }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.request.userId);
      const completedBy = input.request.completedBy ? await userUuid(tx, input.request.completedBy).catch(() => null) : null;
      await tx.query(`INSERT INTO privacy_requests (id,public_id,user_id,request_type,status,due_at,details,processing_started_at,completed_at,completed_by,retention_snapshot,outcome,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
        ON CONFLICT (public_id) DO UPDATE SET request_type=EXCLUDED.request_type,status=EXCLUDED.status,due_at=EXCLUDED.due_at,details=EXCLUDED.details,
          processing_started_at=EXCLUDED.processing_started_at,completed_at=EXCLUDED.completed_at,completed_by=EXCLUDED.completed_by,
          retention_snapshot=EXCLUDED.retention_snapshot,outcome=EXCLUDED.outcome`,
      [randomUUID(), input.request.id, uid, input.request.type, input.request.status, new Date(input.request.targetAt), JSON.stringify(input.request.details ?? {}),
       input.request.processingStartedAt ? new Date(input.request.processingStartedAt) : null, input.request.completedAt ? new Date(input.request.completedAt) : null,
       completedBy, JSON.stringify(input.request.retention ?? []), JSON.stringify(input.request.outcome ?? {}), new Date(input.request.submittedAt)]);
    });
  }

  async closeCustomerAccount(input: { scope: DatabaseScope; userId: string; now: number }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const uid = await userUuid(tx, input.userId);
      await tx.query("SELECT set_config('app.privacy_erasure','true',true)");
      await tx.query("DELETE FROM saved_products WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_vendors WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM recently_viewed_products WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_product_alert_events WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_product_alert_preferences WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_search_alert_events WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM saved_searches WHERE user_id=$1", [uid]);
      await tx.query("DELETE FROM user_sessions WHERE user_id=$1", [uid]);
      await tx.query(`UPDATE users SET status='closed',closed_at=$2,anonymized_at=$2,email='deleted+'||encode(digest(email::text||id::text,'sha256'),'hex')||'@privacy.invalid',phone=NULL,updated_at=$2 WHERE id=$1`, [uid, new Date(input.now)]);
      await tx.query(`UPDATE customer_profiles SET first_name=NULL,last_name=NULL,recommendations_enabled=false,recently_viewed_enabled=false,marketing_consent=false,personalization_updated_at=$2,updated_at=$2 WHERE user_id=$1`, [uid, new Date(input.now)]);
    }, { isolation: "serializable" });
  }
}
