import { createHash, randomUUID } from "node:crypto";
import type { UserAccount, AuthSession, EmailVerification } from "../auth/session.ts";
import type { Role } from "../auth/rbac.ts";
import type { VendorApplication, VendorStateTransition } from "../vendor/index.ts";
import type { ProductMediaAsset, ProductComplianceDocument, ProductNotice } from "../media/types.ts";
import type { RecallAffectedCase, ReturnCase } from "../returns/types.ts";
import type { Notification } from "../notifications/types.ts";
import type { AuditEvent } from "../audit/log.ts";
import { PostgresUnitOfWork, requireSingleRow, type DatabaseScope, type SqlExecutor, type SqlPool, type SqlRow } from "./sql.ts";

const VENDOR_ROLES = new Set<Role>(["vendor_owner", "vendor_catalog", "vendor_fulfilment", "vendor_adviser", "vendor_finance"]);
const PLATFORM_ROLES = new Set<Role>(["super_admin", "vendor_operations", "catalog_qa", "customer_support", "platform_finance", "content_seo", "compliance", "logistics", "auditor"]);

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}

function epoch(value: unknown, field: string): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`Database field ${field} is not a timestamp`);
}

function dateOnly(value: number | undefined): string | null {
  return value === undefined ? null : new Date(value).toISOString().slice(0, 10);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function uuidFor(db: SqlExecutor, table: "users" | "vendor_businesses" | "vendor_locations" | "canonical_variants" | "product_media" | "customer_orders" | "order_lines" | "returns" | "product_notices" | "vendor_offers" | "stock_reservations", publicId: string): Promise<string> {
  const result = await db.query<SqlRow>(`SELECT id::text AS id FROM ${table} WHERE public_id = $1 OR id::text = $1`, [publicId]);
  return String(requireSingleRow(result, `${table} ${publicId} was not found`).id);
}

async function optionalUuidFor(db: SqlExecutor, table: "users" | "vendor_businesses" | "vendor_locations" | "canonical_variants" | "product_media" | "customer_orders" | "order_lines" | "returns" | "product_notices" | "vendor_offers" | "stock_reservations", publicId?: string): Promise<string | null> {
  return publicId ? uuidFor(db, table, publicId) : null;
}

async function marketUuid(db: SqlExecutor, marketId: string): Promise<string> {
  const result = await db.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code = $1 OR id::text = $1", [marketId]);
  return String(requireSingleRow(result, `Market ${marketId} was not found`).id);
}


export type PersistedAuthenticationAccount = Readonly<{
  id: string;
  email: string;
  passwordHash: string;
  status: UserAccount["status"];
  emailVerified: boolean;
  roles: readonly Role[];
  vendorId?: string;
  createdAt: number;
}>;
export type PersistedSessionIdentity = Readonly<{
  sessionId: string;
  userId: string;
  email: string;
  status: UserAccount["status"];
  emailVerified: boolean;
  roles: readonly Role[];
  vendorId?: string;
  expiresAt: number;
  lastSeenAt: number;
}>;

export class PostgresIdentityRepository {
  readonly #uow: PostgresUnitOfWork;
  readonly #db: SqlExecutor;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
    this.#db = pool;
  }

  async saveAccount(input: { scope: DatabaseScope; account: UserAccount }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const account = input.account;
      const result = await tx.query<SqlRow>(`
        INSERT INTO users (id, public_id, email, password_hash, status, email_verified_at, preferred_locale, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,'el',$7,$7)
        ON CONFLICT (public_id) DO UPDATE SET email=EXCLUDED.email, password_hash=EXCLUDED.password_hash,
          status=EXCLUDED.status, email_verified_at=EXCLUDED.email_verified_at, updated_at=EXCLUDED.updated_at
        RETURNING id::text AS id
      `, [randomUUID(), account.id, account.email, account.passwordHash, account.status, account.emailVerified ? new Date(account.createdAt) : null, new Date(account.createdAt)]);
      const userUuid = String(requireSingleRow(result, "Unable to persist user account").id);

      if (account.roles.includes("customer")) {
        await tx.query("INSERT INTO customer_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userUuid]);
      }

      await tx.query("DELETE FROM platform_user_roles WHERE user_id = $1", [userUuid]);
      for (const role of account.roles.filter((role) => PLATFORM_ROLES.has(role))) {
        await tx.query("INSERT INTO platform_user_roles (user_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userUuid, role]);
      }

      const vendorRoles = account.roles.filter((role) => VENDOR_ROLES.has(role));
      if (vendorRoles.length > 0) {
        if (!account.vendorId) throw new Error("Vendor-scoped roles require a vendorId");
        const vendorUuid = await uuidFor(tx, "vendor_businesses", account.vendorId);
        const membershipResult = await tx.query<SqlRow>(`
          INSERT INTO vendor_users (id, public_id, vendor_id, user_id, location_id, active, created_at)
          VALUES ($1,$2,$3,$4,NULL,true,$5)
          ON CONFLICT (vendor_id, user_id) WHERE location_id IS NULL
          DO UPDATE SET active=true
          RETURNING id::text AS id
        `, [randomUUID(), `vuser-${account.id}-${account.vendorId}`, vendorUuid, userUuid, new Date(account.createdAt)]);
        const membershipUuid = String(requireSingleRow(membershipResult, "Unable to persist vendor membership").id);
        await tx.query("DELETE FROM vendor_user_roles WHERE vendor_user_id = $1", [membershipUuid]);
        for (const role of vendorRoles) {
          await tx.query("INSERT INTO vendor_user_roles (vendor_user_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING", [membershipUuid, role]);
        }
      }
    });
  }


  async findAccountForAuthentication(email: string): Promise<PersistedAuthenticationAccount | undefined> {
    const normalized = email.trim().toLowerCase();
    const result = await this.#db.query<SqlRow>(`
      SELECT u.public_id AS user_public_id, u.email::text AS email, u.password_hash, u.status::text AS status,
             u.email_verified_at, u.created_at,
             EXISTS(SELECT 1 FROM customer_profiles cp WHERE cp.user_id=u.id) AS is_customer,
             COALESCE((SELECT array_agg(DISTINCT pur.role) FROM platform_user_roles pur WHERE pur.user_id=u.id), ARRAY[]::text[]) AS platform_roles,
             COALESCE((SELECT array_agg(DISTINCT vur.role) FROM vendor_users vu JOIN vendor_user_roles vur ON vur.vendor_user_id=vu.id WHERE vu.user_id=u.id AND vu.active), ARRAY[]::text[]) AS vendor_roles,
             (SELECT vb.public_id FROM vendor_users vu JOIN vendor_businesses vb ON vb.id=vu.vendor_id WHERE vu.user_id=u.id AND vu.active ORDER BY vu.created_at LIMIT 1) AS vendor_public_id
      FROM users u
      WHERE lower(u.email::text)=lower($1)
      LIMIT 1
    `, [normalized]);
    if (result.rowCount === 0) return undefined;
    const row = result.rows[0];
    if (typeof row.password_hash !== "string" || row.password_hash.length === 0) return undefined;
    const roles: Role[] = [];
    if (row.is_customer === true) roles.push("customer");
    for (const source of [row.vendor_roles, row.platform_roles]) {
      if (!Array.isArray(source)) continue;
      for (const value of source) if (typeof value === "string" && (VENDOR_ROLES.has(value as Role) || PLATFORM_ROLES.has(value as Role))) roles.push(value as Role);
    }
    return {
      id: requiredString(row.user_public_id, "user_public_id"),
      email: requiredString(row.email, "email"),
      passwordHash: requiredString(row.password_hash, "password_hash"),
      status: requiredString(row.status, "status") as UserAccount["status"],
      emailVerified: row.email_verified_at != null,
      roles: [...new Set(roles)],
      vendorId: optionalString(row.vendor_public_id),
      createdAt: epoch(row.created_at, "created_at")
    };
  }

  async touchSession(input: { sessionId: string; now: number }): Promise<void> {
    await this.#db.query("UPDATE user_sessions SET last_seen_at=$2 WHERE public_id=$1 OR id::text=$1", [input.sessionId, new Date(input.now)]);
  }
  async saveSession(input: { scope: DatabaseScope; session: AuthSession }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const userUuid = await uuidFor(tx, "users", input.session.userId);
      await tx.query(`
        INSERT INTO user_sessions (id, public_id, user_id, session_hash, csrf_hash, expires_at, last_seen_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (session_hash) DO UPDATE SET csrf_hash=EXCLUDED.csrf_hash, expires_at=EXCLUDED.expires_at, last_seen_at=EXCLUDED.last_seen_at
      `, [randomUUID(), input.session.id, userUuid, input.session.tokenHash, sha256(input.session.csrfToken), new Date(input.session.expiresAt), new Date(input.session.lastSeenAt), new Date(input.session.createdAt)]);
    });
  }

  async saveEmailVerification(input: { scope: DatabaseScope; verification: EmailVerification }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const userUuid = await uuidFor(tx, "users", input.verification.userId);
      await tx.query(`
        INSERT INTO email_verification_tokens (id, public_id, user_id, token_hash, expires_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (token_hash) DO NOTHING
      `, [randomUUID(), `email-verification-${input.verification.tokenHash.slice(0, 20)}`, userUuid, input.verification.tokenHash, new Date(input.verification.expiresAt), new Date(input.verification.createdAt)]);
    });
  }

  async consumeEmailVerification(input: { scope: DatabaseScope; tokenHash: string; now: number }): Promise<string> {
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const token = await tx.query<SqlRow>(`
        UPDATE email_verification_tokens
        SET consumed_at = $2
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > $2
        RETURNING user_id::text AS user_id
      `, [input.tokenHash, new Date(input.now)]);
      const userUuid = String(requireSingleRow(token, "Email verification token is invalid or expired").user_id);
      const user = await tx.query<SqlRow>(`
        UPDATE users SET email_verified_at=$2, status=CASE WHEN status='pending_verification' THEN 'active' ELSE status END, updated_at=$2
        WHERE id=$1
        RETURNING public_id
      `, [userUuid, new Date(input.now)]);
      return requiredString(requireSingleRow(user, "Verified user was not found").public_id, "public_id");
    });
  }

  async findSession(input: { tokenHash: string; now: number }): Promise<PersistedSessionIdentity | undefined> {
    const result = await this.#db.query<SqlRow>(`
      SELECT us.public_id AS session_public_id, us.expires_at, us.last_seen_at,
             u.public_id AS user_public_id, u.email::text AS email, u.status::text AS status, u.email_verified_at,
             EXISTS(SELECT 1 FROM customer_profiles cp WHERE cp.user_id=u.id) AS is_customer,
             COALESCE((SELECT array_agg(DISTINCT pur.role) FROM platform_user_roles pur WHERE pur.user_id=u.id), ARRAY[]::text[]) AS platform_roles,
             COALESCE((SELECT array_agg(DISTINCT vur.role) FROM vendor_users vu JOIN vendor_user_roles vur ON vur.vendor_user_id=vu.id WHERE vu.user_id=u.id AND vu.active), ARRAY[]::text[]) AS vendor_roles,
             (SELECT vb.public_id FROM vendor_users vu JOIN vendor_businesses vb ON vb.id=vu.vendor_id WHERE vu.user_id=u.id AND vu.active ORDER BY vu.created_at LIMIT 1) AS vendor_public_id
      FROM user_sessions us
      JOIN users u ON u.id=us.user_id
      WHERE us.session_hash=$1 AND us.expires_at>$2 AND u.status='active' AND u.email_verified_at IS NOT NULL
    `, [input.tokenHash, new Date(input.now)]);
    if (result.rowCount === 0) return undefined;
    const row = result.rows[0];
    const roles: Role[] = [];
    if (row.is_customer === true) roles.push("customer");
    for (const source of [row.vendor_roles, row.platform_roles]) {
      if (!Array.isArray(source)) continue;
      for (const value of source) if (typeof value === "string" && (VENDOR_ROLES.has(value as Role) || PLATFORM_ROLES.has(value as Role))) roles.push(value as Role);
    }
    return {
      sessionId: requiredString(row.session_public_id, "session_public_id"),
      userId: requiredString(row.user_public_id, "user_public_id"),
      email: requiredString(row.email, "email"),
      status: requiredString(row.status, "status") as UserAccount["status"],
      emailVerified: true,
      roles: [...new Set(roles)],
      vendorId: optionalString(row.vendor_public_id),
      expiresAt: epoch(row.expires_at, "expires_at"),
      lastSeenAt: epoch(row.last_seen_at, "last_seen_at")
    };
  }

  async verifyCsrf(input: { sessionId: string; csrfToken: string; now: number }): Promise<boolean> {
    const result = await this.#db.query<SqlRow>(
      "SELECT 1 AS ok FROM user_sessions WHERE (public_id=$1 OR id::text=$1) AND csrf_hash=$2 AND expires_at>$3",
      [input.sessionId, sha256(input.csrfToken), new Date(input.now)]
    );
    return result.rowCount === 1;
  }

  async revokeSession(input: { scope: DatabaseScope; sessionId: string }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      await tx.query("DELETE FROM user_sessions WHERE public_id=$1 OR id::text=$1", [input.sessionId]);
    });
  }
}

export class PostgresVendorRepository {
  readonly #uow: PostgresUnitOfWork;
  readonly #db: SqlExecutor;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
    this.#db = pool;
  }

  async saveApplication(input: { scope: DatabaseScope; application: VendorApplication }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const ownerUuid = await uuidFor(tx, "users", input.application.ownerUserId);
      const market = await marketUuid(tx, input.application.marketId);
      const vendorUuid = input.application.vendorId
        ? (await tx.query<SqlRow>("SELECT id::text AS id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1", [input.application.vendorId])).rows[0]?.id ?? null
        : null;
      const inserted = await tx.query<SqlRow>(`
        INSERT INTO vendor_applications (
          id, public_id, owner_user_id, market_id, vendor_id, legal_name, trading_name, tax_number, gemi_number,
          contact_email, phone, address_line1, postcode, primary_category, shop_story, requested_plan_code,
          status, verification_notes, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (public_id) DO UPDATE SET vendor_id=EXCLUDED.vendor_id, legal_name=EXCLUDED.legal_name,
          trading_name=EXCLUDED.trading_name, tax_number=EXCLUDED.tax_number, gemi_number=EXCLUDED.gemi_number,
          contact_email=EXCLUDED.contact_email, phone=EXCLUDED.phone, address_line1=EXCLUDED.address_line1,
          postcode=EXCLUDED.postcode, primary_category=EXCLUDED.primary_category, shop_story=EXCLUDED.shop_story,
          requested_plan_code=EXCLUDED.requested_plan_code, status=EXCLUDED.status,
          verification_notes=EXCLUDED.verification_notes, updated_at=EXCLUDED.updated_at
        RETURNING id::text AS id
      `, [randomUUID(), input.application.id, ownerUuid, market, vendorUuid, input.application.legalName, input.application.tradingName,
        input.application.taxNumber ?? null, input.application.gemiNumber ?? null, input.application.contactEmail, input.application.phone ?? null,
        input.application.address, input.application.postcode, input.application.primaryCategory, input.application.shopStory ?? null,
        input.application.requestedPlanCode, input.application.state, input.application.verificationNotes ?? null,
        new Date(input.application.createdAt), new Date(input.application.updatedAt)]);
      const applicationUuid = String(requireSingleRow(inserted, "Unable to persist vendor application").id);

      for (const event of input.application.history) await this.#saveApplicationEvent(tx, applicationUuid, event);
    });
  }

  async application(applicationId: string): Promise<VendorApplication | undefined> {
    const result = await this.#db.query<SqlRow>(`
      SELECT a.*, u.public_id AS owner_public_id, m.code AS market_code, vb.public_id AS vendor_public_id
      FROM vendor_applications a
      JOIN users u ON u.id=a.owner_user_id
      JOIN markets m ON m.id=a.market_id
      LEFT JOIN vendor_businesses vb ON vb.id=a.vendor_id
      WHERE a.public_id=$1 OR a.id::text=$1
    `, [applicationId]);
    if (result.rowCount === 0) return undefined;
    const row = result.rows[0];
    const events = await this.#db.query<SqlRow>(`
      SELECT e.from_status::text, e.to_status::text, e.actor_public_id, e.reason, e.occurred_at
      FROM vendor_application_events e
      JOIN vendor_applications a ON a.id=e.application_id
      WHERE a.public_id=$1 OR a.id::text=$1
      ORDER BY e.occurred_at, e.id
    `, [applicationId]);
    return {
      id: requiredString(row.public_id, "public_id"),
      ownerUserId: requiredString(row.owner_public_id, "owner_public_id"),
      marketId: requiredString(row.market_code, "market_code"),
      vendorId: optionalString(row.vendor_public_id),
      legalName: requiredString(row.legal_name, "legal_name"),
      tradingName: requiredString(row.trading_name, "trading_name"),
      taxNumber: optionalString(row.tax_number),
      gemiNumber: optionalString(row.gemi_number),
      contactEmail: requiredString(row.contact_email, "contact_email"),
      phone: optionalString(row.phone),
      address: requiredString(row.address_line1, "address_line1"),
      postcode: requiredString(row.postcode, "postcode"),
      primaryCategory: requiredString(row.primary_category, "primary_category"),
      shopStory: optionalString(row.shop_story),
      requestedPlanCode: requiredString(row.requested_plan_code, "requested_plan_code"),
      state: requiredString(row.status, "status") as VendorApplication["state"],
      verificationNotes: optionalString(row.verification_notes),
      createdAt: epoch(row.created_at, "created_at"),
      updatedAt: epoch(row.updated_at, "updated_at"),
      history: events.rows.map((event) => ({
        from: requiredString(event.from_status, "from_status") as VendorStateTransition["from"],
        to: requiredString(event.to_status, "to_status") as VendorStateTransition["to"],
        actorId: requiredString(event.actor_public_id, "actor_public_id"),
        reason: requiredString(event.reason, "reason"),
        at: epoch(event.occurred_at, "occurred_at")
      }))
    };
  }

  async provisionActiveVendor(input: { scope: DatabaseScope; application: VendorApplication; now: number }): Promise<{ vendorId: string; locationId: string }> {
    if (input.application.state !== "active" || !input.application.vendorId) throw new Error("Only an active vendor application can be provisioned");
    return this.#uow.withTransaction(input.scope, async (tx) => {
      const ownerUuid = await uuidFor(tx, "users", input.application.ownerUserId);
      const market = await marketUuid(tx, input.application.marketId);
      const vendorResult = await tx.query<SqlRow>(`
        INSERT INTO vendor_businesses (id, public_id, market_id, legal_name, trading_name, tax_number, gemi_number, status, verification_completed_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$8,$8)
        ON CONFLICT (public_id) DO UPDATE SET legal_name=EXCLUDED.legal_name, trading_name=EXCLUDED.trading_name,
          tax_number=EXCLUDED.tax_number, gemi_number=EXCLUDED.gemi_number, status='active', verification_completed_at=EXCLUDED.verification_completed_at, updated_at=EXCLUDED.updated_at
        RETURNING id::text AS id
      `, [randomUUID(), input.application.vendorId, market, input.application.legalName, input.application.tradingName,
        input.application.taxNumber ?? null, input.application.gemiNumber ?? null, new Date(input.now)]);
      const vendorUuid = String(requireSingleRow(vendorResult, "Unable to provision vendor").id);
      const locationId = `location-${input.application.vendorId}-primary`;
      const locationResult = await tx.query<SqlRow>(`
        INSERT INTO vendor_locations (id, public_id, vendor_id, market_id, name, address_line1, locality, postcode, country_code, phone, public_email, active, verified_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,(SELECT name FROM markets WHERE id=$4),$7,'GR',$8,$9,true,$10,$10,$10)
        ON CONFLICT (public_id) DO UPDATE SET name=EXCLUDED.name, address_line1=EXCLUDED.address_line1,
          postcode=EXCLUDED.postcode, phone=EXCLUDED.phone, public_email=EXCLUDED.public_email, active=true, verified_at=EXCLUDED.verified_at, updated_at=EXCLUDED.updated_at
        RETURNING id::text AS id
      `, [randomUUID(), locationId, vendorUuid, market, input.application.tradingName, input.application.address,
        input.application.postcode, input.application.phone ?? null, input.application.contactEmail, new Date(input.now)]);
      String(requireSingleRow(locationResult, "Unable to provision vendor location").id);

      const membership = await tx.query<SqlRow>(`
        INSERT INTO vendor_users (id, public_id, vendor_id, user_id, location_id, active, created_at)
        VALUES ($1,$2,$3,$4,NULL,true,$5)
        ON CONFLICT (vendor_id, user_id) WHERE location_id IS NULL DO UPDATE SET active=true
        RETURNING id::text AS id
      `, [randomUUID(), `vuser-${input.application.ownerUserId}-${input.application.vendorId}`, vendorUuid, ownerUuid, new Date(input.now)]);
      const vendorUserUuid = String(requireSingleRow(membership, "Unable to provision vendor owner membership").id);
      await tx.query("INSERT INTO vendor_user_roles (vendor_user_id, role) VALUES ($1,'vendor_owner') ON CONFLICT DO NOTHING", [vendorUserUuid]);
      if (input.application.shopStory) {
        await tx.query(`INSERT INTO vendor_profile_translations (vendor_id, locale, story) VALUES ($1,'el',$2)
          ON CONFLICT (vendor_id, locale) DO UPDATE SET story=EXCLUDED.story`, [vendorUuid, input.application.shopStory]);
      }
      await tx.query("UPDATE vendor_applications SET vendor_id=$2, status='active', updated_at=$3 WHERE public_id=$1", [input.application.id, vendorUuid, new Date(input.now)]);
      return { vendorId: input.application.vendorId!, locationId };
    });
  }

  async #saveApplicationEvent(tx: SqlExecutor, applicationUuid: string, event: VendorStateTransition): Promise<void> {
    const actor = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [event.actorId]);
    const actorUuid = actor.rows[0]?.id ?? null;
    await tx.query(`
      INSERT INTO vendor_application_events (id, public_id, application_id, from_status, to_status, actor_user_id, actor_public_id, reason, occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (application_id, occurred_at, to_status, actor_public_id) DO NOTHING
    `, [randomUUID(), `vapp-event-${inputSafe(event.actorId)}-${event.at}-${event.to}`, applicationUuid, event.from, event.to, actorUuid, event.actorId, event.reason, new Date(event.at)]);
  }
}

function inputSafe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "actor";
}

export class PostgresMediaTrustRepository {
  readonly #uow: PostgresUnitOfWork;
  readonly #db: SqlExecutor;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
    this.#db = pool;
  }

  async saveMedia(input: { scope: DatabaseScope; asset: ProductMediaAsset }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const variant = await uuidFor(tx, "canonical_variants", input.asset.canonicalVariantId);
      const vendor = await optionalUuidFor(tx, "vendor_businesses", input.asset.vendorId);
      const reviewer = await optionalUuidFor(tx, "users", input.asset.reviewedBy);
      await tx.query(`
        INSERT INTO product_media (
          id, public_id, canonical_variant_id, vendor_id, kind, object_key, original_filename, content_type, byte_size, sha256,
          alt_text, rights_owner, rights_status, moderation_status, scan_status, rejection_reason, reviewed_by, reviewed_at, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (public_id) DO UPDATE SET rights_status=EXCLUDED.rights_status, moderation_status=EXCLUDED.moderation_status,
          scan_status=EXCLUDED.scan_status, rejection_reason=EXCLUDED.rejection_reason, reviewed_by=EXCLUDED.reviewed_by, reviewed_at=EXCLUDED.reviewed_at,
          alt_text=EXCLUDED.alt_text, rights_owner=EXCLUDED.rights_owner
      `, [randomUUID(), input.asset.id, variant, vendor, input.asset.kind, input.asset.objectKey, input.asset.originalFilename,
        input.asset.contentType, input.asset.byteSize, input.asset.sha256, input.asset.altText ?? null, input.asset.rightsOwner ?? null,
        input.asset.rightsStatus, input.asset.moderationStatus, input.asset.scanStatus, input.asset.rejectionReason ?? null,
        reviewer, input.asset.reviewedAt ? new Date(input.asset.reviewedAt) : null, new Date(input.asset.createdAt)]);
    });
  }

  async publicMedia(canonicalVariantId: string): Promise<readonly ProductMediaAsset[]> {
    const result = await this.#db.query<SqlRow>(`
      SELECT pm.*, cv.public_id AS canonical_public_id, vb.public_id AS vendor_public_id, u.public_id AS reviewer_public_id
      FROM product_media pm
      JOIN canonical_variants cv ON cv.id=pm.canonical_variant_id
      LEFT JOIN vendor_businesses vb ON vb.id=pm.vendor_id
      LEFT JOIN users u ON u.id=pm.reviewed_by
      WHERE (cv.public_id=$1 OR cv.id::text=$1)
        AND pm.scan_status='clean' AND pm.rights_status='approved' AND pm.moderation_status='approved'
      ORDER BY pm.sort_order, pm.created_at
    `, [canonicalVariantId]);
    return result.rows.map((row) => this.#mapMedia(row));
  }

  async saveComplianceDocument(input: { scope: DatabaseScope; document: ProductComplianceDocument }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const variant = await uuidFor(tx, "canonical_variants", input.document.canonicalVariantId);
      const vendor = await optionalUuidFor(tx, "vendor_businesses", input.document.vendorId);
      const media = await optionalUuidFor(tx, "product_media", input.document.mediaAssetId);
      const verifier = await optionalUuidFor(tx, "users", input.document.verifiedBy);
      await tx.query(`
        INSERT INTO product_compliance_documents (
          id, public_id, canonical_variant_id, vendor_id, media_asset_id, type, issuer, identifier, object_key,
          valid_from, valid_to, status, verified_at, verified_by, rejection_reason, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, verified_at=EXCLUDED.verified_at,
          verified_by=EXCLUDED.verified_by, rejection_reason=EXCLUDED.rejection_reason, valid_from=EXCLUDED.valid_from, valid_to=EXCLUDED.valid_to
      `, [randomUUID(), input.document.id, variant, vendor, media, input.document.type, input.document.issuer ?? null,
        input.document.identifier ?? null, null, dateOnly(input.document.validFrom), dateOnly(input.document.validTo), input.document.status,
        input.document.verifiedAt ? new Date(input.document.verifiedAt) : null, verifier, input.document.rejectionReason ?? null, new Date(input.document.createdAt)]);
    });
  }

  async saveNotice(input: { scope: DatabaseScope; notice: ProductNotice }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const variant = await uuidFor(tx, "canonical_variants", input.notice.canonicalVariantId);
      const opener = await optionalUuidFor(tx, "users", input.notice.openedBy);
      const resolver = await optionalUuidFor(tx, "users", input.notice.resolvedBy);
      await tx.query(`
        INSERT INTO product_notices (id, public_id, canonical_variant_id, type, severity, status, details, opened_by, opened_at, closed_at, resolved_by, resolution)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, details=EXCLUDED.details, closed_at=EXCLUDED.closed_at,
          resolved_by=EXCLUDED.resolved_by, resolution=EXCLUDED.resolution
      `, [randomUUID(), input.notice.id, variant, input.notice.type, input.notice.severity, input.notice.status,
        JSON.stringify({ text: input.notice.details }), opener, new Date(input.notice.openedAt), input.notice.resolvedAt ? new Date(input.notice.resolvedAt) : null,
        resolver, input.notice.resolution ?? null]);
    });
  }

  #mapMedia(row: SqlRow): ProductMediaAsset {
    return {
      id: requiredString(row.public_id, "public_id"),
      canonicalVariantId: requiredString(row.canonical_public_id, "canonical_public_id"),
      vendorId: optionalString(row.vendor_public_id),
      kind: requiredString(row.kind, "kind") as ProductMediaAsset["kind"],
      objectKey: requiredString(row.object_key, "object_key"),
      originalFilename: requiredString(row.original_filename, "original_filename"),
      contentType: requiredString(row.content_type, "content_type"),
      byteSize: Number(row.byte_size),
      sha256: requiredString(row.sha256, "sha256"),
      altText: optionalString(row.alt_text),
      rightsOwner: optionalString(row.rights_owner),
      rightsStatus: requiredString(row.rights_status, "rights_status") as ProductMediaAsset["rightsStatus"],
      moderationStatus: requiredString(row.moderation_status, "moderation_status") as ProductMediaAsset["moderationStatus"],
      scanStatus: requiredString(row.scan_status, "scan_status") as ProductMediaAsset["scanStatus"],
      rejectionReason: optionalString(row.rejection_reason),
      createdAt: epoch(row.created_at, "created_at"),
      reviewedAt: row.reviewed_at ? epoch(row.reviewed_at, "reviewed_at") : undefined,
      reviewedBy: optionalString(row.reviewer_public_id)
    };
  }
}

export class PostgresTrustRepository {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool);
  }

  async saveReturn(input: { scope: DatabaseScope; item: ReturnCase }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const order = await uuidFor(tx, "customer_orders", input.item.orderId);
      const orderLine = await uuidFor(tx, "order_lines", input.item.orderLineId);
      const customer = await uuidFor(tx, "users", input.item.customerId);
      const recallNotice = await optionalUuidFor(tx, "product_notices", input.item.recallNoticeId);
      const existing = await tx.query<SqlRow>("SELECT id::text AS id FROM returns WHERE public_id=$1 OR id::text=$1", [input.item.id]);
      const returnUuid = existing.rows[0]?.id ? String(existing.rows[0].id) : randomUUID();
      await tx.query(`
        INSERT INTO returns (
          id, public_id, return_number, order_id, customer_user_id, vendor_id, reason_type, source, recall_notice_id,
          status, requested_remedy, eligibility_state, eligibility_basis, eligibility_reason, eligibility_expires_at,
          notes, disposition, inspection_findings, destination_type, destination_vendor_id, destination_instructions,
          rma_code, return_by_at, return_cost_payer, carrier, tracking_number, approved_remedy, price_reduction_minor,
          approved_at, received_at, inspected_at, refunded_at, closed_at, created_at, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,(SELECT vendor_id FROM order_lines WHERE id=$6),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
          CASE WHEN $20::text IS NULL THEN NULL ELSE (SELECT id FROM vendor_businesses WHERE public_id=$20 OR id::text=$20) END,
          $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, notes=EXCLUDED.notes, disposition=EXCLUDED.disposition,
          inspection_findings=EXCLUDED.inspection_findings, source=EXCLUDED.source, recall_notice_id=EXCLUDED.recall_notice_id,
          requested_remedy=EXCLUDED.requested_remedy, eligibility_state=EXCLUDED.eligibility_state, eligibility_basis=EXCLUDED.eligibility_basis,
          eligibility_reason=EXCLUDED.eligibility_reason, eligibility_expires_at=EXCLUDED.eligibility_expires_at,
          destination_type=EXCLUDED.destination_type, destination_vendor_id=EXCLUDED.destination_vendor_id,
          destination_instructions=EXCLUDED.destination_instructions, rma_code=EXCLUDED.rma_code, return_by_at=EXCLUDED.return_by_at,
          return_cost_payer=EXCLUDED.return_cost_payer, carrier=EXCLUDED.carrier, tracking_number=EXCLUDED.tracking_number,
          approved_remedy=EXCLUDED.approved_remedy, price_reduction_minor=EXCLUDED.price_reduction_minor,
          approved_at=EXCLUDED.approved_at, received_at=EXCLUDED.received_at, inspected_at=EXCLUDED.inspected_at,
          refunded_at=EXCLUDED.refunded_at, closed_at=EXCLUDED.closed_at, updated_at=EXCLUDED.updated_at
      `, [returnUuid, input.item.id, `RET-${input.item.id}`, order, customer, orderLine, input.item.reason, input.item.source, recallNotice,
        input.item.status, input.item.requestedRemedy, input.item.eligibility.state, input.item.eligibility.basis, input.item.eligibility.reason,
        input.item.eligibility.expiresAt ? new Date(input.item.eligibility.expiresAt) : null, input.item.notes ?? null, input.item.disposition ?? null,
        input.item.inspectionFindings ?? null, input.item.authorization?.destinationType ?? null, input.item.authorization?.destinationVendorId ?? null,
        input.item.authorization?.instructions ?? null, input.item.authorization?.rmaCode ?? null,
        input.item.authorization?.returnByAt ? new Date(input.item.authorization.returnByAt) : null, input.item.authorization?.returnCostPayer ?? null,
        input.item.authorization?.carrier ?? null, input.item.authorization?.trackingNumber ?? null, input.item.approvedRemedy ?? null,
        input.item.priceReduction?.minor ?? null, input.item.approvedAt ? new Date(input.item.approvedAt) : null,
        input.item.receivedAt ? new Date(input.item.receivedAt) : null, input.item.inspectedAt ? new Date(input.item.inspectedAt) : null,
        input.item.refundedAt ? new Date(input.item.refundedAt) : null, input.item.closedAt ? new Date(input.item.closedAt) : null,
        new Date(input.item.requestedAt), new Date(input.item.audit.at(-1)?.at ?? input.item.requestedAt)]);
      await tx.query(`INSERT INTO return_lines (return_id, order_line_id, quantity, requested_remedy, approved_remedy, price_reduction_minor, inspection_result, remedy)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$5)
        ON CONFLICT (return_id, order_line_id) DO UPDATE SET quantity=EXCLUDED.quantity, requested_remedy=EXCLUDED.requested_remedy,
          approved_remedy=EXCLUDED.approved_remedy, price_reduction_minor=EXCLUDED.price_reduction_minor, inspection_result=EXCLUDED.inspection_result, remedy=EXCLUDED.remedy`,
        [returnUuid, orderLine, input.item.quantity, input.item.requestedRemedy, input.item.approvedRemedy ?? null, input.item.priceReduction?.minor ?? null,
          JSON.stringify({ disposition: input.item.disposition, findings: input.item.inspectionFindings })]);

      for (const evidence of input.item.evidence) {
        const actor = await optionalUuidFor(tx, "users", evidence.submittedBy);
        await tx.query(`INSERT INTO return_evidence (id, public_id, return_id, kind, reference, note, submitted_by, submitted_by_public_id, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (public_id) DO NOTHING`,
          [randomUUID(), evidence.id, returnUuid, evidence.kind, evidence.reference ?? null, evidence.note ?? null, actor, evidence.submittedBy, new Date(evidence.createdAt)]);
      }
      for (const custody of input.item.custody) {
        const actor = await optionalUuidFor(tx, "users", custody.actorId);
        await tx.query(`INSERT INTO return_custody_events (id, public_id, return_id, from_party, to_party, actor_user_id, actor_public_id, reference, note, occurred_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (public_id) DO NOTHING`,
          [randomUUID(), custody.id, returnUuid, custody.from, custody.to, actor, custody.actorId, custody.reference ?? null, custody.note ?? null, new Date(custody.occurredAt)]);
      }
      if (input.item.replacement) {
        const replacement = input.item.replacement;
        const vendor = await uuidFor(tx, "vendor_businesses", replacement.vendorId);
        const location = await uuidFor(tx, "vendor_locations", replacement.locationId);
        const offer = await uuidFor(tx, "vendor_offers", replacement.offerId);
        const reservation = await uuidFor(tx, "stock_reservations", replacement.reservationId);
        await tx.query(`INSERT INTO return_replacements (id, public_id, return_id, vendor_id, location_id, offer_id, reservation_id, quantity, fulfilment_mode, status, reference, accepted_at, delivered_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (return_id) DO UPDATE SET status=EXCLUDED.status, reference=EXCLUDED.reference, accepted_at=EXCLUDED.accepted_at,
            delivered_at=EXCLUDED.delivered_at, updated_at=EXCLUDED.updated_at`,
          [randomUUID(), replacement.id, returnUuid, vendor, location, offer, reservation, replacement.quantity, replacement.fulfilmentMode,
            replacement.status, replacement.reference ?? null, replacement.acceptedAt ? new Date(replacement.acceptedAt) : null,
            replacement.deliveredAt ? new Date(replacement.deliveredAt) : null, new Date(replacement.createdAt), new Date(input.item.audit.at(-1)?.at ?? replacement.createdAt)]);
      }
      if (input.item.repair) {
        const repair = input.item.repair;
        const vendor = await uuidFor(tx, "vendor_businesses", repair.vendorId);
        await tx.query(`INSERT INTO return_repairs (id, public_id, return_id, vendor_id, status, due_at, repairer_reference, findings, started_at, ready_at, returned_at, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (return_id) DO UPDATE SET status=EXCLUDED.status, due_at=EXCLUDED.due_at, repairer_reference=EXCLUDED.repairer_reference,
            findings=EXCLUDED.findings, started_at=EXCLUDED.started_at, ready_at=EXCLUDED.ready_at, returned_at=EXCLUDED.returned_at, updated_at=EXCLUDED.updated_at`,
          [randomUUID(), repair.id, returnUuid, vendor, repair.status, new Date(repair.dueAt), repair.repairerReference ?? null, repair.findings ?? null,
            repair.startedAt ? new Date(repair.startedAt) : null, repair.readyAt ? new Date(repair.readyAt) : null,
            repair.returnedAt ? new Date(repair.returnedAt) : null, new Date(repair.createdAt), new Date(input.item.audit.at(-1)?.at ?? repair.createdAt)]);
      }
      for (const event of input.item.audit) {
        const actorResult = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [event.actorId]);
        await tx.query(`
          INSERT INTO return_events (id, public_id, return_id, actor_user_id, actor_public_id, action, note, occurred_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (return_id, occurred_at, action, actor_public_id) DO NOTHING
        `, [randomUUID(), `ret-event-${inputSafe(event.actorId)}-${event.at}-${inputSafe(event.action)}`, returnUuid,
          actorResult.rows[0]?.id ?? null, event.actorId, event.action, event.note ?? null, new Date(event.at)]);
      }
    });
  }

  async saveRecallAffectedCase(input: { scope: DatabaseScope; item: RecallAffectedCase }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const notice = await uuidFor(tx, "product_notices", input.item.noticeId);
      const variant = await uuidFor(tx, "canonical_variants", input.item.canonicalVariantId);
      const order = await uuidFor(tx, "customer_orders", input.item.orderId);
      const orderLine = await uuidFor(tx, "order_lines", input.item.orderLineId);
      const customer = await optionalUuidFor(tx, "users", input.item.customerId);
      const vendor = await uuidFor(tx, "vendor_businesses", input.item.vendorId);
      const returnId = await optionalUuidFor(tx, "returns", input.item.returnId);
      await tx.query(`INSERT INTO recall_affected_orders (
          id, public_id, notice_id, canonical_variant_id, order_id, order_line_id, customer_user_id, vendor_id, affected_quantity,
          status, selected_remedy, return_id, identified_at, notified_at, acknowledged_at, resolved_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, selected_remedy=EXCLUDED.selected_remedy, return_id=EXCLUDED.return_id,
          notified_at=EXCLUDED.notified_at, acknowledged_at=EXCLUDED.acknowledged_at, resolved_at=EXCLUDED.resolved_at, updated_at=EXCLUDED.updated_at`,
        [randomUUID(), input.item.id, notice, variant, order, orderLine, customer, vendor, input.item.affectedQuantity, input.item.status,
          input.item.selectedRemedy ?? null, returnId, new Date(input.item.identifiedAt), input.item.notifiedAt ? new Date(input.item.notifiedAt) : null,
          input.item.acknowledgedAt ? new Date(input.item.acknowledgedAt) : null, input.item.resolvedAt ? new Date(input.item.resolvedAt) : null,
          new Date(input.item.resolvedAt ?? input.item.acknowledgedAt ?? input.item.notifiedAt ?? input.item.identifiedAt)]);
    });
  }

  async saveNotification(input: { scope: DatabaseScope; notification: Notification }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const user = await optionalUuidFor(tx, "users", input.notification.userId);
      const vendor = await optionalUuidFor(tx, "vendor_businesses", input.notification.vendorId);
      await tx.query(`
        INSERT INTO notifications (id, public_id, user_id, vendor_id, channel, purpose, event_type, template_version, locale, title, body, payload, status, dedupe_key, provider_message_id, sent_at, failed_at, read_at, archived_at, delivery_attempts, next_attempt_at, delivery_lease_owner, delivery_lease_until, last_delivery_error, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        ON CONFLICT (public_id) DO UPDATE SET status=EXCLUDED.status, provider_message_id=EXCLUDED.provider_message_id,
          sent_at=EXCLUDED.sent_at, failed_at=EXCLUDED.failed_at, read_at=EXCLUDED.read_at, archived_at=EXCLUDED.archived_at, title=EXCLUDED.title, body=EXCLUDED.body, payload=EXCLUDED.payload,
          delivery_attempts=EXCLUDED.delivery_attempts, next_attempt_at=EXCLUDED.next_attempt_at, delivery_lease_owner=EXCLUDED.delivery_lease_owner,
          delivery_lease_until=EXCLUDED.delivery_lease_until, last_delivery_error=EXCLUDED.last_delivery_error
      `, [randomUUID(), input.notification.id, user, vendor, input.notification.channel, input.notification.purpose, input.notification.eventType,
        input.notification.templateVersion, input.notification.locale, input.notification.title, input.notification.body,
        JSON.stringify(input.notification.payload), input.notification.status, input.notification.dedupeKey ?? null,
        input.notification.providerMessageId ?? null, input.notification.sentAt ? new Date(input.notification.sentAt) : null,
        input.notification.failedAt ? new Date(input.notification.failedAt) : null, input.notification.readAt ? new Date(input.notification.readAt) : null,
        input.notification.archivedAt ? new Date(input.notification.archivedAt) : null, input.notification.deliveryAttempts, input.notification.nextAttemptAt ? new Date(input.notification.nextAttemptAt) : null,
        input.notification.deliveryLeaseOwner ?? null, input.notification.deliveryLeaseUntil ? new Date(input.notification.deliveryLeaseUntil) : null,
        input.notification.lastDeliveryError ?? null, new Date(input.notification.createdAt)]);
    });
  }

  async saveAudit(input: { scope: DatabaseScope; event: AuditEvent }): Promise<void> {
    await this.#uow.withTransaction(input.scope, async (tx) => {
      const market = input.scope.marketId ? await marketUuid(tx, input.scope.marketId) : null;
      const actorResult = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [input.event.actorId]);
      await tx.query(`
        INSERT INTO audit_events (id, public_id, market_id, actor_user_id, actor_public_id, actor_role, action, entity_type, entity_id, reason, before_state, after_state, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
        ON CONFLICT (public_id) DO NOTHING
      `, [randomUUID(), input.event.id, market, actorResult.rows[0]?.id ?? null, input.event.actorId, input.event.actorRole ?? null,
        input.event.action, input.event.entityType, input.event.entityId, input.event.reason ?? null,
        input.event.before === undefined ? null : JSON.stringify(input.event.before), input.event.after === undefined ? null : JSON.stringify(input.event.after),
        new Date(input.event.createdAt)]);
    });
  }
}
