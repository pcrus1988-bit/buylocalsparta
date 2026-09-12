import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  type SessionPrincipal,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import {
  assertAdminPermission,
  postgresAdminRuntimeEnabled,
  recordAdminAudit
} from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { getVendorOperationsRuntime } from "./vendor-operations-runtime";

export type AdminCanonicalIdentityInput = Readonly<{
  submissionId: string;
  titleEl?: string;
  reason: string;
}>;

export type AdminCanonicalIdentityResult = Readonly<{
  id: string;
  titleEl: string;
  taxRateBps: number;
  active: boolean;
  suppressed: boolean;
  recalled: boolean;
  createdAt: number;
  updatedAt: number;
}>;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Database field ${field} is not a safe integer`);
  return parsed;
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || `product-${randomUUID().slice(0, 8)}`;
}

function reason(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 3) throw new Error("Canonical creation reason must be at least 3 characters");
  if (normalized.length > 1000) throw new Error("Canonical creation reason must be at most 1000 characters");
  return normalized;
}

export async function adminCreateCanonicalIdentity(
  principal: SessionPrincipal,
  input: AdminCanonicalIdentityInput
): Promise<AdminCanonicalIdentityResult> {
  assertAdminPermission(principal, "catalog.write");
  const submissionId = input.submissionId.trim();
  if (!submissionId) throw new Error("Submission ID is required");
  const decisionReason = reason(input.reason);
  const now = Date.now();

  if (!postgresAdminRuntimeEnabled()) {
    // The ephemeral preview catalogue still has a legacy mandatory reference-price
    // field. Keep that internal placeholder out of this Admin contract: it never
    // creates or approves a vendor offer, and production persists NULL instead.
    const created = getVendorOperationsRuntime().catalog.createCanonicalFromSubmission({
      submissionId,
      actorId: principal.userId,
      platformPriceMinor: 0,
      titleEl: input.titleEl,
      reason: decisionReason,
      now
    });
    const result: AdminCanonicalIdentityResult = {
      id: created.id,
      titleEl: created.titleEl,
      taxRateBps: created.taxRateBps,
      active: created.active,
      suppressed: created.suppressed,
      recalled: created.recalled,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    };
    await recordAdminAudit(principal, "catalog.canonical_identity_created", "canonical_product", result.id, decisionReason, result);
    return result;
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  const result = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const source = await tx.query<SqlRow>(
      `SELECT
         s.id::text AS submission_uuid,
         s.public_id,
         s.status,
         s.canonical_variant_id,
         s.market_id::text AS market_uuid,
         s.category_id::text AS category_uuid,
         s.source_identity,
         s.supplier_tax_rate_bps
       FROM vendor_product_submissions s
       WHERE s.public_id = $1 OR s.id::text = $1
       FOR UPDATE`,
      [submissionId]
    );
    const row = source.rows[0];
    if (!row) throw new Error("Submission not found");
    if (row.canonical_variant_id) throw new Error("Submission is already linked to a canonical product");

    const from = text(row.status);
    if (!["submitted", "needs_review", "linked"].includes(from)) {
      throw new Error(`Cannot create canonical from ${from} product`);
    }

    const identity = jsonObject(row.source_identity);
    const title = input.titleEl?.trim()
      || (typeof identity.title === "string" && identity.title.trim() ? identity.title.trim() : "Untitled product");
    const rawGtin = typeof identity.gtin === "string" ? identity.gtin.trim() : "";
    const normalizedResult = await tx.query<SqlRow>(
      `SELECT CASE
         WHEN NULLIF(btrim($1::text), '') IS NOT NULL
          AND bls_private.catalog_gtin_is_valid($1::text)
         THEN bls_private.catalog_normalize_gtin($1::text)
         ELSE NULL
       END AS normalized_gtin`,
      [rawGtin]
    );
    const normalizedGtin = normalizedResult.rows[0]?.normalized_gtin == null
      ? undefined
      : text(normalizedResult.rows[0]?.normalized_gtin);

    if (normalizedGtin) {
      const existingIdentity = await tx.query<SqlRow>(
        `SELECT cv.public_id
         FROM canonical_variants cv
         WHERE cv.market_id = $1::uuid
           AND cv.recalled = false
           AND (
             (
               cv.gtin IS NOT NULL
               AND bls_private.catalog_gtin_is_valid(cv.gtin)
               AND bls_private.catalog_normalize_gtin(cv.gtin) = $2::text
             )
             OR EXISTS (
               SELECT 1
               FROM product_identifiers pi
               WHERE pi.canonical_variant_id = cv.id
                 AND pi.active = true
                 AND pi.identifier_scope = 'trade_item'
                 AND pi.identifier_type IN ('gtin8','gtin12','gtin13','gtin14','isbn13')
                 AND bls_private.catalog_normalize_gtin(pi.normalized_value) = $2::text
             )
           )
         LIMIT 1`,
        [text(row.market_uuid), normalizedGtin]
      );
      if (existingIdentity.rowCount) {
        throw new Error(`A canonical product already owns this GTIN (${text(existingIdentity.rows[0]?.public_id)}). Link the vendor submission instead of creating a duplicate.`);
      }
    }

    const publicId = `cv_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    let slug = slugify(title);
    const collision = await tx.query<SqlRow>(
      "SELECT 1 AS hit FROM canonical_variants WHERE market_id = $1::uuid AND slug = $2::text",
      [text(row.market_uuid), slug]
    );
    if (collision.rowCount) slug = `${slug}-${publicId.slice(-6)}`;

    const canonicalUuid = randomUUID();
    const taxRateBps = integer(row.supplier_tax_rate_bps, "supplier_tax_rate_bps");
    await tx.query(
      `INSERT INTO canonical_variants(
         id, public_id, market_id, category_id, slug, gtin, mpn, model, condition,
         variant_attributes, warranty_basis, platform_price_minor, currency,
         tax_rate_bps, active, suppressed, recalled, price_updated_at, created_at, updated_at
       ) VALUES(
         $1, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9,
         $10::jsonb, $11, NULL, 'EUR',
         $12, true, false, false, NULL, $13, $13
       )`,
      [
        canonicalUuid,
        publicId,
        text(row.market_uuid),
        text(row.category_uuid),
        slug,
        normalizedGtin ?? null,
        typeof identity.mpn === "string" ? identity.mpn.trim() || null : null,
        typeof identity.model === "string" ? identity.model.trim() || null : null,
        typeof identity.condition === "string" ? identity.condition : "new",
        JSON.stringify(identity.attributes && typeof identity.attributes === "object" ? identity.attributes : {}),
        typeof identity.warrantyBasis === "string" ? identity.warrantyBasis.trim() || null : null,
        taxRateBps,
        new Date(now)
      ]
    );

    await tx.query(
      `INSERT INTO product_translations(
         canonical_variant_id, locale, title, description, specifications, seo_title, seo_description
       ) VALUES($1, 'el', $2, NULL, '{}'::jsonb, $2, NULL)`,
      [canonicalUuid, title]
    );
    await tx.query(
      `UPDATE product_merge_candidates
          SET status = 'separated'
        WHERE submission_id = $1::uuid
          AND status IN ('pending','auto_linked')`,
      [text(row.submission_uuid)]
    );
    await tx.query(
      `UPDATE vendor_product_submissions
          SET canonical_variant_id = $2::uuid,
              status = 'linked',
              rejection_reason = NULL,
              updated_at = $3
        WHERE id = $1::uuid`,
      [text(row.submission_uuid), canonicalUuid, new Date(now)]
    );

    const actor = await tx.query<SqlRow>(
      "SELECT id::text AS id FROM users WHERE public_id = $1 OR id::text = $1",
      [principal.userId]
    );
    await tx.query(
      `INSERT INTO catalog_workflow_events(
         id, public_id, submission_id, actor_id, action, from_status, to_status,
         canonical_variant_id, reason, metadata, created_at
       ) VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8::uuid,$9,'{}'::jsonb,$10)`,
      [
        randomUUID(),
        `cwe_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        text(row.submission_uuid),
        actor.rows[0]?.id ?? null,
        "catalog.canonical_identity_created",
        from,
        "linked",
        canonicalUuid,
        decisionReason,
        new Date(now)
      ]
    );

    return {
      id: publicId,
      titleEl: title,
      taxRateBps,
      active: true,
      suppressed: false,
      recalled: false,
      createdAt: now,
      updatedAt: now
    } satisfies AdminCanonicalIdentityResult;
  }, { isolation: "serializable" });

  await recordAdminAudit(
    principal,
    "catalog.canonical_identity_created",
    "canonical_product",
    result.id,
    decisionReason,
    result
  );
  return result;
}
