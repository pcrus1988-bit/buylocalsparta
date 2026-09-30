import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { accountAuthSecret } from "./account-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const VENDOR_TRIAL_COOKIE = "bls_vendor_trial";
export const VENDOR_TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
const VENDOR_TRIAL_PREVIEW_ACCESS_MS = 30 * 24 * 60 * 60 * 1000;
const VENDOR_APPLICATION_PRELIVE_STATUSES = new Set(["application_started", "verification_pending", "catalog_onboarding", "test_ready"]);
const HUB_PROSPECT_PRELIVE_STATUSES = new Set(["pending", "contacted", "qualified", "verified", "approved"]);
const BLOCKED_VENDOR_STATUSES = new Set(["active", "restricted", "suspended", "closed"]);

type TrialTokenPayload = Readonly<{
  a: string;
  u: string;
  v: string;
  iat: number;
  exp: number;
}>;

type TrialSource = "vendor_application" | "hub_prospect";

type TrialRow = SqlRow & {
  application_public_id: string;
  application_status: string;
  trial_started_at: Date | string | number;
  trial_expires_at: Date | string | number;
  owner_public_id: string;
  email: string;
  vendor_public_id: string;
  trading_name: string;
  vendor_status: string;
  demo_mode: boolean;
  product_count: number;
  media_count: number;
};

export type VendorTrialSnapshot = Readonly<{
  applicationId: string;
  applicationStatus: string;
  vendorId: string;
  vendorStatus: string;
  vendorName: string;
  ownerUserId: string;
  email: string;
  trialStartedAt: number;
  trialExpiresAt: number;
  accessExpiresAt: number;
  active: boolean;
  expired: boolean;
  demoMode: boolean;
  productCount: number;
  mediaCount: number;
  source: TrialSource;
}>;

export function createVendorTrialAccessToken(input: {
  applicationId: string;
  ownerUserId: string;
  vendorId: string;
  trialStartedAt: number;
}): { token: string; accessExpiresAt: number } {
  const accessExpiresAt = input.trialStartedAt + VENDOR_TRIAL_PREVIEW_ACCESS_MS;
  const payload: TrialTokenPayload = {
    a: input.applicationId,
    u: input.ownerUserId,
    v: input.vendorId,
    iat: input.trialStartedAt,
    exp: accessExpiresAt
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", accountAuthSecret()).update(`vendor-trial:${encoded}`).digest("base64url");
  return { token: `${encoded}.${signature}`, accessExpiresAt };
}

export function buildVendorTrialAccessUrl(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.BLS_PUBLIC_BASE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim();
  const deployment = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  const base = explicit
    ? explicit
    : deployment
      ? `https://${deployment.replace(/^https?:\/\//, "")}`
      : "https://kontamou.site";
  return `${base.replace(/\/$/, "")}/api/vendor/trial/access?token=${encodeURIComponent(token)}`;
}

export async function getVendorTrialSnapshot(now = Date.now()): Promise<VendorTrialSnapshot | undefined> {
  const token = (await cookies()).get(VENDOR_TRIAL_COOKIE)?.value;
  return vendorTrialSnapshotFromToken(token, now);
}

export async function getActiveVendorTrialPrincipal(now = Date.now()): Promise<SessionPrincipal | undefined> {
  const token = (await cookies()).get(VENDOR_TRIAL_COOKIE)?.value;
  if (!token) return undefined;
  const snapshot = await vendorTrialSnapshotFromToken(token, now);
  if (!snapshot?.active) return undefined;
  return trialPrincipal(snapshot, token);
}

export async function vendorTrialSnapshotFromToken(token: string | undefined, now = Date.now()): Promise<VendorTrialSnapshot | undefined> {
  if (!token || !productionDatabaseConfigured()) return undefined;
  const payload = verifyTrialToken(token, now);
  if (!payload) return undefined;

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: `vendor-trial-session:${payload.a}` },
    async (tx) => {
      const standard = await standardApplicationTrialRow(tx, payload);
      if (standard) return snapshotFromRow(standard, payload, "vendor_application", now);

      const hub = await hubProspectTrialRow(tx, payload);
      if (hub) return snapshotFromRow(hub, payload, "hub_prospect", now);
      return undefined;
    },
    { readOnly: true }
  );
}

async function standardApplicationTrialRow(tx: SqlExecutor, payload: TrialTokenPayload): Promise<TrialRow | undefined> {
  const result = await tx.query<TrialRow>(`
    SELECT
      application.public_id AS application_public_id,
      application.status::text AS application_status,
      application.trial_started_at,
      application.trial_expires_at,
      owner.public_id AS owner_public_id,
      owner.email::text AS email,
      vendor.public_id AS vendor_public_id,
      vendor.trading_name,
      vendor.status::text AS vendor_status,
      vendor.demo_mode,
      COALESCE(products.product_count,0)::integer AS product_count,
      COALESCE(media.media_count,0)::integer AS media_count
    FROM vendor_applications application
    JOIN users owner ON owner.id=application.owner_user_id
    JOIN vendor_businesses vendor ON vendor.id=application.vendor_id
    LEFT JOIN LATERAL (
      SELECT (
        (SELECT count(*) FROM vendor_offers offer WHERE offer.vendor_id=vendor.id)
        +
        (SELECT count(*) FROM vendor_product_submissions submission
          WHERE submission.vendor_id=vendor.id
            AND submission.status IN ('draft','submitted','needs_review'))
      )::integer AS product_count
    ) products ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS media_count
      FROM product_media item
      WHERE item.vendor_id=vendor.id
        AND item.canonical_variant_id IS NULL
    ) media ON true
    WHERE application.public_id=$1
      AND owner.public_id=$2
      AND vendor.public_id=$3
    LIMIT 1
  `, [payload.a, payload.u, payload.v]);
  const row = result.rows[0];
  if (!row || !row.trial_started_at || !row.trial_expires_at) return undefined;
  return row;
}

async function hubProspectTrialRow(tx: SqlExecutor, payload: TrialTokenPayload): Promise<TrialRow | undefined> {
  const result = await tx.query<TrialRow>(`
    SELECT
      application.public_id AS application_public_id,
      application.status::text AS application_status,
      (vendor.storefront_settings->>'trialStartedAt')::bigint AS trial_started_at,
      (vendor.storefront_settings->>'trialExpiresAt')::bigint AS trial_expires_at,
      owner.public_id AS owner_public_id,
      owner.email::text AS email,
      vendor.public_id AS vendor_public_id,
      vendor.trading_name,
      vendor.status::text AS vendor_status,
      vendor.demo_mode,
      COALESCE(products.product_count,0)::integer AS product_count,
      COALESCE(media.media_count,0)::integer AS media_count
    FROM hub_expansion_prospects application
    JOIN vendor_businesses vendor
      ON vendor.public_id=$3
     AND vendor.storefront_settings->>'trialSource'='hub_prospect'
     AND vendor.storefront_settings->>'trialApplicationId'=application.public_id
    JOIN vendor_users membership
      ON membership.vendor_id=vendor.id
     AND membership.active
    JOIN users owner
      ON owner.id=membership.user_id
     AND owner.public_id=$2
    LEFT JOIN LATERAL (
      SELECT (
        (SELECT count(*) FROM vendor_offers offer WHERE offer.vendor_id=vendor.id)
        +
        (SELECT count(*) FROM vendor_product_submissions submission
          WHERE submission.vendor_id=vendor.id
            AND submission.status IN ('draft','submitted','needs_review'))
      )::integer AS product_count
    ) products ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS media_count
      FROM product_media item
      WHERE item.vendor_id=vendor.id
        AND item.canonical_variant_id IS NULL
    ) media ON true
    WHERE application.public_id=$1
    ORDER BY membership.created_at
    LIMIT 1
  `, [payload.a, payload.u, payload.v]);
  const row = result.rows[0];
  if (!row || !row.trial_started_at || !row.trial_expires_at) return undefined;
  return row;
}

function snapshotFromRow(row: TrialRow, payload: TrialTokenPayload, source: TrialSource, now: number): VendorTrialSnapshot {
  const trialStartedAt = epoch(row.trial_started_at);
  const trialExpiresAt = epoch(row.trial_expires_at);
  const applicationStatus = requiredText(row.application_status);
  const vendorStatus = requiredText(row.vendor_status);
  const demoMode = row.demo_mode === true;
  const allowedStatus = source === "hub_prospect"
    ? HUB_PROSPECT_PRELIVE_STATUSES.has(applicationStatus)
    : VENDOR_APPLICATION_PRELIVE_STATUSES.has(applicationStatus);
  const active = demoMode
    && allowedStatus
    && !BLOCKED_VENDOR_STATUSES.has(vendorStatus)
    && trialExpiresAt > now;

  return {
    applicationId: requiredText(row.application_public_id),
    applicationStatus,
    vendorId: requiredText(row.vendor_public_id),
    vendorStatus,
    vendorName: requiredText(row.trading_name),
    ownerUserId: requiredText(row.owner_public_id),
    email: requiredText(row.email),
    trialStartedAt,
    trialExpiresAt,
    accessExpiresAt: payload.exp,
    active,
    expired: trialExpiresAt <= now,
    demoMode,
    productCount: nonNegativeInteger(row.product_count),
    mediaCount: nonNegativeInteger(row.media_count),
    source
  };
}

export function isVendorTrialPrincipal(principal: SessionPrincipal): boolean {
  return principal.sessionId.startsWith("vtrial_");
}

export function assertVendorTrialCsrf(principal: SessionPrincipal, suppliedToken: string | undefined): void {
  if (!isVendorTrialPrincipal(principal)) throw new Error("Not a vendor trial session");
  if (!suppliedToken || !safeEqual(principal.csrfToken, suppliedToken)) throw new Error("CSRF validation failed");
}

function trialPrincipal(snapshot: VendorTrialSnapshot, token: string): SessionPrincipal {
  const digest = createHash("sha256").update(token).digest("hex");
  return {
    userId: snapshot.ownerUserId,
    email: snapshot.email,
    roles: ["vendor_owner"],
    vendorId: snapshot.vendorId,
    csrfToken: createHmac("sha256", accountAuthSecret()).update(`vendor-trial-csrf:${token}`).digest("base64url"),
    sessionId: `vtrial_${digest.slice(0, 32)}`
  };
}

function verifyTrialToken(token: string, now: number): TrialTokenPayload | undefined {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return undefined;
  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", accountAuthSecret()).update(`vendor-trial:${encoded}`).digest("base64url");
  if (!safeEqual(signature, expected)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<TrialTokenPayload>;
    if (!parsed.a || !parsed.u || !parsed.v) return undefined;
    if (!Number.isSafeInteger(parsed.iat) || !Number.isSafeInteger(parsed.exp) || parsed.exp! <= now) return undefined;
    if (parsed.exp! - parsed.iat! > VENDOR_TRIAL_PREVIEW_ACCESS_MS + 60_000) return undefined;
    return parsed as TrialTokenPayload;
  } catch {
    return undefined;
  }
}

function epoch(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d{10,16}$/.test(value)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  const result = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(result)) throw new Error("Invalid vendor trial timestamp");
  return result;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid vendor trial identity");
  return value.trim();
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
