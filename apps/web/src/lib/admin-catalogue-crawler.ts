import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AdminCrawlerProfile = Readonly<{
  id: string; sourceId: string; sourceCode: string; sourceName: string; profileCode: string; rootUrl: string;
  allowedHosts: readonly string[]; allowSubdomains: boolean; allowHttp: boolean; obeyRobots: boolean; fetchMode: string;
  maxPages: number; maxDepth: number; requestsPerSecond: number; active: boolean;
}>;
export type AdminCrawlerSource = Readonly<{ id: string; code: string; name: string; website?: string }>;
export type AdminCrawlerJob = Readonly<{
  id: string; profileId: string; sourceName: string; profileCode: string; rootUrl: string; crawlMode: string; seedUrl?: string; status: string;
  attemptCount: number; discovered: number; fetched: number; skipped: number; failed: number; extracted: number; review: number; promoted: number;
  claimedBy?: string; leaseExpiresAt?: number; lastHeartbeatAt?: number; cancelRequestedAt?: number; createdAt: number; completedAt?: number; failureReason?: string;
}>;
export type AdminCrawlerHealth = Readonly<{
  queuedReady: number; queuedDelayed: number; running: number; cancellationRequested: number; expiredLeases: number;
  failedLast24h: number; completedLast24h: number; latestHeartbeatAt?: string;
}>;
export type AdminCrawlerDashboard = Readonly<{ csrfToken: string; sources: readonly AdminCrawlerSource[]; profiles: readonly AdminCrawlerProfile[]; jobs: readonly AdminCrawlerJob[]; health: AdminCrawlerHealth }>;

export async function adminCrawlerDashboard(principal: SessionPrincipal): Promise<AdminCrawlerDashboard> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return { csrfToken: principal.csrfToken, sources: [], profiles: [], jobs: [], health: emptyHealth() };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [sources, profiles, jobs, health] = await Promise.all([readSources(tx), readProfiles(tx), readJobs(tx), readHealth(tx)]);
    return { csrfToken: principal.csrfToken, sources, profiles, jobs, health };
  }, { readOnly: true, statementTimeoutMs: 8_000 });
}

export async function queueAdminUniversalCrawlerJob(principal: SessionPrincipal, input: { rootUrl: string; mode?: string }): Promise<string> {
  assertAdminPermission(principal, "catalog.write");
  requireRuntime();
  const root = normalizeRootUrl(input.rootUrl);
  const mode = (input.mode?.trim() || "full");
  if (!(["discovery", "full", "single"] as const).includes(mode as any)) throw new Error("Unsupported simple crawl mode");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const sourceId = await ensureAutomaticCatalogSource(tx, root);
    const siteRoot = new URL("/", root.origin);
    const profile = await ensureAutomaticCrawlerProfile(tx, sourceId, siteRoot);
    const seedUrl = mode === "full" ? undefined : root.toString();
    const result = await tx.query<SqlRow>(
      `SELECT bls_private.queue_catalog_web_crawl_job($1,$2,$3,$4,$5,$6) AS id`,
      [profile.id, mode, seedUrl ?? null, databaseUuid(principal.userId), `admin:auto:${principal.userId}:${randomUUID()}`, "web-crawler-v1"]
    );
    return required(result.rows[0]?.id, "crawl job id");
  });
}

export async function createAdminCrawlerProfile(principal: SessionPrincipal, input: {
  sourceId: string; profileCode?: string; rootUrl: string; allowedHosts?: string; maxPages?: number; maxDepth?: number; requestsPerSecond?: number;
}): Promise<string> {
  assertAdminPermission(principal, "catalog.write");
  requireRuntime();
  const root = normalizeRootUrl(input.rootUrl);
  const allowedHosts = [...new Set((input.allowedHosts ?? root.hostname).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (!allowedHosts.length || !allowedHosts.includes(root.hostname.toLowerCase())) throw new Error("Allowed hosts must contain the root hostname");
  const maxPages = boundedInt(input.maxPages, 10_000, 1, 250_000, "maxPages");
  const maxDepth = boundedInt(input.maxDepth, 12, 0, 64, "maxDepth");
  const rps = boundedNumber(input.requestsPerSecond, 1, 0.01, 20, "requestsPerSecond");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      INSERT INTO public.catalog_web_crawl_profiles(source_id,profile_code,root_url,allowed_hosts,allow_subdomains,allow_http,obey_robots,fetch_mode,max_pages,max_depth,max_concurrency,requests_per_second)
      VALUES($1,$2,$3,$4::text[],false,false,true,'http',$5,$6,1,$7)
      RETURNING id
    `, [input.sourceId, input.profileCode?.trim() || "main", root.toString(), allowedHosts, maxPages, maxDepth, rps]);
    return required(result.rows[0]?.id, "profile id");
  });
}

export async function queueAdminCrawlerJob(principal: SessionPrincipal, input: { profileId: string; mode: string; seedUrl?: string }): Promise<string> {
  assertAdminPermission(principal, "catalog.write");
  requireRuntime();
  const mode = input.mode.trim();
  if (!(["discovery", "full", "category", "single"] as const).includes(mode as any)) throw new Error("Unsupported crawl mode");
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const profileResult = await tx.query<SqlRow>(`SELECT root_url,allowed_hosts,allow_subdomains,allow_http FROM public.catalog_web_crawl_profiles WHERE id=$1 AND active=true`, [input.profileId]);
    const profile = profileResult.rows[0];
    if (!profile) throw new Error("Active crawler profile not found");
    const seedUrl = input.seedUrl?.trim() || undefined;
    if (mode === "single" && !seedUrl) throw new Error("Single-page crawl requires a seed URL");
    if (seedUrl) validateSeed(seedUrl, profile);
    const result = await tx.query<SqlRow>(`SELECT bls_private.queue_catalog_web_crawl_job($1,$2,$3,$4,$5,$6) AS id`, [input.profileId, mode, seedUrl ?? null, databaseUuid(principal.userId), `admin:${principal.userId}:${randomUUID()}`, "web-crawler-v1"]);
    return required(result.rows[0]?.id, "crawl job id");
  });
}

export async function cancelAdminCrawlerJob(principal: SessionPrincipal, jobId: string): Promise<string> {
  assertAdminPermission(principal, "catalog.write");
  requireRuntime();
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`SELECT bls_private.request_catalog_web_crawl_job_cancel($1) AS status`, [jobId]);
    return required(result.rows[0]?.status, "cancel status");
  });
}

export async function promoteAdminCrawlerJob(principal: SessionPrincipal, jobId: string): Promise<Readonly<Record<string, unknown>>> {
  assertAdminPermission(principal, "catalog.write");
  requireRuntime();
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`SELECT bls_private.promote_catalog_web_crawl_job($1) AS result`, [jobId]);
    const value = result.rows[0]?.result;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Crawler promotion returned an invalid result");
    return value as Readonly<Record<string, unknown>>;
  }, { statementTimeoutMs: 15_000 });
}

async function ensureAutomaticCatalogSource(tx: SqlExecutor, root: URL): Promise<string> {
  const sourceHost = normalizedCatalogHost(root.hostname);
  const existing = await tx.query<SqlRow>(`SELECT id,code,website,active FROM public.catalog_sources ORDER BY created_at LIMIT 2000`);
  const matching = existing.rows.find((row) => row.active === true && normalizedWebsiteHost(row.website) === sourceHost);
  if (matching) return required(matching.id, "source.id");

  const marketResult = await tx.query<SqlRow>(`SELECT id FROM public.markets ORDER BY (code='sparta') DESC,created_at LIMIT 1`);
  const marketId = required(marketResult.rows[0]?.id, "market id");
  const baseCode = sourceCodeForHost(sourceHost);
  const usedCodes = new Set(existing.rows.map((row) => String(row.code ?? "").trim().toLowerCase()).filter(Boolean));
  const sourceCode = usedCodes.has(baseCode) ? `${baseCode}-${randomUUID().slice(0, 6)}` : baseCode;
  const website = new URL("/", root.origin).toString();
  const result = await tx.query<SqlRow>(`
    INSERT INTO public.catalog_sources(market_id,code,name,source_kind,website,active,metadata)
    VALUES($1,$2,$3,'supplier',$4,true,$5::jsonb)
    RETURNING id
  `, [marketId, sourceCode, sourceHost, website, JSON.stringify({ createdBy: "catalogue-crawler", automatic: true })]);
  return required(result.rows[0]?.id, "source id");
}

async function ensureAutomaticCrawlerProfile(tx: SqlExecutor, sourceId: string, root: URL): Promise<Readonly<{ id: string }>> {
  const host = root.hostname.toLowerCase();
  const profileResult = await tx.query<SqlRow>(`
    SELECT id,profile_code,root_url,allowed_hosts,active
    FROM public.catalog_web_crawl_profiles
    WHERE source_id=$1
    ORDER BY created_at DESC
  `, [sourceId]);
  const matching = profileResult.rows.find((row) => {
    const allowed = Array.isArray(row.allowed_hosts) ? row.allowed_hosts.map((value) => String(value).toLowerCase()) : [];
    return row.active === true && normalizedWebsiteHost(row.root_url) === normalizedCatalogHost(host) && allowed.includes(host);
  });
  if (matching) return { id: required(matching.id, "profile.id") };

  const baseCode = `auto-${sourceCodeForHost(host)}`.slice(0, 80);
  const usedCodes = new Set(profileResult.rows.map((row) => String(row.profile_code ?? "").trim().toLowerCase()).filter(Boolean));
  const profileCode = usedCodes.has(baseCode) ? `${baseCode.slice(0, 72)}-${randomUUID().slice(0, 6)}` : baseCode;
  const result = await tx.query<SqlRow>(`
    INSERT INTO public.catalog_web_crawl_profiles(
      source_id,profile_code,root_url,allowed_hosts,allow_subdomains,allow_http,obey_robots,fetch_mode,
      max_pages,max_depth,max_concurrency,requests_per_second,metadata
    )
    VALUES($1,$2,$3,$4::text[],false,false,true,'http',25000,12,1,1,$5::jsonb)
    RETURNING id
  `, [sourceId, profileCode, root.toString(), [host], JSON.stringify({ createdBy: "catalogue-crawler", automatic: true })]);
  return { id: required(result.rows[0]?.id, "profile id") };
}

async function readSources(tx: SqlExecutor): Promise<readonly AdminCrawlerSource[]> {
  const result = await tx.query<SqlRow>(`SELECT id,code,name,website FROM public.catalog_sources ORDER BY name,code LIMIT 500`);
  return result.rows.map((r) => ({ id: required(r.id,"source.id"), code: required(r.code,"source.code"), name: required(r.name,"source.name"), website: optional(r.website) }));
}
async function readProfiles(tx: SqlExecutor): Promise<readonly AdminCrawlerProfile[]> {
  const result = await tx.query<SqlRow>(`
    SELECT p.id,p.source_id,s.code source_code,s.name source_name,p.profile_code,p.root_url,p.allowed_hosts,p.allow_subdomains,p.allow_http,p.obey_robots,p.fetch_mode,p.max_pages,p.max_depth,p.requests_per_second,p.active
    FROM public.catalog_web_crawl_profiles p JOIN public.catalog_sources s ON s.id=p.source_id ORDER BY s.name,p.profile_code
  `);
  return result.rows.map((r) => ({ id:required(r.id,"profile.id"),sourceId:required(r.source_id,"profile.source_id"),sourceCode:required(r.source_code,"source.code"),sourceName:required(r.source_name,"source.name"),profileCode:required(r.profile_code,"profile.code"),rootUrl:required(r.root_url,"profile.root_url"),allowedHosts:Array.isArray(r.allowed_hosts)?r.allowed_hosts.map(String):[],allowSubdomains:r.allow_subdomains===true,allowHttp:r.allow_http===true,obeyRobots:r.obey_robots===true,fetchMode:String(r.fetch_mode),maxPages:Number(r.max_pages),maxDepth:Number(r.max_depth),requestsPerSecond:Number(r.requests_per_second),active:r.active===true }));
}
async function readJobs(tx: SqlExecutor): Promise<readonly AdminCrawlerJob[]> {
  const result = await tx.query<SqlRow>(`
    SELECT j.id,j.profile_id,s.name source_name,p.profile_code,p.root_url,j.crawl_mode,j.seed_url,j.status,j.attempt_count,j.discovered_url_count,j.fetched_page_count,j.skipped_page_count,j.failed_page_count,j.extracted_product_count,j.review_product_count,j.promoted_product_count,j.claimed_by,
      extract(epoch from j.lease_expires_at)*1000 lease_ms,extract(epoch from j.last_heartbeat_at)*1000 heartbeat_ms,extract(epoch from j.cancel_requested_at)*1000 cancel_ms,extract(epoch from j.created_at)*1000 created_ms,extract(epoch from j.completed_at)*1000 completed_ms,j.failure_reason
    FROM public.catalog_web_crawl_jobs j JOIN public.catalog_web_crawl_profiles p ON p.id=j.profile_id JOIN public.catalog_sources s ON s.id=j.source_id ORDER BY j.created_at DESC LIMIT 120
  `);
  return result.rows.map((r) => ({ id:required(r.id,"job.id"),profileId:required(r.profile_id,"job.profile_id"),sourceName:required(r.source_name,"job.source"),profileCode:required(r.profile_code,"job.profile"),rootUrl:required(r.root_url,"job.root_url"),crawlMode:String(r.crawl_mode),seedUrl:optional(r.seed_url),status:String(r.status),attemptCount:Number(r.attempt_count),discovered:Number(r.discovered_url_count),fetched:Number(r.fetched_page_count),skipped:Number(r.skipped_page_count),failed:Number(r.failed_page_count),extracted:Number(r.extracted_product_count),review:Number(r.review_product_count),promoted:Number(r.promoted_product_count),claimedBy:optional(r.claimed_by),leaseExpiresAt:optionalNumber(r.lease_ms),lastHeartbeatAt:optionalNumber(r.heartbeat_ms),cancelRequestedAt:optionalNumber(r.cancel_ms),createdAt:Number(r.created_ms),completedAt:optionalNumber(r.completed_ms),failureReason:optional(r.failure_reason) }));
}
async function readHealth(tx: SqlExecutor): Promise<AdminCrawlerHealth> {
  const result = await tx.query<SqlRow>(`SELECT bls_private.catalog_web_crawl_queue_health() AS health`);
  const h = (result.rows[0]?.health ?? {}) as Record<string, unknown>;
  return { queuedReady:Number(h.queuedReady??0),queuedDelayed:Number(h.queuedDelayed??0),running:Number(h.running??0),cancellationRequested:Number(h.cancellationRequested??0),expiredLeases:Number(h.expiredLeases??0),failedLast24h:Number(h.failedLast24h??0),completedLast24h:Number(h.completedLast24h??0),latestHeartbeatAt:optional(h.latestHeartbeatAt) };
}
function validateSeed(seed: string, profile: SqlRow): void {
  const url = new URL(seed); const allowHttp = profile.allow_http === true;
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) throw new Error("Seed URL scheme is not allowed by this profile");
  const hosts = Array.isArray(profile.allowed_hosts) ? profile.allowed_hosts.map((v) => String(v).toLowerCase()) : [];
  const host = url.hostname.toLowerCase(); const subdomains = profile.allow_subdomains === true;
  if (!hosts.some((allowed) => host === allowed || (subdomains && host.endsWith(`.${allowed}`)))) throw new Error("Seed URL host is outside the crawler profile allowlist");
}
function normalizeRootUrl(value: string): URL {
  const raw = value.trim();
  if (!raw) throw new Error("Website URL is required");
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;
  const url = new URL(candidate);
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") throw new Error("Catalogue crawler requires an HTTPS website");
  if (url.username || url.password) throw new Error("Website URL cannot contain credentials");
  if (url.port && url.port !== "443") throw new Error("Website URL must use the standard HTTPS port");
  url.hash = "";
  url.search = "";
  return url;
}
function normalizedWebsiteHost(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  try { return normalizedCatalogHost(new URL(raw).hostname); } catch { return undefined; }
}
function normalizedCatalogHost(host: string): string { return host.trim().toLowerCase().replace(/^www\./, ""); }
function sourceCodeForHost(host: string): string {
  const code = normalizedCatalogHost(host).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return code || `web-${randomUUID().slice(0, 8)}`;
}
function databaseUuid(value: string): string | null {
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : null;
}
function requireRuntime(): void { if (!postgresAdminRuntimeEnabled()) throw new Error("PostgreSQL admin runtime is not enabled"); }
function emptyHealth(): AdminCrawlerHealth { return { queuedReady:0,queuedDelayed:0,running:0,cancellationRequested:0,expiredLeases:0,failedLast24h:0,completedLast24h:0 }; }
function boundedInt(value:number|undefined,fallback:number,min:number,max:number,name:string):number { const n=value??fallback; if(!Number.isSafeInteger(n)||n<min||n>max) throw new Error(`${name} must be between ${min} and ${max}`); return n; }
function boundedNumber(value:number|undefined,fallback:number,min:number,max:number,name:string):number { const n=value??fallback; if(!Number.isFinite(n)||n<min||n>max) throw new Error(`${name} must be between ${min} and ${max}`); return n; }
function required(value:unknown,name:string):string { const s=String(value??"").trim(); if(!s) throw new Error(`${name} is required`); return s; }
function optional(value:unknown):string|undefined { const s=String(value??"").trim(); return s||undefined; }
function optionalNumber(value:unknown):number|undefined { if(value==null||value==="") return undefined; const n=Number(value); return Number.isFinite(n)?n:undefined; }
