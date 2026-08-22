import "server-only";

import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  id,
  type ContentBlock,
  type ContentLocale,
  type ContentPageType,
  type ContentTranslation,
  type SessionPrincipal,
  type SqlExecutor,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled, recordAdminAudit } from "./admin-runtime";
import { getAdminGovernanceRuntime } from "./admin-governance-memory";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const CONTENT_PAGE_TYPES = new Set<ContentPageType>(["home", "standard", "landing", "legal", "local_landing"]);
const CONTENT_BLOCK_TYPES = new Set([
  "hero", "rich_text", "category_grid", "product_collection", "merchant_spotlight", "shop_story",
  "advice_cta", "ask_local_cta", "local_impact", "faq", "trust"
]);

type TranslationDraft = Readonly<{
  locale: ContentLocale;
  title: string;
  seoTitle: string;
  seoDescription: string;
  noindex: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  blocks: readonly ContentBlock[];
}>;

export type AdminContentEditorWorkspace = Readonly<{
  csrfToken: string;
  page: Readonly<{
    id: string;
    slug: string;
    pageType: ContentPageType;
    status: string;
    version: number;
    scheduledAt?: number;
    publishedAt?: number;
    createdAt: number;
    updatedAt: number;
    translations: Readonly<Partial<Record<ContentLocale, TranslationDraft>>>;
  }>;
  revisions: readonly Readonly<{
    id: string;
    version: number;
    actorId: string;
    reason: string;
    snapshot: unknown;
    createdAt: number;
  }>[];
}>;

export type AdminContentUpdateInput = Readonly<{
  pageId: string;
  pageType: ContentPageType;
  reason: string;
  translations: readonly TranslationDraft[];
}>;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function epoch(value: unknown, label: string): number {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function integer(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function validateBlocks(value: unknown): readonly ContentBlock[] {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { throw new Error("Content blocks must be valid JSON"); } })() : value;
  if (!Array.isArray(parsed)) throw new Error("Content blocks must be a JSON array");
  const ids = new Set<string>();
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Content block ${index + 1} must be an object`);
    const record = item as Record<string, unknown>;
    const blockId = text(record.id, `Content block ${index + 1} id`);
    const type = text(record.type, `Content block ${index + 1} type`);
    if (ids.has(blockId)) throw new Error("Content block IDs must be unique");
    ids.add(blockId);
    if (!CONTENT_BLOCK_TYPES.has(type)) throw new Error(`Unsupported content block type: ${type}`);
    if (!record.data || typeof record.data !== "object" || Array.isArray(record.data)) throw new Error(`Content block ${index + 1} data must be an object`);
    return { id: blockId, type: type as ContentBlock["type"], data: record.data as Readonly<Record<string, unknown>> };
  });
}

function validateTranslation(input: TranslationDraft): TranslationDraft {
  if (input.locale !== "el" && input.locale !== "en") throw new Error("Unsupported content locale");
  const title = text(input.title, `${input.locale.toUpperCase()} title`);
  const seoTitle = text(input.seoTitle, `${input.locale.toUpperCase()} SEO title`);
  const seoDescription = text(input.seoDescription, `${input.locale.toUpperCase()} SEO description`);
  if (seoTitle.length > 120) throw new Error(`${input.locale.toUpperCase()} SEO title must be at most 120 characters`);
  if (seoDescription.length > 320) throw new Error(`${input.locale.toUpperCase()} SEO description must be at most 320 characters`);
  const ogImage = optionalText(input.ogImage);
  if (ogImage && !ogImage.startsWith("/") && !/^https:\/\//i.test(ogImage)) throw new Error("Open Graph image must be an internal path or HTTPS URL");
  return {
    locale: input.locale,
    title,
    seoTitle,
    seoDescription,
    noindex: Boolean(input.noindex),
    ogTitle: optionalText(input.ogTitle),
    ogDescription: optionalText(input.ogDescription),
    ogImage,
    blocks: validateBlocks(input.blocks)
  };
}

function toCoreTranslation(input: TranslationDraft): ContentTranslation {
  return {
    locale: input.locale,
    title: input.title,
    seo: {
      title: input.seoTitle,
      description: input.seoDescription,
      noindex: input.noindex,
      ogTitle: input.ogTitle,
      ogDescription: input.ogDescription,
      ogImage: input.ogImage
    },
    blocks: input.blocks
  };
}

async function userUuid(tx: SqlExecutor, publicId: string): Promise<string> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1`, [publicId]);
  if (!result.rowCount) throw new Error(`Platform user ${publicId} not found`);
  return text(result.rows[0].id, "user.id");
}

function postgresUow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
}

export async function adminContentEditorWorkspace(principal: SessionPrincipal, pageId: string): Promise<AdminContentEditorWorkspace> {
  assertAdminPermission(principal, "content.read");
  if (!postgresAdminRuntimeEnabled()) {
    const content = getAdminGovernanceRuntime().content;
    const page = content.page(pageId);
    if (!page) throw new Error("CMS page not found");
    const translations: Partial<Record<ContentLocale, TranslationDraft>> = {};
    for (const locale of ["el", "en"] as const) {
      const translation = page.translations[locale];
      if (!translation) continue;
      translations[locale] = {
        locale,
        title: translation.title,
        seoTitle: translation.seo.title,
        seoDescription: translation.seo.description,
        noindex: Boolean(translation.seo.noindex),
        ogTitle: translation.seo.ogTitle,
        ogDescription: translation.seo.ogDescription,
        ogImage: translation.seo.ogImage,
        blocks: translation.blocks
      };
    }
    return {
      csrfToken: principal.csrfToken,
      page: { id: page.id, slug: page.slug, pageType: page.pageType, status: page.status, version: page.version, scheduledAt: page.scheduledAt, publishedAt: page.publishedAt, createdAt: page.createdAt, updatedAt: page.updatedAt, translations },
      revisions: content.revisions(page.id).map((revision) => ({ id: revision.id, version: revision.version, actorId: revision.actorId, reason: revision.reason, snapshot: revision.snapshot, createdAt: revision.createdAt })).sort((a, b) => b.version - a.version)
    };
  }

  return postgresUow().withTransaction(platformScope(principal.userId), async (tx) => {
    const rows = await tx.query<SqlRow>(`
      SELECT p.id::text AS page_uuid,p.public_id,p.slug,p.page_type,p.status,p.version,p.scheduled_at,p.published_at,p.created_at,p.updated_at,
             t.locale,t.title,t.seo_title,t.seo_description,t.noindex,t.og_title,t.og_description,t.og_image,t.translated_blocks
      FROM cms_pages p
      LEFT JOIN cms_page_translations t ON t.page_id=p.id
      WHERE p.public_id=$1 OR p.id::text=$1
      ORDER BY t.locale`, [pageId]);
    if (!rows.rowCount) throw new Error("CMS page not found");
    const first = rows.rows[0];
    const translations: Partial<Record<ContentLocale, TranslationDraft>> = {};
    for (const row of rows.rows) {
      if (row.locale !== "el" && row.locale !== "en") continue;
      const blocks = validateBlocks(parseJsonObject(row.translated_blocks ?? []));
      translations[row.locale] = {
        locale: row.locale,
        title: text(row.title, "translation.title"),
        seoTitle: optionalText(row.seo_title) ?? text(row.title, "translation.title"),
        seoDescription: optionalText(row.seo_description) ?? "",
        noindex: Boolean(row.noindex),
        ogTitle: optionalText(row.og_title),
        ogDescription: optionalText(row.og_description),
        ogImage: optionalText(row.og_image),
        blocks
      };
    }
    const revisions = await tx.query<SqlRow>(`SELECT public_id,version,actor_public_id,reason,snapshot,created_at FROM cms_page_revisions WHERE page_id=$1 ORDER BY version DESC LIMIT 100`, [text(first.page_uuid, "page_uuid")]);
    const pageType = text(first.page_type, "page.page_type") as ContentPageType;
    if (!CONTENT_PAGE_TYPES.has(pageType)) throw new Error(`Unsupported content page type: ${pageType}`);
    return {
      csrfToken: principal.csrfToken,
      page: {
        id: text(first.public_id, "page.public_id"),
        slug: text(first.slug, "page.slug"),
        pageType,
        status: text(first.status, "page.status"),
        version: integer(first.version, "page.version"),
        scheduledAt: first.scheduled_at ? epoch(first.scheduled_at, "page.scheduled_at") : undefined,
        publishedAt: first.published_at ? epoch(first.published_at, "page.published_at") : undefined,
        createdAt: epoch(first.created_at, "page.created_at"),
        updatedAt: epoch(first.updated_at, "page.updated_at"),
        translations
      },
      revisions: revisions.rows.map((row) => ({
        id: text(row.public_id, "revision.public_id"),
        version: integer(row.version, "revision.version"),
        actorId: text(row.actor_public_id, "revision.actor_public_id"),
        reason: text(row.reason, "revision.reason"),
        snapshot: parseJsonObject(row.snapshot),
        createdAt: epoch(row.created_at, "revision.created_at")
      }))
    };
  }, { readOnly: true });
}

export async function adminUpdateContentPage(principal: SessionPrincipal, input: AdminContentUpdateInput) {
  assertAdminPermission(principal, "content.write");
  if (!CONTENT_PAGE_TYPES.has(input.pageType)) throw new Error("Unsupported content page type");
  const reason = text(input.reason, "Edit reason");
  if (reason.length < 3) throw new Error("Edit reason must be meaningful");
  const translations = input.translations.map(validateTranslation);
  if (!translations.some((translation) => translation.locale === "el")) throw new Error("Greek content is required");
  if (new Set(translations.map((translation) => translation.locale)).size !== translations.length) throw new Error("Each locale may appear only once");
  const now = Date.now();

  if (!postgresAdminRuntimeEnabled()) {
    const content = getAdminGovernanceRuntime().content;
    const result = content.updatePage({ pageId: input.pageId, pageType: input.pageType, translations: translations.map(toCoreTranslation), actorId: principal.userId, reason, now });
    await recordAdminAudit(principal, "content.page_updated", "cms_page", result.id, reason, { version: result.version, pageType: result.pageType, locales: Object.keys(result.translations) });
    return { id: result.id, status: result.status, version: result.version };
  }

  const result = await postgresUow().withTransaction(platformScope(principal.userId), async (tx) => {
    const actor = await userUuid(tx, principal.userId);
    const found = await tx.query<SqlRow>(`SELECT id::text AS page_uuid,public_id,slug,status,version FROM cms_pages WHERE public_id=$1 OR id::text=$1 FOR UPDATE`, [input.pageId]);
    if (!found.rowCount) throw new Error("CMS page not found");
    const row = found.rows[0];
    if (text(row.status, "page.status") === "archived") throw new Error("Archived pages must be restored before editing");
    const version = integer(row.version, "page.version") + 1;
    const greek = translations.find((translation) => translation.locale === "el")!;
    await tx.query(`UPDATE cms_pages SET page_type=$2,blocks=$3::jsonb,version=$4,updated_by=$5,updated_at=$6 WHERE id=$1`, [text(row.page_uuid, "page_uuid"), input.pageType, JSON.stringify(greek.blocks), version, actor, new Date(now)]);
    for (const translation of translations) {
      await tx.query(`
        INSERT INTO cms_page_translations(page_id,locale,title,seo_title,seo_description,translated_blocks,noindex,og_title,og_description,og_image)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
        ON CONFLICT(page_id,locale) DO UPDATE SET title=EXCLUDED.title,seo_title=EXCLUDED.seo_title,seo_description=EXCLUDED.seo_description,
          translated_blocks=EXCLUDED.translated_blocks,noindex=EXCLUDED.noindex,og_title=EXCLUDED.og_title,og_description=EXCLUDED.og_description,og_image=EXCLUDED.og_image`,
        [text(row.page_uuid, "page_uuid"), translation.locale, translation.title, translation.seoTitle, translation.seoDescription, JSON.stringify(translation.blocks), translation.noindex, translation.ogTitle ?? null, translation.ogDescription ?? null, translation.ogImage ?? null]
      );
    }
    const snapshot = {
      id: text(row.public_id, "page.public_id"), slug: text(row.slug, "page.slug"), status: text(row.status, "page.status"),
      version, pageType: input.pageType, translations
    };
    await tx.query(`INSERT INTO cms_page_revisions(id,public_id,page_id,version,actor_user_id,actor_public_id,reason,snapshot,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [randomUUID(), id("page-revision"), text(row.page_uuid, "page_uuid"), version, actor, principal.userId, reason, JSON.stringify(snapshot), new Date(now)]);
    return { id: text(row.public_id, "page.public_id"), status: text(row.status, "page.status"), version };
  }, { isolation: "serializable" });
  await recordAdminAudit(principal, "content.page_updated", "cms_page", result.id, reason, result);
  return result;
}

export async function adminScheduleContentPage(principal: SessionPrincipal, input: { pageId: string; scheduledAt: number; reason?: string }) {
  assertAdminPermission(principal, "content.write");
  const now = Date.now();
  if (!Number.isFinite(input.scheduledAt) || input.scheduledAt <= now + 30_000) throw new Error("Scheduled publication must be in the future");
  const reason = optionalText(input.reason) ?? "Page scheduled for publication";

  if (!postgresAdminRuntimeEnabled()) {
    const content = getAdminGovernanceRuntime().content;
    const result = content.publishPage({ pageId: input.pageId, actorId: principal.userId, now, scheduledAt: input.scheduledAt });
    await recordAdminAudit(principal, "content.page_scheduled", "cms_page", result.id, reason, { version: result.version, scheduledAt: input.scheduledAt });
    return { id: result.id, status: result.status, version: result.version, scheduledAt: result.scheduledAt };
  }

  const result = await postgresUow().withTransaction(platformScope(principal.userId), async (tx) => {
    const actor = await userUuid(tx, principal.userId);
    const found = await tx.query<SqlRow>(`SELECT p.id::text AS page_uuid,p.public_id,p.slug,p.status,p.version,t.title,t.seo_title,t.seo_description,t.translated_blocks FROM cms_pages p LEFT JOIN cms_page_translations t ON t.page_id=p.id AND t.locale='el' WHERE p.public_id=$1 OR p.id::text=$1 FOR UPDATE OF p`, [input.pageId]);
    if (!found.rowCount) throw new Error("CMS page not found");
    const row = found.rows[0];
    if (text(row.status, "page.status") === "archived") throw new Error("Archived pages cannot be scheduled");
    text(row.title, "Greek title");
    text(row.seo_title, "Greek SEO title");
    text(row.seo_description, "Greek SEO description");
    validateBlocks(parseJsonObject(row.translated_blocks ?? []));
    const version = integer(row.version, "page.version") + 1;
    await tx.query(`UPDATE cms_pages SET status='scheduled',scheduled_at=$2,version=$3,updated_by=$4,updated_at=$5 WHERE id=$1`, [text(row.page_uuid, "page_uuid"), new Date(input.scheduledAt), version, actor, new Date(now)]);
    const snapshot = { id: text(row.public_id, "page.public_id"), slug: text(row.slug, "page.slug"), status: "scheduled", version, scheduledAt: input.scheduledAt };
    await tx.query(`INSERT INTO cms_page_revisions(id,public_id,page_id,version,actor_user_id,actor_public_id,reason,snapshot,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`, [randomUUID(), id("page-revision"), text(row.page_uuid, "page_uuid"), version, actor, principal.userId, reason, JSON.stringify(snapshot), new Date(now)]);
    return { id: text(row.public_id, "page.public_id"), status: "scheduled" as const, version, scheduledAt: input.scheduledAt };
  }, { isolation: "serializable" });
  await recordAdminAudit(principal, "content.page_scheduled", "cms_page", result.id, reason, result);
  return result;
}

function cleanPath(value: string): string {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\r\n]/.test(path)) throw new Error("Redirect path must be an internal absolute path");
  return path.replace(/\/{2,}/g, "/");
}

function assertNoRedirectLoop(existing: readonly { fromPath: string; toPath: string; active: boolean }[], fromPath: string, toPath: string) {
  const nextBySource = new Map(existing.filter((item) => item.active && item.fromPath !== fromPath).map((item) => [item.fromPath, item.toPath]));
  nextBySource.set(fromPath, toPath);
  let cursor = fromPath;
  const seen = new Set<string>();
  while (nextBySource.has(cursor)) {
    if (seen.has(cursor)) throw new Error("Redirect would create a loop");
    seen.add(cursor);
    cursor = nextBySource.get(cursor)!;
  }
}

export async function adminCreateContentRedirect(principal: SessionPrincipal, input: { fromPath: string; toPath: string; statusCode?: 301 | 302 | 307 | 308 }) {
  assertAdminPermission(principal, "content.write");
  const fromPath = cleanPath(input.fromPath);
  const toPath = cleanPath(input.toPath);
  if (fromPath === toPath) throw new Error("Redirect source and destination cannot be identical");
  const statusCode = input.statusCode ?? 301;
  if (![301, 302, 307, 308].includes(statusCode)) throw new Error("Unsupported redirect status code");
  const now = Date.now();

  if (!postgresAdminRuntimeEnabled()) {
    const content = getAdminGovernanceRuntime().content;
    assertNoRedirectLoop(content.redirects("sparta"), fromPath, toPath);
    const result = content.addRedirect({ marketId: "sparta", fromPath, toPath, statusCode, actorId: principal.userId, now });
    await recordAdminAudit(principal, "content.redirect_created", "cms_redirect", result.id, `${fromPath} → ${toPath}`, result);
    return result;
  }

  const result = await postgresUow().withTransaction(platformScope(principal.userId), async (tx) => {
    const actor = await userUuid(tx, principal.userId);
    const market = await tx.query<SqlRow>(`SELECT id::text AS id FROM markets WHERE code='sparta'`);
    if (!market.rowCount) throw new Error("Sparta market not found");
    const marketId = text(market.rows[0].id, "market.id");
    const current = await tx.query<SqlRow>(`SELECT from_path,to_path,active FROM cms_redirects WHERE market_id=$1`, [marketId]);
    assertNoRedirectLoop(current.rows.map((row) => ({ fromPath: text(row.from_path, "redirect.from_path"), toPath: text(row.to_path, "redirect.to_path"), active: Boolean(row.active) })), fromPath, toPath);
    await tx.query(`UPDATE cms_redirects SET active=false WHERE market_id=$1 AND from_path=$2 AND active=true`, [marketId, fromPath]);
    const publicId = id("redirect");
    await tx.query(`INSERT INTO cms_redirects(id,public_id,market_id,from_path,to_path,status_code,active,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,true,$7,$8)`, [randomUUID(), publicId, marketId, fromPath, toPath, statusCode, actor, new Date(now)]);
    return { id: publicId, marketId: "sparta", fromPath, toPath, statusCode, active: true, createdAt: now, createdBy: principal.userId };
  }, { isolation: "serializable" });
  await recordAdminAudit(principal, "content.redirect_created", "cms_redirect", result.id, `${fromPath} → ${toPath}`, result);
  return result;
}
