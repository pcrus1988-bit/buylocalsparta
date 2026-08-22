import "server-only";

import { randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const SEO_DIAGNOSTIC_REPORTS_KEY = "seo.visibility.reports.v1";
export const SEO_DIAGNOSTIC_REPORT_AUDIT_ENTITY = "seo_diagnostic_report";
export const SEO_DIAGNOSTIC_REPORT_LIMIT = 50;
export const SEO_DIAGNOSTIC_REPORT_FORMAT_VERSION = 2;

export type SeoDiagnosticSeverity = "critical" | "warning" | "info" | "good";

export type SeoDiagnosticReportItem = Readonly<{
  id: string;
  severity: SeoDiagnosticSeverity;
  title: string;
  detail: string;
  count?: number;
}>;

export type SeoDiagnosticReportMetrics = Readonly<{
  staticIndexable: number;
  categories: number;
  products: number;
  productIndexEligible: number;
  partners: number;
  research: number;
  researchIndexEligible: number;
  vendorIndexEligible: number;
  sitemapEstimatedCount: number;
  productsWithApprovedImage: number;
  productsMissingApprovedImage: number;
  knownNonIndexablePages: number;
  entityOverrides: number;
  crawlIndexable: number;
  crawlOrphans: number;
  crawlWeak: number;
}>;

export type SeoDiagnosticReportRouteClasses = Readonly<{
  PUBLIC_INDEXABLE: number;
  PUBLIC_NOINDEX: number;
  AUTHENTICATED_PRIVATE: number;
  INTERNAL_SYSTEM: number;
}>;

export type SeoDiagnosticReportRuntime = Readonly<{
  databaseProductsAvailable: boolean;
  databaseVendorsAvailable: boolean;
  governedPublicMediaEnabled: boolean;
}>;

export type SeoDiagnosticReport = Readonly<{
  formatVersion: number;
  id: string;
  createdAt: string;
  sourceGeneratedAt: string;
  actorId: string;
  reason: string;
  origin: string;
  score: number;
  severityCounts: Readonly<Record<SeoDiagnosticSeverity, number>>;
  metrics: SeoDiagnosticReportMetrics;
  routeClassCounts: SeoDiagnosticReportRouteClasses;
  runtime: SeoDiagnosticReportRuntime;
  diagnostics: readonly SeoDiagnosticReportItem[];
}>;

export type SeoDiagnosticReportsSnapshot = Readonly<{
  reports: readonly SeoDiagnosticReport[];
  version: number;
  source: "database" | "defaults";
  persistenceAvailable: boolean;
  updatedAt?: string;
  updatedBy?: string;
}>;

type SettingsRow = Readonly<{
  value: unknown | null;
  version: number | null;
  updated_at: Date | string | null;
  updated_by_public_id?: string;
}>;

const SEVERITIES: readonly SeoDiagnosticSeverity[] = ["critical", "warning", "info", "good"];

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result && result.length <= maximum ? result : undefined;
}

function finiteCount(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 && result <= 10_000_000 ? result : undefined;
}

function validIsoDate(value: unknown): string | undefined {
  const date = new Date(typeof value === "string" ? value : "");
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeMetrics(value: unknown): SeoDiagnosticReportMetrics | undefined {
  const input = object(value);
  const productCount = finiteCount(input.products);
  if (productCount === undefined) return undefined;
  const keys: readonly Exclude<keyof SeoDiagnosticReportMetrics, "products" | "productIndexEligible" | "crawlIndexable" | "crawlOrphans" | "crawlWeak">[] = [
    "staticIndexable",
    "categories",
    "partners",
    "research",
    "researchIndexEligible",
    "vendorIndexEligible",
    "sitemapEstimatedCount",
    "productsWithApprovedImage",
    "productsMissingApprovedImage",
    "knownNonIndexablePages",
    "entityOverrides"
  ];
  // Crawl-graph metrics were added after the first report format. Defaulting the
  // three new counts to zero keeps older bounded snapshots readable without a data
  // migration while every newly-created report supplies the real live graph counts.
  const normalized = {
    products: productCount,
    productIndexEligible: finiteCount(input.productIndexEligible) ?? productCount,
    crawlIndexable: finiteCount(input.crawlIndexable) ?? 0,
    crawlOrphans: finiteCount(input.crawlOrphans) ?? 0,
    crawlWeak: finiteCount(input.crawlWeak) ?? 0
  } as Record<keyof SeoDiagnosticReportMetrics, number>;
  for (const key of keys) {
    const count = finiteCount(input[key]);
    if (count === undefined) return undefined;
    normalized[key] = count;
  }
  return normalized;
}

function normalizeRouteClassCounts(value: unknown): SeoDiagnosticReportRouteClasses | undefined {
  const input = object(value);
  const publicIndexable = finiteCount(input.PUBLIC_INDEXABLE);
  const publicNoindex = finiteCount(input.PUBLIC_NOINDEX);
  const authenticatedPrivate = finiteCount(input.AUTHENTICATED_PRIVATE);
  const internalSystem = finiteCount(input.INTERNAL_SYSTEM);
  if ([publicIndexable, publicNoindex, authenticatedPrivate, internalSystem].some((count) => count === undefined)) return undefined;
  return {
    PUBLIC_INDEXABLE: publicIndexable!,
    PUBLIC_NOINDEX: publicNoindex!,
    AUTHENTICATED_PRIVATE: authenticatedPrivate!,
    INTERNAL_SYSTEM: internalSystem!
  };
}

function normalizeRuntime(value: unknown): SeoDiagnosticReportRuntime | undefined {
  const input = object(value);
  if (typeof input.databaseProductsAvailable !== "boolean" || typeof input.databaseVendorsAvailable !== "boolean" || typeof input.governedPublicMediaEnabled !== "boolean") return undefined;
  return {
    databaseProductsAvailable: input.databaseProductsAvailable,
    databaseVendorsAvailable: input.databaseVendorsAvailable,
    governedPublicMediaEnabled: input.governedPublicMediaEnabled
  };
}

function normalizeDiagnostics(value: unknown): readonly SeoDiagnosticReportItem[] | undefined {
  if (!Array.isArray(value) || value.length > 100) return undefined;
  const diagnostics: SeoDiagnosticReportItem[] = [];
  for (const entry of value) {
    const input = object(entry);
    const id = boundedText(input.id, 120);
    const title = boundedText(input.title, 240);
    const detail = boundedText(input.detail, 1_000);
    const severity = input.severity;
    const count = input.count === undefined ? undefined : finiteCount(input.count);
    if (!id || !title || !detail || !SEVERITIES.includes(severity as SeoDiagnosticSeverity) || (input.count !== undefined && count === undefined)) return undefined;
    diagnostics.push({ id, title, detail, severity: severity as SeoDiagnosticSeverity, ...(count === undefined ? {} : { count }) });
  }
  return diagnostics;
}

export function seoDiagnosticSeverityCounts(diagnostics: readonly SeoDiagnosticReportItem[]): Readonly<Record<SeoDiagnosticSeverity, number>> {
  const counts: Record<SeoDiagnosticSeverity, number> = { critical: 0, warning: 0, info: 0, good: 0 };
  for (const diagnostic of diagnostics) counts[diagnostic.severity] += 1;
  return counts;
}

export function seoDiagnosticHealthScore(diagnostics: readonly SeoDiagnosticReportItem[]): number {
  const counts = seoDiagnosticSeverityCounts(diagnostics);
  return Math.max(0, 100 - counts.critical * 25 - counts.warning * 8 - counts.info * 2);
}

function normalizeReport(value: unknown): SeoDiagnosticReport | undefined {
  const input = object(value);
  const persistedFormatVersion = finiteCount(input.formatVersion);
  const formatVersion = persistedFormatVersion === undefined ? 1 : persistedFormatVersion;
  const id = boundedText(input.id, 80);
  const createdAt = validIsoDate(input.createdAt);
  const sourceGeneratedAt = validIsoDate(input.sourceGeneratedAt);
  const actorId = boundedText(input.actorId, 200);
  const reason = boundedText(input.reason, 500);
  const origin = boundedText(input.origin, 300);
  const metrics = normalizeMetrics(input.metrics);
  const routeClassCounts = normalizeRouteClassCounts(input.routeClassCounts);
  const runtime = normalizeRuntime(input.runtime);
  const diagnostics = normalizeDiagnostics(input.diagnostics);
  if (formatVersion < 1 || formatVersion > SEO_DIAGNOSTIC_REPORT_FORMAT_VERSION || !id?.match(/^seo_report_[a-f0-9]{32}$/) || !createdAt || !sourceGeneratedAt || !actorId || !reason || !origin || !metrics || !routeClassCounts || !runtime || !diagnostics) return undefined;
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return undefined;
  }
  const localOrigin = parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1";
  if (parsedOrigin.origin !== origin || (parsedOrigin.protocol !== "https:" && !(localOrigin && parsedOrigin.protocol === "http:"))) return undefined;
  return {
    formatVersion,
    id,
    createdAt,
    sourceGeneratedAt,
    actorId,
    reason,
    origin,
    score: seoDiagnosticHealthScore(diagnostics),
    severityCounts: seoDiagnosticSeverityCounts(diagnostics),
    metrics,
    routeClassCounts,
    runtime,
    diagnostics
  };
}

function normalizeReports(value: unknown): readonly SeoDiagnosticReport[] {
  const entries = object(value).reports;
  if (!Array.isArray(entries)) return [];
  const byId = new Map<string, SeoDiagnosticReport>();
  for (const value of entries.slice(0, SEO_DIAGNOSTIC_REPORT_LIMIT * 2)) {
    const report = normalizeReport(value);
    if (report) byId.set(report.id, report);
  }
  return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, SEO_DIAGNOSTIC_REPORT_LIMIT);
}

function requiredReason(value: unknown): string {
  const reason = String(value ?? "").trim();
  if (reason.length < 10) throw new Error("Report reason must contain at least 10 characters.");
  if (reason.length > 500) throw new Error("Report reason must contain at most 500 characters.");
  if (/[<>]/.test(reason)) throw new Error("Report reason cannot contain HTML brackets.");
  return reason;
}

export async function getSeoDiagnosticReportsSnapshot(): Promise<SeoDiagnosticReportsSnapshot> {
  if (!productionDatabaseConfigured()) return { reports: [], version: 0, source: "defaults", persistenceAvailable: false };
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<SettingsRow>(
      `SELECT s.value,s.version,s.updated_at,u.public_id AS updated_by_public_id
       FROM system_settings s
       JOIN markets m ON m.id=s.market_id
       LEFT JOIN users u ON u.id=s.updated_by
       WHERE m.code=$1 AND s.key=$2
       LIMIT 1`,
      [marketCode(), SEO_DIAGNOSTIC_REPORTS_KEY]
    );
    const row = result.rows[0];
    if (!row || row.version == null) return { reports: [], version: 0, source: "defaults", persistenceAvailable: true };
    const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date(Number.NaN);
    return {
      reports: normalizeReports(row.value),
      version: Number(row.version),
      source: "database",
      persistenceAvailable: true,
      updatedAt: Number.isNaN(updatedAt.getTime()) ? undefined : updatedAt.toISOString(),
      updatedBy: row.updated_by_public_id
    };
  } catch {
    return { reports: [], version: 0, source: "defaults", persistenceAvailable: false };
  }
}

export async function createSeoDiagnosticReport(input: {
  principal: SessionPrincipal;
  reason: string;
  sourceGeneratedAt: string;
  origin: string;
  metrics: SeoDiagnosticReportMetrics;
  routeClassCounts: SeoDiagnosticReportRouteClasses;
  runtime: SeoDiagnosticReportRuntime;
  diagnostics: readonly SeoDiagnosticReportItem[];
}): Promise<SeoDiagnosticReport> {
  assertAdminPermission(input.principal, "content.write");
  if (!productionDatabaseConfigured()) throw new Error("SEO diagnostic report persistence requires PostgreSQL runtime.");
  const reason = requiredReason(input.reason);
  const report = normalizeReport({
    formatVersion: SEO_DIAGNOSTIC_REPORT_FORMAT_VERSION,
    id: `seo_report_${randomUUID().replaceAll("-", "")}`,
    createdAt: new Date().toISOString(),
    sourceGeneratedAt: input.sourceGeneratedAt,
    actorId: input.principal.userId,
    reason,
    origin: input.origin,
    metrics: input.metrics,
    routeClassCounts: input.routeClassCounts,
    runtime: input.runtime,
    diagnostics: input.diagnostics
  });
  if (!report) throw new Error("The current SEO diagnostic projection could not be normalized safely.");

  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${marketCode()}:${SEO_DIAGNOSTIC_REPORTS_KEY}`]);
    const state = await client.query<SettingsRow & { market_id: string }>(
      `SELECT m.id::text AS market_id,s.value,s.version,s.updated_at
       FROM markets m
       LEFT JOIN system_settings s ON s.market_id=m.id AND s.key=$2
       WHERE m.code=$1
       LIMIT 1`,
      [marketCode(), SEO_DIAGNOSTIC_REPORTS_KEY]
    );
    const row = state.rows[0];
    if (!row) throw new Error("SEO diagnostic report market was not found.");
    const reports = [report, ...normalizeReports(row.value).filter((entry) => entry.id !== report.id)].slice(0, SEO_DIAGNOSTIC_REPORT_LIMIT);
    const actor = await client.query<{ id: string }>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1", [input.principal.userId]);
    const actorUuid = actor.rows[0]?.id;
    if (!actorUuid) throw new Error("Admin actor was not found.");
    await client.query(
      `INSERT INTO system_settings(market_id,key,value,version,updated_by,updated_at)
       VALUES($1::uuid,$2,$3::jsonb,1,$4::uuid,clock_timestamp())
       ON CONFLICT (market_id,key) DO UPDATE
       SET value=EXCLUDED.value,version=system_settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp()`,
      [row.market_id, SEO_DIAGNOSTIC_REPORTS_KEY, JSON.stringify({ reports }), actorUuid]
    );
    await client.query(
      `INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,after_state,created_at)
       VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5,$6,'seo.diagnostic_report_created',$7,$8,$9,$10::jsonb,clock_timestamp())`,
      [randomUUID(), `audit_${randomUUID().replaceAll("-", "")}`, row.market_id, actorUuid, input.principal.userId, input.principal.roles[0] ?? null, SEO_DIAGNOSTIC_REPORT_AUDIT_ENTITY, report.id, reason, JSON.stringify(report)]
    );
    await client.query("COMMIT");
    return report;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getSeoDiagnosticReport(id: string): Promise<SeoDiagnosticReport | undefined> {
  if (!/^seo_report_[a-f0-9]{32}$/.test(id)) return undefined;
  const snapshot = await getSeoDiagnosticReportsSnapshot();
  return snapshot.reports.find((report) => report.id === id);
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const spreadsheetSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

export function seoDiagnosticReportCsv(report: SeoDiagnosticReport): string {
  const header = ["report_id", "created_at", "actor_id", "reason", "health_score", "row_type", "key", "severity", "title", "detail", "value"];
  const base = [report.id, report.createdAt, report.actorId, report.reason, report.score];
  const rows: unknown[][] = [];
  for (const [key, value] of Object.entries(report.metrics)) rows.push([...base, "metric", key, "", "", "", value]);
  for (const [key, value] of Object.entries(report.routeClassCounts)) rows.push([...base, "route_class", key, "", "", "", value]);
  for (const diagnostic of report.diagnostics) rows.push([...base, "diagnostic", diagnostic.id, diagnostic.severity, diagnostic.title, diagnostic.detail, diagnostic.count ?? ""]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
