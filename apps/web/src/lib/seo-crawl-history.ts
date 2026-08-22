import "server-only";

import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { SeoLiveCrawlIssueSeverity, SeoLiveCrawlReport, SeoLiveCrawlRow } from "./seo-live-crawl";

const RUN_LIMIT = 25;
const ISSUE_LIMIT = 250;
const EVENT_LIMIT = 100;

export type SeoCrawlIssueStatus = "open" | "ignored" | "resolved";

export type SeoCrawlRunSummary = Readonly<{
  id: string;
  origin: string;
  requestedLimit: number;
  requested: number;
  completed: number;
  healthy: number;
  withIssues: number;
  startedAt: string;
  completedAt: string;
  actorId?: string;
}>;

export type SeoCrawlIssueSummary = Readonly<{
  id: string;
  route: string;
  code: string;
  severity: SeoLiveCrawlIssueSeverity;
  status: SeoCrawlIssueStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  detail: string;
  latestRunId: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}>;

export type SeoCrawlIssueEventSummary = Readonly<{
  id: string;
  issueId: string;
  route: string;
  eventType: "opened" | "seen" | "auto_resolved" | "ignored" | "resolved" | "reopened";
  detail: string;
  runId?: string;
  actorId?: string;
  createdAt: string;
}>;

export type SeoCrawlHistorySnapshot = Readonly<{
  persistenceAvailable: boolean;
  runs: readonly SeoCrawlRunSummary[];
  issues: readonly SeoCrawlIssueSummary[];
  events: readonly SeoCrawlIssueEventSummary[];
  metrics: Readonly<{
    open: number;
    ignored: number;
    resolved: number;
    criticalOpen: number;
    latestRunIssues: number;
  }>;
}>;

export type SeoCrawlPersistenceResult = Readonly<{
  available: boolean;
  saved: boolean;
  runId?: string;
  error?: string;
}>;

type RunRow = SqlRow & {
  public_id: string;
  origin: string;
  requested_limit: number | string;
  requested_count: number | string;
  completed_count: number | string;
  healthy_count: number | string;
  issue_count: number | string;
  started_at: Date | string;
  completed_at: Date | string;
  actor_public_id?: string | null;
};

type IssueRow = SqlRow & {
  id: string;
  public_id: string;
  route: string;
  issue_code: string;
  severity: SeoLiveCrawlIssueSeverity;
  status: SeoCrawlIssueStatus;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  occurrence_count: number | string;
  latest_detail: string;
  latest_run_public_id: string;
  resolved_at?: Date | string | null;
  resolved_by_public_id?: string | null;
  resolution_note?: string | null;
};

type EventRow = SqlRow & {
  public_id: string;
  issue_public_id: string;
  route: string;
  event_type: SeoCrawlIssueEventSummary["eventType"];
  detail: string;
  run_public_id?: string | null;
  actor_public_id?: string | null;
  created_at: Date | string;
};

function marketCode(): string {
  return process.env.DEFAULT_MARKET?.trim() || "sparta";
}

function publicId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeDetail(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 1_000) || "SEO crawl issue";
}

function lifecycleReason(value: unknown): string {
  const reason = String(value ?? "").replace(/\s+/g, " ").trim();
  if (reason.length < 5) throw new Error("Issue lifecycle reason must contain at least 5 characters.");
  if (reason.length > 500) throw new Error("Issue lifecycle reason must contain at most 500 characters.");
  if (/[<>]/.test(reason)) throw new Error("Issue lifecycle reason cannot contain HTML brackets.");
  return reason;
}

function reliableForAutoResolution(row: SeoLiveCrawlRow): boolean {
  return typeof row.status === "number"
    && row.status >= 200
    && row.status < 300
    && Boolean(row.contentType?.toLowerCase().includes("text/html"))
    && !row.issueDetails.some((issue) => issue.code === "request_failed");
}

async function insertIssueEvent(tx: SqlExecutor, input: {
  issueId: string;
  runId?: string;
  eventType: SeoCrawlIssueEventSummary["eventType"];
  detail: string;
}): Promise<void> {
  await tx.query(`
    INSERT INTO seo_crawl_issue_events(public_id,issue_id,run_id,actor_user_id,event_type,detail)
    VALUES(
      $1,$2,$3,
      nullif(current_setting('app.actor_user_id',true),'')::uuid,
      $4,$5
    )
  `, [publicId("seo_event"), input.issueId, input.runId ?? null, input.eventType, safeDetail(input.detail)]);
}

export async function persistSeoLiveCrawl(principal: SessionPrincipal, report: SeoLiveCrawlReport): Promise<SeoCrawlPersistenceResult> {
  assertAdminPermission(principal, "content.write");
  if (!productionDatabaseConfigured()) return { available: false, saved: false };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 3_000 });
  const runPublicId = publicId("seo_run");

  try {
    await uow.withTransaction({
      actorUserId: principal.userId,
      marketId: marketCode(),
      platformAccess: true,
      requestId: runPublicId
    }, async (tx) => {
      const runResult = await tx.query<{ id: string }>(`
        INSERT INTO seo_crawl_runs(
          public_id,market_id,actor_user_id,origin,requested_limit,requested_count,
          completed_count,healthy_count,issue_count,started_at,completed_at
        ) VALUES(
          $1,nullif(current_setting('app.market_id',true),'')::uuid,
          nullif(current_setting('app.actor_user_id',true),'')::uuid,
          $2,$3,$4,$5,$6,$7,$8,$9
        ) RETURNING id::text AS id
      `, [
        runPublicId,
        report.origin,
        report.limit,
        report.requested,
        report.completed,
        report.healthy,
        report.withIssues,
        new Date(report.startedAt),
        new Date(report.generatedAt)
      ]);
      const runId = String(runResult.rows[0]?.id ?? "");
      if (!runId) throw new Error("Unable to persist SEO crawl run.");

      const observedFingerprints = new Set<string>();
      const reliableRoutes = new Set(report.rows.filter(reliableForAutoResolution).map((row) => row.route));

      for (const row of report.rows) {
        const resultInsert = await tx.query<{ id: string }>(`
          INSERT INTO seo_crawl_results(
            public_id,run_id,route,url,final_url,http_status,content_type,response_time_ms,
            title,canonical,robots,h1_count,issue_count,captured_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          RETURNING id::text AS id
        `, [
          publicId("seo_result"), runId, row.route, row.url, row.finalUrl ?? null, row.status ?? null,
          row.contentType ?? null, row.responseTimeMs, row.title ?? null, row.canonical ?? null,
          row.robots ?? null, row.h1Count ?? null, row.issueDetails.length, new Date(report.generatedAt)
        ]);
        const resultId = String(resultInsert.rows[0]?.id ?? "");
        if (!resultId) throw new Error("Unable to persist SEO crawl result.");

        for (const issue of row.issueDetails) {
          const detail = safeDetail(issue.detail);
          observedFingerprints.add(`${row.route}\u0000${issue.code}`);
          await tx.query(`
            INSERT INTO seo_crawl_result_issues(public_id,result_id,issue_code,severity,detail)
            VALUES($1,$2,$3,$4,$5)
          `, [publicId("seo_observation"), resultId, issue.code, issue.severity, detail]);

          const existing = await tx.query<IssueRow>(`
            SELECT i.id::text AS id,i.public_id,i.route,i.issue_code,i.severity,i.status,
                   i.first_seen_at,i.last_seen_at,i.occurrence_count,i.latest_detail,
                   r.public_id AS latest_run_public_id,i.resolved_at,u.public_id AS resolved_by_public_id,
                   i.resolution_note
            FROM seo_crawl_issues i
            JOIN seo_crawl_runs r ON r.id=i.latest_run_id
            LEFT JOIN users u ON u.id=i.resolved_by
            WHERE i.market_id=nullif(current_setting('app.market_id',true),'')::uuid
              AND i.route=$1 AND i.issue_code=$2
            FOR UPDATE OF i
          `, [row.route, issue.code]);
          const prior = existing.rows[0];
          if (!prior) {
            const inserted = await tx.query<{ id: string }>(`
              INSERT INTO seo_crawl_issues(
                public_id,market_id,route,issue_code,severity,status,first_seen_at,last_seen_at,
                occurrence_count,latest_detail,latest_run_id
              ) VALUES(
                $1,nullif(current_setting('app.market_id',true),'')::uuid,$2,$3,$4,'open',$5,$5,1,$6,$7
              ) RETURNING id::text AS id
            `, [publicId("seo_issue"), row.route, issue.code, issue.severity, new Date(report.generatedAt), detail, runId]);
            const issueId = String(inserted.rows[0]?.id ?? "");
            if (!issueId) throw new Error("Unable to open SEO crawl issue.");
            await insertIssueEvent(tx, { issueId, runId, eventType: "opened", detail });
            continue;
          }

          const reopening = prior.status === "resolved";
          await tx.query(`
            UPDATE seo_crawl_issues
            SET severity=$2,
                status=CASE WHEN status='resolved' THEN 'open' ELSE status END,
                last_seen_at=$3,
                occurrence_count=occurrence_count+1,
                latest_detail=$4,
                latest_run_id=$5,
                resolved_at=CASE WHEN status='resolved' THEN NULL ELSE resolved_at END,
                resolved_by=CASE WHEN status='resolved' THEN NULL ELSE resolved_by END,
                resolution_note=CASE WHEN status='resolved' THEN NULL ELSE resolution_note END,
                updated_at=$3
            WHERE id=$1
          `, [prior.id, issue.severity, new Date(report.generatedAt), detail, runId]);
          await insertIssueEvent(tx, {
            issueId: prior.id,
            runId,
            eventType: reopening ? "reopened" : "seen",
            detail: reopening ? `Reopened by crawl: ${detail}` : detail
          });
        }
      }

      if (reliableRoutes.size > 0) {
        const candidates = await tx.query<{ id: string; route: string; issue_code: string }>(`
          SELECT id::text AS id,route,issue_code
          FROM seo_crawl_issues
          WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
            AND status='open'
            AND route=ANY($1::text[])
          FOR UPDATE
        `, [[...reliableRoutes]]);
        for (const candidate of candidates.rows) {
          if (observedFingerprints.has(`${candidate.route}\u0000${candidate.issue_code}`)) continue;
          await tx.query(`
            UPDATE seo_crawl_issues
            SET status='resolved',resolved_at=$2,
                resolved_by=nullif(current_setting('app.actor_user_id',true),'')::uuid,
                resolution_note='Auto-resolved by clean re-crawl',updated_at=$2
            WHERE id=$1
          `, [candidate.id, new Date(report.generatedAt)]);
          await insertIssueEvent(tx, {
            issueId: candidate.id,
            runId,
            eventType: "auto_resolved",
            detail: "Issue absent from a reliable re-crawl of the same route."
          });
        }
      }
    });
    return { available: true, saved: true, runId: runPublicId };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "seo.crawl_persistence_failed",
      runId: runPublicId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return { available: true, saved: false, error: error instanceof Error ? error.message : "SEO crawl persistence failed." };
  }
}

export async function getSeoCrawlHistorySnapshot(principal: SessionPrincipal): Promise<SeoCrawlHistorySnapshot> {
  assertAdminPermission(principal, "content.read");
  if (!productionDatabaseConfigured()) return {
    persistenceAvailable: false,
    runs: [],
    issues: [],
    events: [],
    metrics: { open: 0, ignored: 0, resolved: 0, criticalOpen: 0, latestRunIssues: 0 }
  };
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });

  try {
    return await uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
      const [runsResult, issuesResult, eventsResult, metricsResult] = await Promise.all([
        tx.query<RunRow>(`
          SELECT r.public_id,r.origin,r.requested_limit,r.requested_count,r.completed_count,
                 r.healthy_count,r.issue_count,r.started_at,r.completed_at,u.public_id AS actor_public_id
          FROM seo_crawl_runs r
          LEFT JOIN users u ON u.id=r.actor_user_id
          WHERE r.market_id=nullif(current_setting('app.market_id',true),'')::uuid
          ORDER BY r.created_at DESC
          LIMIT $1
        `, [RUN_LIMIT]),
        tx.query<IssueRow>(`
          SELECT i.id::text AS id,i.public_id,i.route,i.issue_code,i.severity,i.status,
                 i.first_seen_at,i.last_seen_at,i.occurrence_count,i.latest_detail,
                 r.public_id AS latest_run_public_id,i.resolved_at,u.public_id AS resolved_by_public_id,
                 i.resolution_note
          FROM seo_crawl_issues i
          JOIN seo_crawl_runs r ON r.id=i.latest_run_id
          LEFT JOIN users u ON u.id=i.resolved_by
          WHERE i.market_id=nullif(current_setting('app.market_id',true),'')::uuid
          ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'ignored' THEN 1 ELSE 2 END,
                   CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                   i.last_seen_at DESC
          LIMIT $1
        `, [ISSUE_LIMIT]),
        tx.query<EventRow>(`
          SELECT e.public_id,i.public_id AS issue_public_id,i.route,e.event_type,e.detail,
                 r.public_id AS run_public_id,u.public_id AS actor_public_id,e.created_at
          FROM seo_crawl_issue_events e
          JOIN seo_crawl_issues i ON i.id=e.issue_id
          LEFT JOIN seo_crawl_runs r ON r.id=e.run_id
          LEFT JOIN users u ON u.id=e.actor_user_id
          WHERE i.market_id=nullif(current_setting('app.market_id',true),'')::uuid
          ORDER BY e.created_at DESC
          LIMIT $1
        `, [EVENT_LIMIT]),
        tx.query<{
          open_count: number | string;
          ignored_count: number | string;
          resolved_count: number | string;
          critical_open: number | string;
          latest_run_issues: number | string;
        }>(`
          SELECT
            count(*) FILTER (WHERE status='open') AS open_count,
            count(*) FILTER (WHERE status='ignored') AS ignored_count,
            count(*) FILTER (WHERE status='resolved') AS resolved_count,
            count(*) FILTER (WHERE status='open' AND severity='critical') AS critical_open,
            COALESCE((SELECT issue_count FROM seo_crawl_runs r
              WHERE r.market_id=nullif(current_setting('app.market_id',true),'')::uuid
              ORDER BY r.created_at DESC LIMIT 1),0) AS latest_run_issues
          FROM seo_crawl_issues
          WHERE market_id=nullif(current_setting('app.market_id',true),'')::uuid
        `)
      ]);

      const runs = runsResult.rows.map((row): SeoCrawlRunSummary => ({
        id: String(row.public_id),
        origin: String(row.origin),
        requestedLimit: number(row.requested_limit),
        requested: number(row.requested_count),
        completed: number(row.completed_count),
        healthy: number(row.healthy_count),
        withIssues: number(row.issue_count),
        startedAt: iso(row.started_at),
        completedAt: iso(row.completed_at),
        actorId: optionalText(row.actor_public_id)
      }));
      const issues = issuesResult.rows.map((row): SeoCrawlIssueSummary => ({
        id: String(row.public_id),
        route: String(row.route),
        code: String(row.issue_code),
        severity: row.severity,
        status: row.status,
        firstSeenAt: iso(row.first_seen_at),
        lastSeenAt: iso(row.last_seen_at),
        occurrenceCount: number(row.occurrence_count),
        detail: String(row.latest_detail),
        latestRunId: String(row.latest_run_public_id),
        resolvedAt: row.resolved_at ? iso(row.resolved_at) : undefined,
        resolvedBy: optionalText(row.resolved_by_public_id),
        resolutionNote: optionalText(row.resolution_note)
      }));
      const events = eventsResult.rows.map((row): SeoCrawlIssueEventSummary => ({
        id: String(row.public_id),
        issueId: String(row.issue_public_id),
        route: String(row.route),
        eventType: row.event_type,
        detail: String(row.detail),
        runId: optionalText(row.run_public_id),
        actorId: optionalText(row.actor_public_id),
        createdAt: iso(row.created_at)
      }));
      const metrics = metricsResult.rows[0];
      return {
        persistenceAvailable: true,
        runs,
        issues,
        events,
        metrics: {
          open: number(metrics?.open_count),
          ignored: number(metrics?.ignored_count),
          resolved: number(metrics?.resolved_count),
          criticalOpen: number(metrics?.critical_open),
          latestRunIssues: number(metrics?.latest_run_issues)
        }
      };
    }, { readOnly: true });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "seo.crawl_history_read_failed", message: error instanceof Error ? error.message : String(error) }));
    return {
      persistenceAvailable: false,
      runs: [], issues: [], events: [],
      metrics: { open: 0, ignored: 0, resolved: 0, criticalOpen: 0, latestRunIssues: 0 }
    };
  }
}

export async function updateSeoCrawlIssue(principal: SessionPrincipal, input: {
  issueId: string;
  action: "ignore" | "resolve" | "reopen";
  reason: unknown;
}): Promise<{ issueId: string; status: SeoCrawlIssueStatus }> {
  assertAdminPermission(principal, "content.write");
  if (!productionDatabaseConfigured()) throw new Error("SEO issue persistence requires PostgreSQL runtime.");
  const issueId = String(input.issueId ?? "").trim();
  if (!/^seo_issue_[a-f0-9]{32}$/i.test(issueId)) throw new Error("Invalid SEO issue reference.");
  const reason = lifecycleReason(input.reason);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });

  return uow.withTransaction({ actorUserId: principal.userId, marketId: marketCode(), platformAccess: true }, async (tx) => {
    const selected = await tx.query<{ id: string; status: SeoCrawlIssueStatus }>(`
      SELECT id::text AS id,status
      FROM seo_crawl_issues
      WHERE public_id=$1 AND market_id=nullif(current_setting('app.market_id',true),'')::uuid
      FOR UPDATE
    `, [issueId]);
    const row = selected.rows[0];
    if (!row) throw new Error("SEO issue not found.");
    const target: SeoCrawlIssueStatus = input.action === "ignore" ? "ignored" : input.action === "resolve" ? "resolved" : "open";
    if (row.status === target) throw new Error(`SEO issue is already ${target}.`);
    if (input.action === "reopen" && row.status === "open") throw new Error("SEO issue is already open.");
    const now = new Date();
    await tx.query(`
      UPDATE seo_crawl_issues
      SET status=$2,
          resolved_at=CASE WHEN $2='resolved' THEN $3 ELSE NULL END,
          resolved_by=CASE WHEN $2='resolved' THEN nullif(current_setting('app.actor_user_id',true),'')::uuid ELSE NULL END,
          resolution_note=CASE WHEN $2 IN ('resolved','ignored') THEN $4 ELSE NULL END,
          updated_at=$3
      WHERE id=$1
    `, [row.id, target, now, reason]);
    await insertIssueEvent(tx, {
      issueId: row.id,
      eventType: input.action === "ignore" ? "ignored" : input.action === "resolve" ? "resolved" : "reopened",
      detail: reason
    });
    return { issueId, status: target };
  });
}