import "server-only";

import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getSearchConsoleRouteEvidence, type SeoGscRouteEvidence } from "./seo-gsc-history";

const ISSUE_LIMIT = 100;

export type SeoPageIssue = Readonly<{
  id: string;
  code: string;
  severity: "critical" | "warning" | "info";
  status: "open" | "ignored" | "resolved";
  detail: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  latestRunId: string;
}>;

export type SeoPageDetail = Readonly<{
  id: string;
  sourceKey: string;
  kind: string;
  route: string;
  label: string;
  canonicalUrl: string;
  desiredIndexable: boolean;
  desiredSitemap: boolean;
  actualSitemap?: boolean;
  active: boolean;
  inboundSources: readonly string[];
  firstSeenAt: string;
  lastSeenAt: string;
  latestSitemap?: Readonly<{ id: string; valid: boolean; capturedAt: string }>;
  latestCrawl?: Readonly<{
    runId: string;
    capturedAt: string;
    status?: number;
    responseTimeMs: number;
    finalUrl?: string;
    title?: string;
    canonical?: string;
    robots?: string;
    h1Count?: number;
    issueCount: number;
  }>;
  issues: readonly SeoPageIssue[];
  google: SeoGscRouteEvidence;
}>;

type DetailRow = SqlRow & {
  public_id: string;
  source_key: string;
  kind: string;
  route: string;
  label: string;
  declared_canonical_url: string;
  desired_indexable: boolean;
  desired_sitemap: boolean;
  inbound_sources: unknown;
  active: boolean;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  sitemap_public_id?: string | null;
  sitemap_valid?: boolean | null;
  sitemap_captured_at?: Date | string | null;
  actual_sitemap?: boolean | null;
  crawl_run_public_id?: string | null;
  crawl_captured_at?: Date | string | null;
  http_status?: number | string | null;
  response_time_ms?: number | string | null;
  final_url?: string | null;
  crawl_title?: string | null;
  crawl_canonical?: string | null;
  crawl_robots?: string | null;
  h1_count?: number | string | null;
  crawl_issue_count?: number | string | null;
};

type IssueRow = SqlRow & {
  public_id: string;
  issue_code: string;
  severity: SeoPageIssue["severity"];
  status: SeoPageIssue["status"];
  latest_detail: string;
  occurrence_count: number | string;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  latest_run_public_id: string;
};

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function optionalIso(value: unknown): string | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function sources(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try { return sources(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

export async function getSeoPageDetail(principal: SessionPrincipal, publicId: string): Promise<SeoPageDetail | undefined> {
  assertAdminPermission(principal, "content.read");
  if (!productionDatabaseConfigured()) return undefined;
  const id = publicId.trim();
  if (!/^seo_url_[a-f0-9]{32}$/.test(id)) return undefined;
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });

  const evidence = await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
    const detailResult = await tx.query<DetailRow>(`
      WITH latest_sitemap AS (
        SELECT id,public_id,valid,captured_at
        FROM seo_sitemap_snapshots
        WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
        ORDER BY captured_at DESC
        LIMIT 1
      ),
      latest_crawl AS (
        SELECT DISTINCT ON (r.route)
          r.route,run.public_id AS crawl_run_public_id,r.captured_at AS crawl_captured_at,
          r.http_status,r.response_time_ms,r.final_url,r.title AS crawl_title,r.canonical AS crawl_canonical,
          r.robots AS crawl_robots,r.h1_count,r.issue_count AS crawl_issue_count
        FROM seo_crawl_results r
        JOIN seo_crawl_runs run ON run.id=r.run_id
        WHERE run.market_id=nullif(current_setting('app.market_id',true),'')::uuid
        ORDER BY r.route,r.captured_at DESC,r.id DESC
      )
      SELECT u.public_id,u.source_key,u.kind,u.route,u.label,u.declared_canonical_url,u.desired_indexable,
             u.desired_sitemap,u.inbound_sources,u.active,u.first_seen_at,u.last_seen_at,
             s.public_id AS sitemap_public_id,s.valid AS sitemap_valid,s.captured_at AS sitemap_captured_at,
             CASE WHEN s.valid=true THEN EXISTS(
               SELECT 1 FROM seo_sitemap_snapshot_entries e WHERE e.snapshot_id=s.id AND e.route=u.route
             ) ELSE NULL END AS actual_sitemap,
             c.crawl_run_public_id,c.crawl_captured_at,c.http_status,c.response_time_ms,c.final_url,
             c.crawl_title,c.crawl_canonical,c.crawl_robots,c.h1_count,c.crawl_issue_count
      FROM seo_urls u
      LEFT JOIN latest_sitemap s ON true
      LEFT JOIN latest_crawl c ON c.route=u.route
      WHERE u.market_id=nullif(current_setting('app.market_id',true),'')::uuid AND u.public_id=$1
      LIMIT 1
    `, [id]);
    const row = detailResult.rows[0];
    if (!row) return undefined;
    const issuesResult = await tx.query<IssueRow>(`
      SELECT i.public_id,i.issue_code,i.severity,i.status,i.latest_detail,i.occurrence_count,
             i.first_seen_at,i.last_seen_at,r.public_id AS latest_run_public_id
      FROM seo_crawl_issues i
      JOIN seo_crawl_runs r ON r.id=i.latest_run_id
      WHERE i.market_id=nullif(current_setting('app.market_id',true),'')::uuid AND i.route=$1
      ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'ignored' THEN 1 ELSE 2 END,
               CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
               i.last_seen_at DESC
      LIMIT $2
    `, [row.route, ISSUE_LIMIT]);
    return { row, issues: issuesResult.rows };
  }, { readOnly: true });
  if (!evidence) return undefined;

  const { row } = evidence;
  const crawlCapturedAt = optionalIso(row.crawl_captured_at);
  const crawlRunId = optionalText(row.crawl_run_public_id);
  const latestCrawl = crawlCapturedAt && crawlRunId ? {
    runId: crawlRunId,
    capturedAt: crawlCapturedAt,
    status: row.http_status == null ? undefined : count(row.http_status),
    responseTimeMs: count(row.response_time_ms),
    finalUrl: optionalText(row.final_url),
    title: optionalText(row.crawl_title),
    canonical: optionalText(row.crawl_canonical),
    robots: optionalText(row.crawl_robots),
    h1Count: row.h1_count == null ? undefined : count(row.h1_count),
    issueCount: count(row.crawl_issue_count)
  } : undefined;
  const sitemapId = optionalText(row.sitemap_public_id);
  const sitemapCapturedAt = optionalIso(row.sitemap_captured_at);
  const latestSitemap = sitemapId && sitemapCapturedAt ? { id: sitemapId, valid: row.sitemap_valid === true, capturedAt: sitemapCapturedAt } : undefined;
  const google = await getSearchConsoleRouteEvidence(principal, row.route);

  return {
    id: row.public_id,
    sourceKey: row.source_key,
    kind: row.kind,
    route: row.route,
    label: row.label,
    canonicalUrl: row.declared_canonical_url,
    desiredIndexable: row.desired_indexable === true,
    desiredSitemap: row.desired_sitemap === true,
    actualSitemap: typeof row.actual_sitemap === "boolean" ? row.actual_sitemap : undefined,
    active: row.active === true,
    inboundSources: sources(row.inbound_sources),
    firstSeenAt: iso(row.first_seen_at),
    lastSeenAt: iso(row.last_seen_at),
    latestSitemap,
    latestCrawl,
    issues: evidence.issues.map((issue) => ({
      id: issue.public_id,
      code: issue.issue_code,
      severity: issue.severity,
      status: issue.status,
      detail: issue.latest_detail,
      occurrenceCount: count(issue.occurrence_count),
      firstSeenAt: iso(issue.first_seen_at),
      lastSeenAt: iso(issue.last_seen_at),
      latestRunId: issue.latest_run_public_id
    })),
    google
  };
}
