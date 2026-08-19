import { createHash, createHmac, randomBytes } from "node:crypto";
import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { accountAuthSecret } from "./account-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { isProvisionalVendorApplicantPasswordHash } from "./provisional-account";
import { publicOrigin } from "./public-origin";

const VENDOR_SETUP_TTL_MS = 30 * 60 * 1000;

export type VendorActivationAccess = Readonly<{
  vendorId: string;
  tradingName: string;
  email: string;
  userId: string;
  passwordSetupRequired: boolean;
  passwordSetupUrl?: string;
  deliveryKey: string;
}>;

export async function prepareVendorActivationAccess(input: { vendorId: string; now: number }): Promise<VendorActivationAccess> {
  if (!productionDatabaseConfigured()) throw new Error("Vendor activation access requires the production database");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);

  return uow.withTransaction(platformScope("vendor-activation-access"), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT
        v.public_id AS vendor_public_id,
        v.trading_name,
        u.id::text AS user_uuid,
        u.public_id AS user_public_id,
        u.email::text AS email,
        u.status::text AS user_status,
        u.email_verified_at,
        u.password_hash
      FROM vendor_businesses v
      JOIN vendor_users vu
        ON vu.vendor_id=v.id
       AND vu.active=true
       AND vu.location_id IS NULL
      JOIN vendor_user_roles vur
        ON vur.vendor_user_id=vu.id
       AND vur.role='vendor_owner'
      JOIN users u ON u.id=vu.user_id
      WHERE v.public_id=$1 OR v.id::text=$1
      ORDER BY vu.created_at ASC
      LIMIT 1
      FOR UPDATE OF u`, [input.vendorId]);

    const row = result.rows[0];
    if (!row) throw new Error("Vendor activation is blocked because no active vendor owner account is linked to this shop.");

    const vendorId = requiredText(row.vendor_public_id, "vendor.public_id");
    const tradingName = requiredText(row.trading_name, "vendor.trading_name");
    const userUuid = requiredText(row.user_uuid, "user.id");
    const userId = requiredText(row.user_public_id, "user.public_id");
    const email = normalizeEmail(requiredText(row.email, "user.email"));
    const passwordHash = requiredText(row.password_hash, "user.password_hash");
    const passwordSetupRequired = row.user_status !== "active"
      || !row.email_verified_at
      || isProvisionalVendorApplicantPasswordHash(passwordHash);

    if (!passwordSetupRequired) {
      return {
        vendorId,
        tradingName,
        email,
        userId,
        passwordSetupRequired: false,
        deliveryKey: `vendor-activation-existing-account:${vendorId}:${userId}`
      };
    }

    const token = createVendorSetupToken();
    const hashedToken = tokenHash(token);
    const expiresAt = input.now + VENDOR_SETUP_TTL_MS;

    await tx.query(
      `UPDATE password_reset_tokens
          SET consumed_at=$2
        WHERE user_id=$1::uuid
          AND consumed_at IS NULL`,
      [userUuid, new Date(input.now)]
    );
    await tx.query(
      `INSERT INTO password_reset_tokens (id, public_id, user_id, token_hash, expires_at, created_at)
       VALUES (gen_random_uuid(), $2, $1::uuid, $3, $4, $5)`,
      [userUuid, `vendor-activation-${hashedToken.slice(0, 20)}`, hashedToken, new Date(expiresAt), new Date(input.now)]
    );

    const setupUrl = new URL("/reset-password", publicOrigin());
    setupUrl.searchParams.set("token", token);
    setupUrl.searchParams.set("mode", "vendor");

    return {
      vendorId,
      tradingName,
      email,
      userId,
      passwordSetupRequired: true,
      passwordSetupUrl: setupUrl.toString(),
      deliveryKey: `vendor-activation-setup:${vendorId}:${hashedToken.slice(0, 32)}`
    };
  }, { isolation: "serializable" });
}

function createVendorSetupToken(): string {
  const raw = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", accountAuthSecret()).update(`password-reset:${raw}`).digest("base64url");
  return `${raw}.${signature}`;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("The linked vendor owner has no valid email address.");
  return email;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid database field ${field}`);
  return value.trim();
}
