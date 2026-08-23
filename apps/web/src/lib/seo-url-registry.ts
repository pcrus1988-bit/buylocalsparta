import "server-only";

import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { adminSeoCrawlGraph, type SeoCrawlGraphNode } from "./seo-crawl-graph";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const PAGE_LIMIT = 1000;

export type SeoUrlRegistryRow = Readonly<{
  id: string;
  sourceKey: string;
  kind: SeoCrawlGraphNode["kind"];
  route: string;
  label: string;
  canonicalUrl: string;
  desiredIndexable: boolean;
  desiredSitemap: boolean;
  inboundSources: readonly string[];
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  deactivatedAt?: string;
  actualSitemap?: boolean;
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
  openIssues: number;
  criticalOpenIssues: number;
}>;

export type SeoUrlRegistryWorkspace = Readonly<{
  persistenceAvailable: boolean;
  sitemapEvidenceAvailable: boolean;
  latestSitemapValid?: boolean;
  latestSitemapCapturedAt?: string;
  latestSitemapId?: string;
  rows: readonly SeoUrlRegistryRow[];
  metrics: Readonly<{
    active: number;
    desiredIndexable: number;
    desiredSitemap: number;
    actualSitemap: number;
    expectedMissing: number;
    unexpectedActual: number;
    withOpenIssues: number;
    withCriticalIssues: number;
    unhealthyLatestCrawl: number;
  }>;
}>;

type RegistryRow = SqlRow & {
  public_id: string;
  source_key: string;
  kind: SeoCrawlGraphNode["kind"];
  route: string;
  label: string;
  declared_canonical_url: string;
  desired_indexable: boolean;
  desired_sitemap: boolean;
  inbound_sources: unknown;
  active: boolean;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  deactivated_at?: Date | string | null;
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
  open_issue_count?: number | string | null;
  critical_open_issue_count?: number | string | null;
};

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function publicId(): string {
  return `seo_url_${randomUUID().replaceAll("-", "")}`;
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

function inboundSources(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string") {
    try { return inboundSources(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function completeGraph(graph: Awaited<ReturnType<typeof adminSeoCrawlGraph>>) {
  return graph.runtime.productsAvailable
    && graph.runtime.vendorsAvailable
    && graph.runtime.cmsAvailable
    && graph.runtime.categoriesAvailable;
}

function uniqueRoutes(nodes: readonly SeoCrawlGraphNode[]) {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.route)) throw new Error(`SEO URL registry cannot sync duplicate governed route: ${node.route}`);
    seen.add(node.route);
  }
}

export async function syncSeoUrlRegistry(principal: SessionPrincipal) {
  assertAdminPermission(principal, "content.write");
  if (!productionDatabaseConfigured()) throw new Error("SEO URL registry persistence requires PostgreSQL runtime.");
  const graph = await adminSeoCrawlGraph(principal);
  if (!completeGraph(graph)) throw new Error("SEO URL registry sync requires complete product, vendor, CMS and category projections. No rows were deactivated.");
  uniqueRoutes(graph.nodes);

  const now = new Date();
  const payload = graph.nodes.map((node) => ({
    public_id: publicId(),
    source_key: node.key,
    kind: node.kind,
    route: node.route,
    label: node.label,
    canonical_url: node.canonicalUrl,
    desired_indexable: node.indexAllowed,
    desired_sitemap: node.sitemapAllowed,
    inbound_sources: [...node.inboundSources]
  }));
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 3_000 });
  const result = await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
    await tx.query(`
      WITH payload AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
          public_id text,source_key text,kind text,route text,label text,canonical_url text,
          desired_indexable boolean,desired_sitemap boolean,inbound_sources jsonb
        )
      )
      INSERT INTO seo_urls(
        public_id,market_id,source_key,kind,route,label,declared_canonical_url,
        desired_indexable,desired_sitemap,inbound_sources,active,first_seen_at,last_seen_at,deactivated_at,updated_at
      )
      SELECT p.public_id,nullif(current_setting('app.market_id',true),'')::uuid,p.source_key,p.kind,p.route,p.label,p.canonical_url,
             p.desired_indexable,p.desired_sitemap,p.inbound_sources,true,$2,$2,NULL,$2
      FROM payload p
      ON CONFLICT(market_id,route) DO UPDATE SET
        source_key=EXCLUDED.source_key,
        kind=EXCLUDED.kind,
        label=EXCLUDED.label,
        declared_canonical_url=EXCLUDED.declared_canonical_url,
        desired_indexable=EXCLUDED.desired_indexable,
        desired_sitemap=EXCLUDED.desired_sitemap,
        inbound_sources=EXCLUDED.inbound_sources,
        active=true,
        last_seen_at=EXCLUDED.last_seen_at,
        deactivated_at=NULL,
        updated_at=EXCLUDED.updated_at
    `, [JSON.stringify(payload), now]);

    const routes = graph.nodes.map((node) => node.route);
    const deactivated = await tx.query<{ public_id: string }>(`
      UPDATE seo_urls
      SET active=false,deactivated_at=$2,updated_at=$2
      WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
        AND active=true
        AND NOT (route=ANY($1::text[]))
      RETURNING public_id
    `, [routes, now]);
    return { synced: graph.nodes.length, deactivated: deactivated.rowCount, generatedAt: graph.generatedAt };
  }, { isolation: "serializable" });

  await recordAdminAudit(principal, "seo.url_registry_synced", "seo_url_registry", marketCode(), "Refresh derived governed URL registry", result);
  return result;
}

export async function getSeoUrlRegistryWorkspace(principal: SessionPrincipal): Promise<SeoUrlRegistryWorkspace> {
  assertAdminPermission(principal, "content.read");
  if (!productionDatabaseConfigured()) return {
    persistenceAvailable: false,
    sitemapEvidenceAvailable: false,
    rows: [],
    metrics: { active: 0, desiredIndexable: 0, desiredSitemap: 0, actualSitemap: 0, expectedMissing: 0, unexpectedActual: 0, withOpenIssues: 0, withCriticalIssues: 0, unhealthyLatestCrawl: 0 }
  };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });

  try {
    const rows = await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, (tx) => tx.query<RegistryRow>(`
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
      ),
      issue_counts AS (
        SELECT route,
               count(*) FILTER (WHERE status='open')::int AS open_issue_count,
               count(*) FILTER (WHERE status='open' AND severity='critical')::int AS critical_open_issue_count
        FROM seo_crawl_issues
        WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
        GROUP BY route
      )
      SELECT u.public_id,u.source_key,u.kind,u.route,u.label,u.declared_canonical_url,
             u.desired_indexable,u.desired_sitemap,u.inbound_sources,u.active,
             u.first_seen_at,u.last_seen_at,u.deactivated_at,
             s.public_id AS sitemap_public_id,s.valid AS sitemap_valid,s.captured_at AS sitemap_captured_at,
             CASE WHEN s.valid=true THEN EXISTS(
               SELECT 1 FROM seo_sitemap_snapshot_entries e WHERE e.snapshot_id=s.id AND e.route=u.route
             ) ELSE NULL END AS actual_sitemap,
             c.crawl_run_public_id,c.crawl_captured_at,c.http_status,c.response_time_ms,c.final_url,
             c.crawl_title,c.crawl_canonical,c.crawl_robots,c.h1_count,c.crawl_issue_count,
             COALESCE(i.open_issue_count,0) AS open_issue_count,
             COALESCE(i.critical_open_issue_count,0) AS critical_open_issue_count
      FROM seo_urls u
      LEFT JOIN latest_sitemap s ON true
      LEFT JOIN latest_crawl c ON c.route=u.route
      LEFT JOIN issue_counts i ON i.route=u.route
      WHERE u.market_id=nullif(current_setting('app.market_id',true),'')::uuid
      ORDER BY u.active DESC,u.desired_indexable DESC,u.desired_sitemap DESC,u.kind,u.route
      LIMIT $1
    `, [PAGE_LIMIT]), { readOnly: true });

    const mapped: SeoUrlRegistryRow[] = rows.rows.map((row) => {
      const status = row.http_status == null ? undefined : count(row.http_status);
      const crawlCapturedAt = optionalIso(row.crawl_captured_at);
      const runId = optionalText(row.crawl_run_public_id);
      const latestCrawl = crawlCapturedAt && runId ? {
        runId,
        capturedAt: crawlCapturedAt,
        status,
        responseTimeMs: count(row.response_time_ms),
        finalUrl: optionalText(row.final_url),
        title: optionalText(row.crawl_title),
        canonical: optionalText(row.crawl_canonical),
        robots: optionalText(row.crawl_robots),
        h1Count: row.h1_count == null ? undefined : count(row.h1_count),
        issueCount: count(row.crawl_issue_count)
      } : undefined;
      return {
        id: row.public_id,
        sourceKey: row.source_key,
        kind: row.kind,
        route: row.route,
        label: row.label,
        canonicalUrl: row.declared_canonical_url,
        desiredIndexable: row.desired_indexable === true,
        desiredSitemap: row.desired_sitemap === true,
        inboundSources: inboundSources(row.inbound_sources),
        active: row.active === true,
        firstSeenAt: iso(row.first_seen_at),
        lastSeenAt: iso(row.last_seen_at),
        deactivatedAt: optionalIso(row.deactivated_at),
        actualSitemap: typeof row.actual_sitemap === "boolean" ? row.actual_sitemap : undefined,
        latestCrawl,
        openIssues: count(row.open_issue_count),
        criticalOpenIssues: count(row.critical_open_issue_count)
      };
    });
    const first = rows.rows[0];
    const sitemapEvidenceAvailable = Boolean(first?.sitemap_public_id);
    const latestSitemapValid = first?.sitemap_valid == null ? undefined : first.sitemap_valid === true;
    const active = mapped.filter((row) => row.active);
    return {
      persistenceAvailable: true,
      sitemapEvidenceAvailable,
      latestSitemapValid,
      latestSitemapCapturedAt: optionalIso(first?.sitemap_captured_at),
      latestSitemapId: optionalText(first?.sitemap_public_id),
      rows: mapped,
      metrics: {
        active: active.length,
        desiredIndexable: active.filter((row) => row.desiredIndexable).length,
        desiredSitemap: active.filter((row) => row.desiredSitemap).length,
        actualSitemap: active.filter((row) => row.actualSitemap === true).length,
        expectedMissing: active.filter((row) => row.desiredSitemap && row.actualSitemap === false).length,
        unexpectedActual: active.filter((row) => !row.desiredSitemap && row.actualSitemap === true).length,
        withOpenIssues: active.filter((row) => row.openIssues > 0).length,
        withCriticalIssues: active.filter((row) => row.criticalOpenIssues > 0).length,
        unhealthyLatestCrawl: active.filter((row) => Boolean(row.latestCrawl && (row.latestCrawl.issueCount > 0 || !row.latestCrawl.status || row.latestCrawl.status < 200 || row.latestCrawl.status >= 300))).length
      }
    };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "seo.url_registry_workspace_failed", message: error instanceof Error ? error.message : String(error) }));
    return {
      persistenceAvailable: false,
      sitemapEvidenceAvailable: false,
      rows: [],
      metrics: { active: 0, desiredIndexable: 0, desiredSitemap: 0, actualSitemap: 0, expectedMissing: 0, unexpectedActual: 0, withOpenIssues: 0, withCriticalIssues: 0, unhealthyLatestCrawl: 0 }
    };
  }
}
