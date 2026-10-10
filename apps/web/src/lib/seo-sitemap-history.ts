import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";

const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;
const MAX_SITEMAP_URLS = 50_000;
const FETCH_TIMEOUT_MS = 10_000;
const HISTORY_LIMIT = 20;
const DIFF_LIMIT = 250;

export type SeoSitemapSnapshotSummary = Readonly<{
  id: string;
  sitemapUrl: string;
  httpStatus?: number;
  contentType?: string;
  responseTimeMs: number;
  bodySha256?: string;
  entryCount: number;
  valid: boolean;
  error?: string;
  capturedAt: string;
  actorId?: string;
}>;

export type SeoSitemapHistoryWorkspace = Readonly<{
  persistenceAvailable: boolean;
  snapshots: readonly SeoSitemapSnapshotSummary[];
  latest?: SeoSitemapSnapshotSummary;
  previous?: SeoSitemapSnapshotSummary;
  addedRoutes: readonly string[];
  removedRoutes: readonly string[];
  expectedMissing: readonly string[];
  unexpectedActual: readonly string[];
  metrics: Readonly<{
    latestEntries: number;
    added: number;
    removed: number;
    expectedMissing: number;
    unexpectedActual: number;
  }>;
}>;

type ParsedSitemapEntry = Readonly<{
  loc: string;
  route: string;
  lastmod?: Date;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
  alternates: Readonly<Record<string, string>>;
}>;

type SnapshotRow = SqlRow & {
  id: string;
  public_id: string;
  sitemap_url: string;
  http_status?: number | string | null;
  content_type?: string | null;
  response_time_ms: number | string;
  body_sha256?: string | null;
  entry_count: number | string;
  valid: boolean;
  error_detail?: string | null;
  captured_at: Date | string;
  actor_public_id?: string | null;
};

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function publicId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function tagText(block: string, tag: string): string | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match?.[1] ? decodeXml(match[1].trim()) : undefined;
}

function parseAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])(.*?)\2/g)) result[match[1].toLowerCase()] = decodeXml(match[3]);
  return result;
}

function parseSitemapXml(xml: string, origin: URL): ParsedSitemapEntry[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Sitemap XML declarations/entities are not accepted.");
  if (!/<urlset(?:\s|>)/i.test(xml)) throw new Error("Production sitemap is not a URL-set sitemap.");
  const blocks = [...xml.matchAll(/<url(?:\s[^>]*)?>([\s\S]*?)<\/url>/gi)];
  if (blocks.length > MAX_SITEMAP_URLS) throw new Error(`Sitemap exceeds ${MAX_SITEMAP_URLS} URL entries.`);
  const seen = new Set<string>();
  const entries: ParsedSitemapEntry[] = [];
  for (const match of blocks) {
    const block = match[1];
    const loc = tagText(block, "loc");
    if (!loc) throw new Error("Sitemap URL entry is missing <loc>.");
    let url: URL;
    try { url = new URL(loc); } catch { throw new Error(`Invalid sitemap URL: ${loc.slice(0, 200)}`); }
    if (url.origin !== origin.origin) throw new Error(`Sitemap URL escaped canonical origin: ${url.origin}`);
    if (url.hash || url.search) throw new Error(`Sitemap URL must be a clean canonical path: ${url.pathname}`);
    const normalizedLoc = url.toString();
    if (seen.has(normalizedLoc)) throw new Error(`Duplicate sitemap URL: ${url.pathname}`);
    seen.add(normalizedLoc);

    const lastmodRaw = tagText(block, "lastmod");
    const lastmod = lastmodRaw ? new Date(lastmodRaw) : undefined;
    if (lastmod && Number.isNaN(lastmod.getTime())) throw new Error(`Invalid sitemap lastmod for ${url.pathname}`);
    const changefreqRaw = tagText(block, "changefreq")?.toLowerCase();
    const allowedChangefreq = new Set(["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]);
    if (changefreqRaw && !allowedChangefreq.has(changefreqRaw)) throw new Error(`Invalid changefreq for ${url.pathname}`);
    const priorityRaw = tagText(block, "priority");
    const priority = priorityRaw === undefined ? undefined : Number(priorityRaw);
    if (priority !== undefined && (!Number.isFinite(priority) || priority < 0 || priority > 1)) throw new Error(`Invalid priority for ${url.pathname}`);

    const alternates: Record<string, string> = {};
    for (const link of block.matchAll(/<(?:xhtml:)?link\b([^>]*)\/?\s*>/gi)) {
      const attributes = parseAttributes(link[1]);
      if (attributes.rel?.toLowerCase() !== "alternate" || !attributes.hreflang || !attributes.href) continue;
      const alternate = new URL(attributes.href, origin);
      if (alternate.origin !== origin.origin) throw new Error(`Alternate sitemap URL escaped canonical origin: ${alternate.origin}`);
      alternates[attributes.hreflang] = alternate.toString();
    }
    entries.push({
      loc: normalizedLoc,
      route: url.pathname,
      lastmod,
      changefreq: changefreqRaw as ParsedSitemapEntry["changefreq"],
      priority,
      alternates
    });
  }
  return entries;
}

function parseSitemapIndexXml(xml: string, origin: URL, requiredCoreUrl: URL): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Sitemap index declarations/entities are not accepted.");
  if (!/<sitemapindex(?:\s|>)/i.test(xml)) throw new Error("Production /sitemap.xml is not a sitemap index.");
  const blocks = [...xml.matchAll(/<sitemap(?:\s[^>]*)?>([\s\S]*?)<\/sitemap>/gi)];
  const children = new Set<string>();
  const shardIndexes = new Set<number>();
  for (const [, block] of blocks) {
    const loc = tagText(block, "loc");
    if (!loc) throw new Error("Sitemap index entry is missing <loc>.");
    const candidate = new URL(loc);
    if (candidate.origin !== origin.origin || candidate.search || candidate.hash) throw new Error("Noncanonical sitemap index child.");
    if (children.has(candidate.toString())) throw new Error("Duplicate child in sitemap index.");
    children.add(candidate.toString());
    const shard = candidate.pathname.match(/^\/sitemaps\/products\/(\d+)\.xml$/);
    if (shard) shardIndexes.add(Number(shard[1]));
  }
  if (!children.has(requiredCoreUrl.toString())) throw new Error("Core sitemap is absent from the public sitemap index.");
  // The product-shard XML files are monitored by the public index and the
  // GSC diagnostics job; this bounded snapshot captures CORE page URLs only.
  // Do not present these observations as verification of every product shard.
  if (!shardIndexes.size) throw new Error("Product sitemap shards are absent from the index.");
  for (let i = 0; i < shardIndexes.size; i += 1) {
    if (!shardIndexes.has(i)) throw new Error("Product sitemap shards are not contiguous at " + i + ".");
  }
}

async function boundedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SITEMAP_BYTES) throw new Error(`Sitemap response exceeds ${MAX_SITEMAP_BYTES} bytes.`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    length += value.byteLength;
    if (length > MAX_SITEMAP_BYTES) {
      await reader.cancel();
      throw new Error(`Sitemap response exceeds ${MAX_SITEMAP_BYTES} bytes.`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

async function persistSnapshot(principal: SessionPrincipal, input: {
  sitemapUrl: string;
  httpStatus?: number;
  contentType?: string;
  responseTimeMs: number;
  body?: string;
  entries: readonly ParsedSitemapEntry[];
  valid: boolean;
  error?: string;
}): Promise<SeoSitemapSnapshotSummary> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 3_000 });
  const snapshotPublicId = publicId("seo_sitemap");
  const capturedAt = new Date();
  const bodySha256 = input.body === undefined ? undefined : createHash("sha256").update(input.body).digest("hex");
  await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
    const inserted = await tx.query<{ id: string }>(`
      INSERT INTO seo_sitemap_snapshots(
        public_id,market_id,actor_user_id,sitemap_url,http_status,content_type,response_time_ms,
        body_sha256,entry_count,valid,error_detail,captured_at
      ) VALUES(
        $1,nullif(current_setting('app.market_id',true),'')::uuid,
        nullif(current_setting('app.actor_user_id',true),'')::uuid,
        $2,$3,$4,$5,$6,$7,$8,$9,$10
      ) RETURNING id::text AS id
    `, [snapshotPublicId, input.sitemapUrl, input.httpStatus ?? null, input.contentType ?? null, input.responseTimeMs, bodySha256 ?? null, input.entries.length, input.valid, input.error ?? null, capturedAt]);
    const snapshotId = String(inserted.rows[0]?.id ?? "");
    if (!snapshotId) throw new Error("Unable to persist sitemap snapshot.");
    // The core sitemap contains hundreds of URLs. One bounded JSONB insert
    // avoids an N+1 SQL round-trip chain on the production one-client pool.
    if (input.entries.length) {
      const payload = input.entries.map((entry) => ({
        public_id: publicId("seo_sitemap_entry"),
        loc: entry.loc,
        route: entry.route,
        lastmod: entry.lastmod?.toISOString() ?? null,
        changefreq: entry.changefreq ?? null,
        priority: entry.priority ?? null,
        alternates: entry.alternates
      }));
      await tx.query(`
        INSERT INTO seo_sitemap_snapshot_entries(
          public_id,snapshot_id,loc,route,lastmod,changefreq,priority,alternates,created_at
        )
        SELECT p.public_id,$1::uuid,p.loc,p.route,p.lastmod::timestamptz,
               p.changefreq,p.priority,p.alternates,$3::timestamptz
        FROM jsonb_to_recordset($2::jsonb) AS p(
          public_id text,loc text,route text,lastmod text,
          changefreq text,priority numeric,alternates jsonb
        )
      `, [snapshotId, JSON.stringify(payload), capturedAt]);
    }
  }, { isolation: "serializable" });
  const summary = {
    id: snapshotPublicId,
    sitemapUrl: input.sitemapUrl,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    responseTimeMs: input.responseTimeMs,
    bodySha256,
    entryCount: input.entries.length,
    valid: input.valid,
    error: input.error,
    capturedAt: capturedAt.toISOString(),
    actorId: principal.userId
  } as const;
  await recordAdminAudit(principal, "seo.sitemap_snapshot_captured", "seo_sitemap_snapshot", snapshotPublicId, input.valid ? "Capture production sitemap" : "Capture invalid production sitemap", summary);
  return summary;
}

export async function captureProductionSitemap(principal: SessionPrincipal): Promise<SeoSitemapSnapshotSummary> {
  assertAdminPermission(principal, "content.write");
  if (!productionDatabaseConfigured()) throw new Error("Sitemap snapshot persistence requires PostgreSQL runtime.");
  const { settings } = await getSeoGlobalSettingsSnapshot();
  const origin = new URL(settings.canonicalOrigin);
  const indexUrl = new URL("/sitemap.xml", `${origin.origin}/`);
  const sitemapUrl = new URL("/sitemaps/core/sitemap.xml", `${origin.origin}/`);
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response | undefined;
  let body: string | undefined;
  let entries: ParsedSitemapEntry[] = [];
  let error: string | undefined;
  try {
    // The root is a sitemap INDEX, not a URL-set. Validate its manifest
    // before capturing only the bounded core URL-set as persisted evidence.
    const indexResponse = await fetch(indexUrl, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { "user-agent": "KontaMou-SEO-Admin-Sitemap/1.0", accept: "application/xml,text/xml;q=0.9" },
      signal: controller.signal
    });
    if (!indexResponse.ok) throw new Error(`Production sitemap index returned HTTP ${indexResponse.status}.`);
    if (!(indexResponse.headers.get("content-type") ?? "").toLowerCase().includes("xml")) {
      throw new Error("Production sitemap index did not return XML.");
    }
    parseSitemapIndexXml(await boundedResponseText(indexResponse), origin, sitemapUrl);
    response = await fetch(sitemapUrl, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { "user-agent": "KontaMou-SEO-Admin-Sitemap/1.0", accept: "application/xml,text/xml;q=0.9" },
      signal: controller.signal
    });
    body = await boundedResponseText(response);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok) error = `Production core sitemap returned HTTP ${response.status}.`;
    else if (!contentType.includes("xml")) error = `Production core sitemap returned unexpected content type: ${contentType || "missing"}.`;
    else entries = parseSitemapXml(body, origin);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Production sitemap request failed.";
  } finally {
    clearTimeout(timeout);
  }
  return persistSnapshot(principal, {
    sitemapUrl: sitemapUrl.toString(),
    httpStatus: response?.status,
    contentType: response?.headers.get("content-type") ?? undefined,
    responseTimeMs: Date.now() - started,
    body,
    entries: error ? [] : entries,
    valid: !error,
    error
  });
}

function mapSnapshot(row: SnapshotRow): SeoSitemapSnapshotSummary {
  return {
    id: row.public_id,
    sitemapUrl: row.sitemap_url,
    httpStatus: row.http_status == null ? undefined : count(row.http_status),
    contentType: optionalText(row.content_type),
    responseTimeMs: count(row.response_time_ms),
    bodySha256: optionalText(row.body_sha256),
    entryCount: count(row.entry_count),
    valid: row.valid === true,
    error: optionalText(row.error_detail),
    capturedAt: iso(row.captured_at),
    actorId: optionalText(row.actor_public_id)
  };
}

export async function getSeoSitemapHistoryWorkspace(principal: SessionPrincipal): Promise<SeoSitemapHistoryWorkspace> {
  assertAdminPermission(principal, "content.read");
  if (!productionDatabaseConfigured()) return {
    persistenceAvailable: false,
    snapshots: [], addedRoutes: [], removedRoutes: [], expectedMissing: [], unexpectedActual: [],
    metrics: { latestEntries: 0, added: 0, removed: 0, expectedMissing: 0, unexpectedActual: 0 }
  };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  try {
    return await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
      const snapshotsResult = await tx.query<SnapshotRow>(`
        SELECT s.id::text AS id,s.public_id,s.sitemap_url,s.http_status,s.content_type,s.response_time_ms,
               s.body_sha256,s.entry_count,s.valid,s.error_detail,s.captured_at,u.public_id AS actor_public_id
        FROM seo_sitemap_snapshots s
        LEFT JOIN users u ON u.id=s.actor_user_id
        WHERE s.market_id=nullif(current_setting('app.market_id',true),'')::uuid
        ORDER BY s.captured_at DESC
        LIMIT $1
      `, [HISTORY_LIMIT]);
      const snapshots = snapshotsResult.rows.map(mapSnapshot);
      const latestRow = snapshotsResult.rows[0];
      const previousRow = snapshotsResult.rows[1];
      const latest = snapshots[0];
      const previous = snapshots[1];
      let latestRoutes = new Set<string>();
      let previousRoutes = new Set<string>();
      if (latestRow?.valid) {
        const result = await tx.query<{ route: string }>(`SELECT route FROM seo_sitemap_snapshot_entries WHERE snapshot_id=$1`, [latestRow.id]);
        latestRoutes = new Set(result.rows.map((row) => row.route));
      }
      if (previousRow?.valid) {
        const result = await tx.query<{ route: string }>(`SELECT route FROM seo_sitemap_snapshot_entries WHERE snapshot_id=$1`, [previousRow.id]);
        previousRoutes = new Set(result.rows.map((row) => row.route));
      }
      // Compare only like-for-like snapshots: a legacy root snapshot must
      // never be diffed against the corrected core URL-set snapshot.
      const comparable = Boolean(latest?.valid && previous?.valid && latest.sitemapUrl === previous.sitemapUrl);
      const addedRoutes = comparable ? [...latestRoutes].filter((route) => !previousRoutes.has(route)).sort().slice(0, DIFF_LIMIT) : [];
      const removedRoutes = comparable ? [...previousRoutes].filter((route) => !latestRoutes.has(route)).sort().slice(0, DIFF_LIMIT) : [];

      const registry = await tx.query<{ route: string; desired_sitemap: boolean }>(`
        SELECT route,desired_sitemap FROM seo_urls
        WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid AND active=true
      `);
      const coreSnapshot = latest?.sitemapUrl.endsWith("/sitemaps/core/sitemap.xml") ?? false;
      const expectedRoutes = new Set(registry.rows
        .filter((row) => row.desired_sitemap && (!coreSnapshot || !row.route.startsWith("/product/")))
        .map((row) => row.route));
      const unexpectedActual = latest?.valid ? [...latestRoutes].filter((route) => !expectedRoutes.has(route)).sort().slice(0, DIFF_LIMIT) : [];
      const expectedMissing = latest?.valid ? [...expectedRoutes].filter((route) => !latestRoutes.has(route)).sort().slice(0, DIFF_LIMIT) : [];
      return {
        persistenceAvailable: true,
        snapshots,
        latest,
        previous,
        addedRoutes,
        removedRoutes,
        expectedMissing,
        unexpectedActual,
        metrics: {
          latestEntries: latest?.valid ? latest.entryCount : 0,
          added: comparable ? [...latestRoutes].filter((route) => !previousRoutes.has(route)).length : 0,
          removed: comparable ? [...previousRoutes].filter((route) => !latestRoutes.has(route)).length : 0,
          expectedMissing: latest?.valid ? [...expectedRoutes].filter((route) => !latestRoutes.has(route)).length : 0,
          unexpectedActual: latest?.valid ? [...latestRoutes].filter((route) => !expectedRoutes.has(route)).length : 0
        }
      };
    }, { readOnly: true });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "seo.sitemap_history_workspace_failed", message: error instanceof Error ? error.message : String(error) }));
    return {
      persistenceAvailable: false,
      snapshots: [], addedRoutes: [], removedRoutes: [], expectedMissing: [], unexpectedActual: [],
      metrics: { latestEntries: 0, added: 0, removed: 0, expectedMissing: 0, unexpectedActual: 0 }
    };
  }
}
