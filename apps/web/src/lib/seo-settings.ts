import "server-only";

import { randomUUID } from "node:crypto";
import { cache } from "react";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { publicOrigin } from "./public-origin";

export const SEO_GLOBAL_SETTINGS_KEY = "seo.visibility.global.v1";
export const SEO_SETTINGS_AUDIT_ENTITY = "seo_global_settings";

export type SeoSitemapSettings = Readonly<{
  staticPages: boolean;
  categories: boolean;
  products: boolean;
  partnerVendors: boolean;
  researchVendors: boolean;
}>;

export type SeoGlobalSettings = Readonly<{
  canonicalOrigin: string;
  siteName: string;
  defaultTitle: string;
  titleTemplate: string;
  defaultDescription: string;
  defaultOpenGraphTitle: string;
  defaultOpenGraphDescription: string;
  defaultOpenGraphImage?: string;
  googleSiteVerification?: string;
  indexingEnabled: boolean;
  researchVendorIndexingEnabled: boolean;
  researchVendorMinimumScore: number;
  publicMediaCrawlEnabled: boolean;
  sitemap: SeoSitemapSettings;
}>;

export type SeoSettingsSnapshot = Readonly<{
  settings: SeoGlobalSettings;
  version: number;
  source: "database" | "defaults";
  persistenceAvailable: boolean;
  updatedAt?: string;
  updatedBy?: string;
}>;

export type SeoSettingsAuditEntry = Readonly<{
  id: string;
  actorId: string;
  actorRole?: string;
  reason?: string;
  changedKeys: readonly string[];
  createdAt: string;
}>;

type SettingsRow = Readonly<{
  value: unknown | null;
  version: number | null;
  updated_at: Date | string | null;
  updated_by_public_id?: string;
}>;

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

export function defaultSeoGlobalSettings(): SeoGlobalSettings {
  return {
    canonicalOrigin: publicOrigin(),
    siteName: "ΚΟΝΤΑ ΜΟΥ Sparta",
    defaultTitle: "ΚΟΝΤΑ ΜΟΥ Sparta | Η τοπική αγορά της Σπάρτης online",
    titleTemplate: "%s | ΚΟΝΤΑ ΜΟΥ Sparta",
    defaultDescription: "Ανακάλυψε προϊόντα από καταστήματα της Σπάρτης, πάρε πραγματική συμβουλή από τοπικούς επαγγελματίες και αγόρασε με μία ενιαία εμπειρία checkout.",
    defaultOpenGraphTitle: "ΚΟΝΤΑ ΜΟΥ Sparta",
    defaultOpenGraphDescription: "ΚΟΝΤΑ ΜΟΥ: Η Σπάρτη δίπλα σου",
    defaultOpenGraphImage: "/brand/kontamou-sparta-logo.webp",
    indexingEnabled: true,
    researchVendorIndexingEnabled: true,
    researchVendorMinimumScore: 5,
    publicMediaCrawlEnabled: true,
    sitemap: {
      staticPages: true,
      categories: true,
      products: true,
      partnerVendors: true,
      researchVendors: true
    }
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function savedString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim() && value.trim().length <= maxLength ? value.trim() : fallback;
}

function savedOptionalString(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim() && value.trim().length <= maxLength ? value.trim() : undefined;
}

function savedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function savedScore(value: unknown, fallback: number): number {
  const score = Number(value);
  return Number.isSafeInteger(score) && score >= 3 && score <= 7 ? score : fallback;
}

export function normalizeStoredSeoGlobalSettings(value: unknown, fallback = defaultSeoGlobalSettings()): SeoGlobalSettings {
  const input = object(value);
  const sitemap = object(input.sitemap);
  const storedOrigin = savedString(input.canonicalOrigin, fallback.canonicalOrigin, 300);
  const storedTemplate = savedString(input.titleTemplate, fallback.titleTemplate, 140);
  const storedImage = savedOptionalString(input.defaultOpenGraphImage, 1000);
  const storedVerification = savedOptionalString(input.googleSiteVerification, 255);
  return {
    canonicalOrigin: safely(() => normalizeCanonicalOrigin(storedOrigin), fallback.canonicalOrigin),
    siteName: savedString(input.siteName, fallback.siteName, 80),
    defaultTitle: savedString(input.defaultTitle, fallback.defaultTitle, 140),
    titleTemplate: safely(() => normalizeTitleTemplate(storedTemplate), fallback.titleTemplate),
    defaultDescription: savedString(input.defaultDescription, fallback.defaultDescription, 320),
    defaultOpenGraphTitle: savedString(input.defaultOpenGraphTitle, fallback.defaultOpenGraphTitle, 140),
    defaultOpenGraphDescription: savedString(input.defaultOpenGraphDescription, fallback.defaultOpenGraphDescription, 320),
    defaultOpenGraphImage: safely(() => normalizeOptionalPublicImage(storedImage), fallback.defaultOpenGraphImage),
    googleSiteVerification: safely(() => normalizeOptionalVerification(storedVerification), fallback.googleSiteVerification),
    indexingEnabled: savedBoolean(input.indexingEnabled, fallback.indexingEnabled),
    researchVendorIndexingEnabled: savedBoolean(input.researchVendorIndexingEnabled, fallback.researchVendorIndexingEnabled),
    researchVendorMinimumScore: savedScore(input.researchVendorMinimumScore, fallback.researchVendorMinimumScore),
    publicMediaCrawlEnabled: savedBoolean(input.publicMediaCrawlEnabled, fallback.publicMediaCrawlEnabled),
    sitemap: {
      staticPages: savedBoolean(sitemap.staticPages, fallback.sitemap.staticPages),
      categories: savedBoolean(sitemap.categories, fallback.sitemap.categories),
      products: savedBoolean(sitemap.products, fallback.sitemap.products),
      partnerVendors: savedBoolean(sitemap.partnerVendors, fallback.sitemap.partnerVendors),
      researchVendors: savedBoolean(sitemap.researchVendors, fallback.sitemap.researchVendors)
    }
  };
}

function safely<T>(operation: () => T, fallback: T): T {
  try {
    return operation();
  } catch {
    return fallback;
  }
}

function requiredText(value: unknown, label: string, minimum: number, maximum: number): string {
  const result = String(value ?? "").trim();
  if (result.length < minimum) throw new Error(`${label} must contain at least ${minimum} characters.`);
  if (result.length > maximum) throw new Error(`${label} must contain at most ${maximum} characters.`);
  if (/[<>]/.test(result)) throw new Error(`${label} cannot contain HTML brackets.`);
  return result;
}

function normalizeTitleTemplate(value: string): string {
  const result = requiredText(value, "Title template", 4, 140);
  if ((result.match(/%s/g) ?? []).length !== 1) throw new Error("Title template must contain exactly one %s placeholder.");
  return result;
}

function normalizeCanonicalOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Canonical origin must be a valid absolute URL.");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Canonical origin must contain only protocol and host, without credentials, path, query or fragment.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("Canonical origin must use HTTPS.");
  return url.origin;
}

function normalizeOptionalPublicImage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Default Open Graph image must be a /relative path or an absolute HTTPS URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Default Open Graph image must use HTTPS.");
  return url.toString();
}

function normalizeOptionalVerification(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!/^[A-Za-z0-9._=:+\/-]+$/.test(value)) throw new Error("Google verification value contains unsupported characters.");
  return value;
}

export function validateSeoGlobalSettingsInput(value: unknown): SeoGlobalSettings {
  const input = object(value);
  const sitemap = object(input.sitemap);
  const score = Number(input.researchVendorMinimumScore);
  if (!Number.isSafeInteger(score) || score < 3 || score > 7) throw new Error("Research-vendor quality threshold must be between 3 and 7.");
  const boolean = (field: unknown, label: string) => {
    if (typeof field !== "boolean") throw new Error(`${label} must be boolean.`);
    return field;
  };
  return {
    canonicalOrigin: normalizeCanonicalOrigin(requiredText(input.canonicalOrigin, "Canonical origin", 8, 300)),
    siteName: requiredText(input.siteName, "Site name", 2, 80),
    defaultTitle: requiredText(input.defaultTitle, "Default title", 10, 140),
    titleTemplate: normalizeTitleTemplate(String(input.titleTemplate ?? "")),
    defaultDescription: requiredText(input.defaultDescription, "Default description", 40, 320),
    defaultOpenGraphTitle: requiredText(input.defaultOpenGraphTitle, "Default Open Graph title", 2, 140),
    defaultOpenGraphDescription: requiredText(input.defaultOpenGraphDescription, "Default Open Graph description", 20, 320),
    defaultOpenGraphImage: normalizeOptionalPublicImage(savedOptionalString(input.defaultOpenGraphImage, 1000)),
    googleSiteVerification: normalizeOptionalVerification(savedOptionalString(input.googleSiteVerification, 255)),
    indexingEnabled: boolean(input.indexingEnabled, "Indexing master switch"),
    researchVendorIndexingEnabled: boolean(input.researchVendorIndexingEnabled, "Research-vendor indexing switch"),
    researchVendorMinimumScore: score,
    publicMediaCrawlEnabled: boolean(input.publicMediaCrawlEnabled, "Public-media crawler switch"),
    sitemap: {
      staticPages: boolean(sitemap.staticPages, "Static-page sitemap switch"),
      categories: boolean(sitemap.categories, "Category sitemap switch"),
      products: boolean(sitemap.products, "Product sitemap switch"),
      partnerVendors: boolean(sitemap.partnerVendors, "Partner-vendor sitemap switch"),
      researchVendors: boolean(sitemap.researchVendors, "Research-vendor sitemap switch")
    }
  };
}

async function readSeoGlobalSettingsSnapshot(): Promise<SeoSettingsSnapshot> {
  const fallback = defaultSeoGlobalSettings();
  if (!productionDatabaseConfigured()) {
    return { settings: fallback, version: 0, source: "defaults", persistenceAvailable: false };
  }
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<SettingsRow>(
      `SELECT s.value,s.version,s.updated_at,u.public_id AS updated_by_public_id
       FROM system_settings s
       JOIN markets m ON m.id=s.market_id
       LEFT JOIN users u ON u.id=s.updated_by
       WHERE m.code=$1 AND s.key=$2
       LIMIT 1`,
      [marketCode(), SEO_GLOBAL_SETTINGS_KEY]
    );
    const row = result.rows[0];
    if (!row || row.version == null) return { settings: fallback, version: 0, source: "defaults", persistenceAvailable: true };
    const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date(Number.NaN);
    return {
      settings: normalizeStoredSeoGlobalSettings(row.value, fallback),
      version: Number(row.version),
      source: "database",
      persistenceAvailable: true,
      updatedAt: Number.isNaN(updatedAt.getTime()) ? undefined : updatedAt.toISOString(),
      updatedBy: row.updated_by_public_id
    };
  } catch {
    return { settings: fallback, version: 0, source: "defaults", persistenceAvailable: false };
  }
}

// React cache deduplicates the root metadata/page/sitemap reads inside one render
// without turning this operational setting into a process-global stale singleton.
export const getSeoGlobalSettingsSnapshot = cache(readSeoGlobalSettingsSnapshot);

function flattenSettings(value: SeoGlobalSettings): Record<string, unknown> {
  return {
    canonicalOrigin: value.canonicalOrigin,
    siteName: value.siteName,
    defaultTitle: value.defaultTitle,
    titleTemplate: value.titleTemplate,
    defaultDescription: value.defaultDescription,
    defaultOpenGraphTitle: value.defaultOpenGraphTitle,
    defaultOpenGraphDescription: value.defaultOpenGraphDescription,
    defaultOpenGraphImage: value.defaultOpenGraphImage,
    googleSiteVerification: value.googleSiteVerification,
    indexingEnabled: value.indexingEnabled,
    researchVendorIndexingEnabled: value.researchVendorIndexingEnabled,
    researchVendorMinimumScore: value.researchVendorMinimumScore,
    publicMediaCrawlEnabled: value.publicMediaCrawlEnabled,
    "sitemap.staticPages": value.sitemap.staticPages,
    "sitemap.categories": value.sitemap.categories,
    "sitemap.products": value.sitemap.products,
    "sitemap.partnerVendors": value.sitemap.partnerVendors,
    "sitemap.researchVendors": value.sitemap.researchVendors
  };
}

function changedSettingKeys(before: SeoGlobalSettings, after: SeoGlobalSettings): readonly string[] {
  const left = flattenSettings(before);
  const right = flattenSettings(after);
  return Object.keys(right).filter((key) => left[key] !== right[key]);
}

export async function updateSeoGlobalSettings(input: {
  principal: SessionPrincipal;
  settings: unknown;
  expectedVersion: number;
  reason: string;
  emergencyConfirmation?: string;
}): Promise<SeoSettingsSnapshot> {
  assertAdminPermission(input.principal, "content.write");
  if (!productionDatabaseConfigured()) throw new Error("SEO settings persistence requires PostgreSQL runtime.");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("SEO settings version is invalid.");
  const reason = requiredText(input.reason, "Change reason", 10, 500);
  const settings = validateSeoGlobalSettingsInput(input.settings);
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${marketCode()}:${SEO_GLOBAL_SETTINGS_KEY}`]);
    const state = await client.query<SettingsRow & { market_id: string }>(
      `SELECT m.id::text AS market_id,s.value,s.version,s.updated_at
       FROM markets m
       LEFT JOIN system_settings s ON s.market_id=m.id AND s.key=$2
       WHERE m.code=$1
       LIMIT 1`,
      [marketCode(), SEO_GLOBAL_SETTINGS_KEY]
    );
    const row = state.rows[0];
    if (!row) throw new Error("SEO settings market was not found.");
    const currentVersion = row.version == null ? 0 : Number(row.version);
    if (currentVersion !== input.expectedVersion) throw new Error("SEO settings changed in another session. Refresh and review the latest version before saving.");
    const before = normalizeStoredSeoGlobalSettings(row.value, defaultSeoGlobalSettings());
    const changedKeys = changedSettingKeys(before, settings);
    if (changedKeys.length === 0) throw new Error("No SEO setting changed.");
    if (before.indexingEnabled && !settings.indexingEnabled && input.emergencyConfirmation !== "NOINDEX WHOLE SITE") {
      throw new Error("Disabling site-wide indexing requires confirmation: NOINDEX WHOLE SITE");
    }
    const actor = await client.query<{ id: string }>(
      "SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1",
      [input.principal.userId]
    );
    const actorUuid = actor.rows[0]?.id;
    if (!actorUuid) throw new Error("Admin actor was not found.");
    const saved = await client.query<{ version: number; updated_at: Date | string }>(
      `INSERT INTO system_settings(market_id,key,value,version,updated_by,updated_at)
       VALUES($1::uuid,$2,$3::jsonb,1,$4::uuid,clock_timestamp())
       ON CONFLICT (market_id,key) DO UPDATE
       SET value=EXCLUDED.value,version=system_settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()
       RETURNING version,updated_at`,
      [row.market_id, SEO_GLOBAL_SETTINGS_KEY, JSON.stringify(settings), actorUuid]
    );
    const auditId = `audit_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,before_state,after_state,created_at)
       VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,'seo.settings_updated',$7,$8,$9,$10::jsonb,$11::jsonb,clock_timestamp())`,
      [randomUUID(), auditId, row.market_id, actorUuid, input.principal.userId, input.principal.roles[0] ?? null, SEO_SETTINGS_AUDIT_ENTITY, SEO_GLOBAL_SETTINGS_KEY, reason, JSON.stringify(before), JSON.stringify(settings)]
    );
    await client.query("COMMIT");
    const savedRow = saved.rows[0];
    const updatedAt = new Date(savedRow?.updated_at ?? Date.now());
    return {
      settings,
      version: Number(savedRow?.version ?? currentVersion + 1),
      source: "database",
      persistenceAvailable: true,
      updatedAt: updatedAt.toISOString(),
      updatedBy: input.principal.userId
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getSeoSettingsAuditHistory(limit = 20): Promise<readonly SeoSettingsAuditEntry[]> {
  if (!productionDatabaseConfigured()) return [];
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<{
      public_id: string;
      actor_public_id: string;
      actor_role?: string;
      reason?: string;
      before_state?: unknown;
      after_state?: unknown;
      created_at: Date | string;
    }>(
      `SELECT public_id,actor_public_id,actor_role,reason,before_state,after_state,created_at
       FROM audit_events
       WHERE entity_type=$1 AND entity_id=$2 AND action='seo.settings_updated'
       ORDER BY created_at DESC
       LIMIT $3`,
      [SEO_SETTINGS_AUDIT_ENTITY, SEO_GLOBAL_SETTINGS_KEY, safeLimit]
    );
    return result.rows.map((row) => {
      const before = normalizeStoredSeoGlobalSettings(row.before_state, defaultSeoGlobalSettings());
      const after = normalizeStoredSeoGlobalSettings(row.after_state, before);
      const createdAt = new Date(row.created_at);
      return {
        id: row.public_id,
        actorId: row.actor_public_id,
        actorRole: row.actor_role,
        reason: row.reason,
        changedKeys: changedSettingKeys(before, after),
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date(0).toISOString() : createdAt.toISOString()
      };
    });
  } catch {
    return [];
  }
}
