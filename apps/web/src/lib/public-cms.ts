import "server-only";

import {
  PostgresUnitOfWork,
  contentSitemap,
  seoForPage,
  type ContentLocale,
  type ContentPage,
  type ContentTranslation,
  type SqlRow
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const PUBLIC_CMS_ROUTE_PATTERN = "/[...cmsPath]";
const MARKET_ID = "sparta";

type PageIdRow = SqlRow & { public_id: string };

export function isContentLocale(value: string | undefined): value is ContentLocale {
  return value === "el" || value === "en";
}

export async function getPublicCmsPage(locale: ContentLocale, slug: string, now = Date.now()): Promise<{ page: ContentPage; translation: ContentTranslation } | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const resolved = await getProductionPostgresRuntime().persistence.content.publicPage({ marketId: MARKET_ID, slug, locale, now });
  if (!resolved) return undefined;
  const translation = resolved.page.translations[locale];
  // Do not expose the repository's Greek fallback at an English URL. Fallback is useful
  // to internal consumers, but a public locale route must have its own translation so we
  // do not create duplicate-language indexable pages.
  return translation ? { page: resolved.page, translation } : undefined;
}

export async function getPublicCmsPages(now = Date.now()): Promise<readonly ContentPage[]> {
  if (!productionDatabaseConfigured()) return [];
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  const ids = await uow.withTransaction({ marketId: MARKET_ID }, (tx) => tx.query<PageIdRow>(`
    SELECT p.public_id
    FROM cms_pages p
    JOIN markets m ON m.id=p.market_id
    WHERE m.code=$1
      AND (p.status='published' OR (p.status='scheduled' AND p.scheduled_at <= $2))
    ORDER BY p.updated_at DESC
  `, [MARKET_ID, new Date(now)]), { readOnly: true });
  const pages = await Promise.all(ids.rows.map((row) => runtime.persistence.content.page(String(row.public_id))));
  return pages.filter((page): page is ContentPage => Boolean(page));
}

export async function getPublicCmsSitemapEntries(now = Date.now()) {
  const pages = (await getPublicCmsPages(now)).map((page): ContentPage => {
    if (page.status !== "scheduled" || page.scheduledAt === undefined || page.scheduledAt > now) return page;
    return { ...page, status: "published", publishedAt: page.publishedAt ?? page.scheduledAt };
  });
  return contentSitemap({ pages, now });
}

export async function getPublicCmsSeo(locale: ContentLocale, slug: string, origin: string, now = Date.now()) {
  const resolved = await getPublicCmsPage(locale, slug, now);
  if (!resolved) return undefined;
  return { ...resolved, seo: seoForPage({ origin, page: resolved.page, translation: resolved.translation, locale }) };
}
