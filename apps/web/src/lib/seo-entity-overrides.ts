import "server-only";

import { randomUUID } from "node:crypto";
import { cache } from "react";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { seoVisibilityForPath } from "./seo-visibility-policy";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";
import {
  SEO_ENTITY_KINDS,
  isSeoEntityKind,
  routeForSeoEntity,
  seoEntityKey,
  type SeoEntityKind,
  type SeoEntityOverride,
  type SeoEntityReference,
  type SeoOverrideDecision,
  type SeoQualityStatus
} from "./seo-entity-policy";

export const SEO_ENTITY_OVERRIDES_KEY = "seo.visibility.entities.v1";
export const SEO_ENTITY_OVERRIDE_AUDIT_ENTITY = "seo_entity_override";

export type SeoEntityOverridesSnapshot = Readonly<{
  entries: readonly SeoEntityOverride[];
  version: number;
  source: "database" | "defaults";
  persistenceAvailable: boolean;
  updatedAt?: string;
  updatedBy?: string;
}>;

export type SeoEntityOverrideAuditEntry = Readonly<{
  id: string;
  action: "upserted" | "deleted";
  entityKey: string;
  actorId: string;
  actorRole?: string;
  reason?: string;
  changedKeys: readonly string[];
  createdAt: string;
}>;

export type SeoEntityOverrideDraft = SeoEntityReference & Readonly<{
  indexDecision: SeoOverrideDecision;
  sitemapDecision: SeoOverrideDecision;
  schemaDecision: SeoOverrideDecision;
  title?: string;
  description?: string;
  canonicalPath?: string;
  openGraphTitle?: string;
  openGraphDescription?: string;
  openGraphImage?: string;
  keywords: readonly string[];
  editorialLabel?: string;
  qualityStatus: SeoQualityStatus;
}>;

type SettingsRow = Readonly<{
  value: unknown | null;
  version: number | null;
  updated_at: Date | string | null;
  updated_by_public_id?: string;
}>;

const DECISIONS: readonly SeoOverrideDecision[] = ["inherit", "allow", "deny"];
const QUALITY_STATES: readonly SeoQualityStatus[] = ["unreviewed", "approved", "needs_work", "suppressed"];

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requiredText(value: unknown, label: string, minimum: number, maximum: number): string {
  const result = String(value ?? "").trim();
  if (result.length < minimum) throw new Error(`${label} must contain at least ${minimum} characters.`);
  if (result.length > maximum) throw new Error(`${label} must contain at most ${maximum} characters.`);
  if (/[<>]/.test(result)) throw new Error(`${label} cannot contain HTML brackets.`);
  return result;
}

function optionalText(value: unknown, label: string, maximum: number, minimum = 1): string | undefined {
  const result = typeof value === "string" ? value.trim() : "";
  return result ? requiredText(result, label, minimum, maximum) : undefined;
}

function decision(value: unknown, label: string): SeoOverrideDecision {
  if (typeof value !== "string" || !DECISIONS.includes(value as SeoOverrideDecision)) throw new Error(`${label} is invalid.`);
  return value as SeoOverrideDecision;
}

function qualityStatus(value: unknown): SeoQualityStatus {
  if (typeof value !== "string" || !QUALITY_STATES.includes(value as SeoQualityStatus)) throw new Error("Quality status is invalid.");
  return value as SeoQualityStatus;
}

function entityId(kind: SeoEntityKind, value: unknown): string {
  const id = String(value ?? "").trim();
  if (kind === "static") {
    if (!/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(id)) throw new Error("Static-page route is invalid.");
    return id;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(id)) throw new Error("SEO entity identifier is invalid.");
  return id;
}

function publicImage(value: unknown, label: string): string | undefined {
  const result = optionalText(value, label, 1000);
  if (!result) return undefined;
  if (result.startsWith("/") && !result.startsWith("//")) return result;
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new Error(`${label} must be a /relative path or an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(`${label} must use HTTPS.`);
  return url.toString();
}

function canonicalPath(value: unknown, canonicalOrigin: string): string | undefined {
  const result = optionalText(value, "Canonical override", 1000);
  if (!result) return undefined;
  let url: URL;
  try {
    url = new URL(result, `${canonicalOrigin}/`);
  } catch {
    throw new Error("Canonical override must be a valid public URL or /relative path.");
  }
  if (url.origin !== canonicalOrigin || url.username || url.password || url.search || url.hash) {
    throw new Error("Canonical override must stay on the governed origin and cannot contain credentials, query parameters or fragments.");
  }
  if (seoVisibilityForPath(url.pathname).visibility !== "PUBLIC_INDEXABLE") {
    throw new Error("Canonical override must target a public indexable route.");
  }
  return url.pathname;
}

function keywords(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((entry) => optionalText(entry, "Internal-search keyword", 80, 2)).filter((entry): entry is string => Boolean(entry));
  const unique = [...new Set(normalized.map((entry) => entry.toLocaleLowerCase("el")))];
  if (unique.length > 20) throw new Error("At most 20 internal-search keywords are allowed.");
  return unique;
}

function normalizeDraft(value: unknown, canonicalOrigin: string): SeoEntityOverrideDraft {
  const input = object(value);
  if (!isSeoEntityKind(input.kind)) throw new Error("SEO entity kind is invalid.");
  return {
    kind: input.kind,
    id: entityId(input.kind, input.id),
    indexDecision: decision(input.indexDecision, "Index decision"),
    sitemapDecision: decision(input.sitemapDecision, "Sitemap decision"),
    schemaDecision: decision(input.schemaDecision, "Schema decision"),
    title: optionalText(input.title, "SEO title", 140, 2),
    description: optionalText(input.description, "Meta description", 320, 20),
    canonicalPath: canonicalPath(input.canonicalPath, canonicalOrigin),
    openGraphTitle: optionalText(input.openGraphTitle, "Open Graph title", 140, 2),
    openGraphDescription: optionalText(input.openGraphDescription, "Open Graph description", 320, 20),
    openGraphImage: publicImage(input.openGraphImage, "Open Graph image"),
    keywords: keywords(input.keywords),
    editorialLabel: optionalText(input.editorialLabel, "Editorial label", 120, 2),
    qualityStatus: qualityStatus(input.qualityStatus)
  };
}

function safelyNormalizeStored(value: unknown, canonicalOrigin: string): SeoEntityOverride | undefined {
  try {
    const input = object(value);
    const draft = normalizeDraft(input, canonicalOrigin);
    const reviewed = new Date(String(input.lastReviewedAt ?? ""));
    const reviewedBy = optionalText(input.reviewedBy, "Reviewer", 200, 1);
    if (Number.isNaN(reviewed.getTime()) || !reviewedBy) return undefined;
    return { ...draft, lastReviewedAt: reviewed.toISOString(), reviewedBy };
  } catch {
    return undefined;
  }
}

function normalizeRegistry(value: unknown, canonicalOrigin: string): readonly SeoEntityOverride[] {
  const storedEntries = object(value).entries;
  if (!Array.isArray(storedEntries)) return [];
  const deduplicated = new Map<string, SeoEntityOverride>();
  for (const value of storedEntries) {
    const entry = safelyNormalizeStored(value, canonicalOrigin);
    if (entry) deduplicated.set(seoEntityKey(entry), entry);
  }
  return [...deduplicated.values()].sort((left, right) => seoEntityKey(left).localeCompare(seoEntityKey(right)));
}

async function readSeoEntityOverridesSnapshot(): Promise<SeoEntityOverridesSnapshot> {
  const { settings } = await getSeoGlobalSettingsSnapshot();
  if (!productionDatabaseConfigured()) return { entries: [], version: 0, source: "defaults", persistenceAvailable: false };
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<SettingsRow>(
      `SELECT s.value,s.version,s.updated_at,u.public_id AS updated_by_public_id
       FROM system_settings s
       JOIN markets m ON m.id=s.market_id
       LEFT JOIN users u ON u.id=s.updated_by
       WHERE m.code=$1 AND s.key=$2
       LIMIT 1`,
      [marketCode(), SEO_ENTITY_OVERRIDES_KEY]
    );
    const row = result.rows[0];
    if (!row || row.version == null) return { entries: [], version: 0, source: "defaults", persistenceAvailable: true };
    const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date(Number.NaN);
    return {
      entries: normalizeRegistry(row.value, settings.canonicalOrigin),
      version: Number(row.version),
      source: "database",
      persistenceAvailable: true,
      updatedAt: Number.isNaN(updatedAt.getTime()) ? undefined : updatedAt.toISOString(),
      updatedBy: row.updated_by_public_id
    };
  } catch {
    return { entries: [], version: 0, source: "defaults", persistenceAvailable: false };
  }
}

export const getSeoEntityOverridesSnapshot = cache(readSeoEntityOverridesSnapshot);

function editableState(value: SeoEntityOverride | SeoEntityOverrideDraft | undefined): Record<string, unknown> | null {
  if (!value) return null;
  return {
    kind: value.kind,
    id: value.id,
    indexDecision: value.indexDecision,
    sitemapDecision: value.sitemapDecision,
    schemaDecision: value.schemaDecision,
    title: value.title,
    description: value.description,
    canonicalPath: value.canonicalPath,
    openGraphTitle: value.openGraphTitle,
    openGraphDescription: value.openGraphDescription,
    openGraphImage: value.openGraphImage,
    keywords: value.keywords,
    editorialLabel: value.editorialLabel,
    qualityStatus: value.qualityStatus
  };
}

function changedKeys(before: SeoEntityOverride | undefined, after: SeoEntityOverride | undefined): readonly string[] {
  const left = editableState(before) ?? {};
  const right = editableState(after) ?? {};
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
}

export async function updateSeoEntityOverride(input: {
  principal: SessionPrincipal;
  draft: unknown;
  expectedVersion: number;
  reason: string;
  delete?: boolean;
}): Promise<SeoEntityOverridesSnapshot> {
  assertAdminPermission(input.principal, "content.write");
  if (!productionDatabaseConfigured()) throw new Error("SEO entity persistence requires PostgreSQL runtime.");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new Error("SEO entity registry version is invalid.");
  const reason = requiredText(input.reason, "Change reason", 10, 500);
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const draft = normalizeDraft(input.draft, settings.canonicalOrigin);
  const reference: SeoEntityReference = { kind: draft.kind, id: draft.id };
  const key = seoEntityKey(reference);
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${marketCode()}:${SEO_ENTITY_OVERRIDES_KEY}`]);
    const state = await client.query<SettingsRow & { market_id: string }>(
      `SELECT m.id::text AS market_id,s.value,s.version,s.updated_at
       FROM markets m
       LEFT JOIN system_settings s ON s.market_id=m.id AND s.key=$2
       WHERE m.code=$1
       LIMIT 1`,
      [marketCode(), SEO_ENTITY_OVERRIDES_KEY]
    );
    const row = state.rows[0];
    if (!row) throw new Error("SEO entity registry market was not found.");
    const currentVersion = row.version == null ? 0 : Number(row.version);
    if (currentVersion !== input.expectedVersion) throw new Error("SEO entity registry changed in another session. Refresh and review the latest version before saving.");
    const entries = normalizeRegistry(row.value, settings.canonicalOrigin);
    const byKey = new Map(entries.map((entry) => [seoEntityKey(entry), entry]));
    const before = byKey.get(key);
    let after: SeoEntityOverride | undefined;
    let action: "seo.entity_override_upserted" | "seo.entity_override_deleted";
    if (input.delete) {
      if (!before) throw new Error("This entity has no override to delete.");
      byKey.delete(key);
      action = "seo.entity_override_deleted";
    } else {
      if (JSON.stringify(editableState(before)) === JSON.stringify(editableState(draft))) throw new Error("No SEO entity field changed.");
      after = { ...draft, lastReviewedAt: new Date().toISOString(), reviewedBy: input.principal.userId };
      byKey.set(key, after);
      action = "seo.entity_override_upserted";
    }
    const actor = await client.query<{ id: string }>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [input.principal.userId]);
    const actorUuid = actor.rows[0]?.id;
    if (!actorUuid) throw new Error("Admin actor was not found.");
    const nextEntries = [...byKey.values()].sort((left, right) => seoEntityKey(left).localeCompare(seoEntityKey(right)));
    const saved = await client.query<{ version: number; updated_at: Date | string }>(
      `INSERT INTO system_settings(market_id,key,value,version,updated_by,updated_at)
       VALUES($1::uuid,$2,$3::jsonb,1,$4::uuid,clock_timestamp())
       ON CONFLICT (market_id,key) DO UPDATE
       SET value=EXCLUDED.value,version=system_settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()
       RETURNING version,updated_at`,
      [row.market_id, SEO_ENTITY_OVERRIDES_KEY, JSON.stringify({ entries: nextEntries }), actorUuid]
    );
    const auditId = `audit_${randomUUID().replaceAll("-", "")}`;
    await client.query(
      `INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,before_state,after_state,created_at)
       VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,clock_timestamp())`,
      [randomUUID(), auditId, row.market_id, actorUuid, input.principal.userId, input.principal.roles[0] ?? null, action, SEO_ENTITY_OVERRIDE_AUDIT_ENTITY, key, reason, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
    );
    await client.query("COMMIT");
    const savedRow = saved.rows[0];
    return {
      entries: nextEntries,
      version: Number(savedRow?.version ?? currentVersion + 1),
      source: "database",
      persistenceAvailable: true,
      updatedAt: new Date(savedRow?.updated_at ?? Date.now()).toISOString(),
      updatedBy: input.principal.userId
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getSeoEntityOverrideAuditHistory(limit = 40): Promise<readonly SeoEntityOverrideAuditEntry[]> {
  if (!productionDatabaseConfigured()) return [];
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<{
      public_id: string;
      action: string;
      entity_id: string;
      actor_public_id: string;
      actor_role?: string;
      reason?: string;
      before_state?: unknown;
      after_state?: unknown;
      created_at: Date | string;
    }>(
      `SELECT public_id,action,entity_id,actor_public_id,actor_role,reason,before_state,after_state,created_at
       FROM audit_events
       WHERE entity_type=$1 AND action IN ('seo.entity_override_upserted','seo.entity_override_deleted')
       ORDER BY created_at DESC
       LIMIT $2`,
      [SEO_ENTITY_OVERRIDE_AUDIT_ENTITY, safeLimit]
    );
    const { settings } = await getSeoGlobalSettingsSnapshot();
    return result.rows.map((row) => {
      const before = safelyNormalizeStored(row.before_state, settings.canonicalOrigin);
      const after = safelyNormalizeStored(row.after_state, settings.canonicalOrigin);
      const createdAt = new Date(row.created_at);
      return {
        id: row.public_id,
        action: row.action === "seo.entity_override_deleted" ? "deleted" : "upserted",
        entityKey: row.entity_id,
        actorId: row.actor_public_id,
        actorRole: row.actor_role,
        reason: row.reason,
        changedKeys: changedKeys(before, after),
        createdAt: Number.isNaN(createdAt.getTime()) ? new Date(0).toISOString() : createdAt.toISOString()
      };
    });
  } catch {
    return [];
  }
}

export function seoEntityKindOptions(): readonly SeoEntityKind[] {
  return SEO_ENTITY_KINDS;
}

export function expectedRouteForSeoEntity(reference: SeoEntityReference): string {
  return routeForSeoEntity(reference);
}
