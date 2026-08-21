import { randomUUID } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const ACCESSIBILITY_SCOPES = ["public", "customer", "checkout", "vendor", "daily", "admin"] as const;
export type AccessibilityScope = typeof ACCESSIBILITY_SCOPES[number];
export type AccessibilityAssessmentStatus = "not_tested" | "pass" | "fail" | "not_applicable";
export type AccessibilityAuditMethod = "manual" | "automated" | "mixed";
export type AccessibilityReportStatus = "submitted" | "acknowledged" | "in_review" | "resolved" | "dismissed";

export const WCAG22_AA_CRITERIA = [
  { id: "1.1.1", level: "A", principle: "perceivable", name: "Non-text Content" },
  { id: "1.2.1", level: "A", principle: "perceivable", name: "Audio-only and Video-only (Prerecorded)" },
  { id: "1.2.2", level: "A", principle: "perceivable", name: "Captions (Prerecorded)" },
  { id: "1.2.3", level: "A", principle: "perceivable", name: "Audio Description or Media Alternative (Prerecorded)" },
  { id: "1.2.4", level: "AA", principle: "perceivable", name: "Captions (Live)" },
  { id: "1.2.5", level: "AA", principle: "perceivable", name: "Audio Description (Prerecorded)" },
  { id: "1.3.1", level: "A", principle: "perceivable", name: "Info and Relationships" },
  { id: "1.3.2", level: "A", principle: "perceivable", name: "Meaningful Sequence" },
  { id: "1.3.3", level: "A", principle: "perceivable", name: "Sensory Characteristics" },
  { id: "1.3.4", level: "AA", principle: "perceivable", name: "Orientation" },
  { id: "1.3.5", level: "AA", principle: "perceivable", name: "Identify Input Purpose" },
  { id: "1.4.1", level: "A", principle: "perceivable", name: "Use of Color" },
  { id: "1.4.2", level: "A", principle: "perceivable", name: "Audio Control" },
  { id: "1.4.3", level: "AA", principle: "perceivable", name: "Contrast (Minimum)" },
  { id: "1.4.4", level: "AA", principle: "perceivable", name: "Resize Text" },
  { id: "1.4.5", level: "AA", principle: "perceivable", name: "Images of Text" },
  { id: "1.4.10", level: "AA", principle: "perceivable", name: "Reflow" },
  { id: "1.4.11", level: "AA", principle: "perceivable", name: "Non-text Contrast" },
  { id: "1.4.12", level: "AA", principle: "perceivable", name: "Text Spacing" },
  { id: "1.4.13", level: "AA", principle: "perceivable", name: "Content on Hover or Focus" },
  { id: "2.1.1", level: "A", principle: "operable", name: "Keyboard" },
  { id: "2.1.2", level: "A", principle: "operable", name: "No Keyboard Trap" },
  { id: "2.1.4", level: "A", principle: "operable", name: "Character Key Shortcuts" },
  { id: "2.2.1", level: "A", principle: "operable", name: "Timing Adjustable" },
  { id: "2.2.2", level: "A", principle: "operable", name: "Pause, Stop, Hide" },
  { id: "2.3.1", level: "A", principle: "operable", name: "Three Flashes or Below Threshold" },
  { id: "2.4.1", level: "A", principle: "operable", name: "Bypass Blocks" },
  { id: "2.4.2", level: "A", principle: "operable", name: "Page Titled" },
  { id: "2.4.3", level: "A", principle: "operable", name: "Focus Order" },
  { id: "2.4.4", level: "A", principle: "operable", name: "Link Purpose (In Context)" },
  { id: "2.4.5", level: "AA", principle: "operable", name: "Multiple Ways" },
  { id: "2.4.6", level: "AA", principle: "operable", name: "Headings and Labels" },
  { id: "2.4.7", level: "AA", principle: "operable", name: "Focus Visible" },
  { id: "2.4.11", level: "AA", principle: "operable", name: "Focus Not Obscured (Minimum)" },
  { id: "2.5.1", level: "A", principle: "operable", name: "Pointer Gestures" },
  { id: "2.5.2", level: "A", principle: "operable", name: "Pointer Cancellation" },
  { id: "2.5.3", level: "A", principle: "operable", name: "Label in Name" },
  { id: "2.5.4", level: "A", principle: "operable", name: "Motion Actuation" },
  { id: "2.5.7", level: "AA", principle: "operable", name: "Dragging Movements" },
  { id: "2.5.8", level: "AA", principle: "operable", name: "Target Size (Minimum)" },
  { id: "3.1.1", level: "A", principle: "understandable", name: "Language of Page" },
  { id: "3.1.2", level: "AA", principle: "understandable", name: "Language of Parts" },
  { id: "3.2.1", level: "A", principle: "understandable", name: "On Focus" },
  { id: "3.2.2", level: "A", principle: "understandable", name: "On Input" },
  { id: "3.2.3", level: "AA", principle: "understandable", name: "Consistent Navigation" },
  { id: "3.2.4", level: "AA", principle: "understandable", name: "Consistent Identification" },
  { id: "3.2.6", level: "A", principle: "understandable", name: "Consistent Help" },
  { id: "3.3.1", level: "A", principle: "understandable", name: "Error Identification" },
  { id: "3.3.2", level: "A", principle: "understandable", name: "Labels or Instructions" },
  { id: "3.3.3", level: "AA", principle: "understandable", name: "Error Suggestion" },
  { id: "3.3.4", level: "AA", principle: "understandable", name: "Error Prevention (Legal, Financial, Data)" },
  { id: "3.3.7", level: "A", principle: "understandable", name: "Redundant Entry" },
  { id: "3.3.8", level: "AA", principle: "understandable", name: "Accessible Authentication (Minimum)" },
  { id: "4.1.2", level: "A", principle: "robust", name: "Name, Role, Value" },
  { id: "4.1.3", level: "AA", principle: "robust", name: "Status Messages" }
] as const;

const criterionIds = new Set<string>(WCAG22_AA_CRITERIA.map((criterion) => criterion.id));
const scopes = new Set<string>(ACCESSIBILITY_SCOPES);
const assessmentStatuses = new Set<string>(["not_tested", "pass", "fail", "not_applicable"]);
const auditMethods = new Set<string>(["manual", "automated", "mixed"]);
const reportStatuses = new Set<string>(["submitted", "acknowledged", "in_review", "resolved", "dismissed"]);

export type AccessibilityAssessment = Readonly<{
  criterionId: string;
  level: "A" | "AA";
  principle: string;
  name: string;
  scope: AccessibilityScope;
  status: AccessibilityAssessmentStatus;
  evidence?: string;
  method: "manual" | "automated" | "mixed" | "user_report";
  testedAt?: string;
  testedBy?: string;
}>;

export type AccessibilityFinding = Readonly<{
  publicId: string;
  criterionId?: string;
  scope: AccessibilityScope;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  details: string;
  status: "open" | "in_progress" | "resolved" | "accepted_risk";
  source: "manual" | "automated" | "user_report";
  reportPublicId?: string;
  openedAt: string;
  resolvedAt?: string;
}>;

export type AccessibilityReport = Readonly<{
  publicId: string;
  pagePath: string;
  barrier: string;
  expected?: string;
  assistiveTechnology?: string;
  browserContext?: string;
  contactEmail?: string;
  consentToContact: boolean;
  status: AccessibilityReportStatus;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}>;

export type AccessibilityAuditRun = Readonly<{
  publicId: string;
  scope: AccessibilityScope | "all";
  method: AccessibilityAuditMethod;
  passCount: number;
  failCount: number;
  notApplicableCount: number;
  notTestedCount: number;
  summary?: string;
  performedBy?: string;
  completedAt: string;
}>;

export type AccessibilityWorkspace = Readonly<{
  csrfToken: string;
  assessments: readonly AccessibilityAssessment[];
  findings: readonly AccessibilityFinding[];
  reports: readonly AccessibilityReport[];
  audits: readonly AccessibilityAuditRun[];
}>;

type MemoryState = {
  assessments: Map<string, AccessibilityAssessment>;
  findings: AccessibilityFinding[];
  reports: AccessibilityReport[];
  audits: AccessibilityAuditRun[];
};

const memoryKey = "__blsAccessibilityGovernance" as const;
const globals = globalThis as typeof globalThis & { [memoryKey]?: MemoryState };

function memoryState(): MemoryState {
  if (globals[memoryKey]) return globals[memoryKey]!;
  const assessments = new Map<string, AccessibilityAssessment>();
  for (const criterion of WCAG22_AA_CRITERIA) {
    for (const scope of ACCESSIBILITY_SCOPES) {
      assessments.set(`${criterion.id}:${scope}`, {
        criterionId: criterion.id,
        level: criterion.level,
        principle: criterion.principle,
        name: criterion.name,
        scope,
        status: "not_tested",
        method: "manual"
      });
    }
  }
  return globals[memoryKey] = { assessments, findings: [], reports: [], audits: [] };
}

function publicId(prefix: "a11y_report" | "a11y_find" | "a11y_audit"): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function text(value: unknown, max: number): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function validateCriterion(id: string): void {
  if (!criterionIds.has(id)) throw new Error("Unknown WCAG 2.2 A/AA criterion");
}

function validateScope(scope: string): asserts scope is AccessibilityScope {
  if (!scopes.has(scope)) throw new Error("Unsupported accessibility scope");
}

function validateAssessmentStatus(status: string): asserts status is AccessibilityAssessmentStatus {
  if (!assessmentStatuses.has(status)) throw new Error("Unsupported accessibility assessment status");
}

function validateAuditMethod(method: string): asserts method is AccessibilityAuditMethod {
  if (!auditMethods.has(method)) throw new Error("Unsupported accessibility audit method");
}

function validateReportStatus(status: string): asserts status is AccessibilityReportStatus {
  if (!reportStatuses.has(status)) throw new Error("Unsupported accessibility report status");
}

function criterionFor(id: string) {
  const criterion = WCAG22_AA_CRITERIA.find((item) => item.id === id);
  if (!criterion) throw new Error("Unknown WCAG criterion");
  return criterion;
}

export async function adminAccessibilityWorkspace(principal: SessionPrincipal): Promise<AccessibilityWorkspace> {
  assertAdminPermission(principal, "accessibility.read");
  if (!productionDatabaseConfigured()) {
    const memory = memoryState();
    return {
      csrfToken: principal.csrfToken,
      assessments: [...memory.assessments.values()],
      findings: [...memory.findings].sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
      reports: [...memory.reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      audits: [...memory.audits].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    };
  }

  const db = getProductionPostgresRuntime().sqlPool;
  const [assessmentResult, findingResult, reportResult, auditResult] = await Promise.all([
    db.query(`SELECT c.criterion_id, c.level, c.principle, c.name, a.scope, a.status, a.evidence, a.method, a.tested_at, a.tested_by
              FROM accessibility_criteria c
              JOIN accessibility_assessments a ON a.criterion_id = c.criterion_id
              ORDER BY string_to_array(c.criterion_id, '.')::int[], a.scope`),
    db.query(`SELECT f.public_id, f.criterion_id, f.scope, f.severity, f.title, f.details, f.status, f.source,
                     r.public_id AS report_public_id, f.opened_at, f.resolved_at
              FROM accessibility_findings f
              LEFT JOIN accessibility_reports r ON r.id = f.report_id
              ORDER BY f.opened_at DESC LIMIT 200`),
    db.query(`SELECT public_id, page_path, barrier, expected, assistive_technology, browser_context, contact_email,
                     consent_to_contact, status, resolution, created_at, updated_at
              FROM accessibility_reports ORDER BY created_at DESC LIMIT 100`),
    db.query(`SELECT public_id, scope, method, pass_count, fail_count, not_applicable_count, not_tested_count,
                     summary, performed_by, completed_at
              FROM accessibility_audit_runs ORDER BY completed_at DESC LIMIT 50`)
  ]);

  return {
    csrfToken: principal.csrfToken,
    assessments: assessmentResult.rows.map((row: any) => ({
      criterionId: String(row.criterion_id),
      level: row.level === "AA" ? "AA" : "A",
      principle: String(row.principle),
      name: String(row.name),
      scope: String(row.scope) as AccessibilityScope,
      status: String(row.status) as AccessibilityAssessmentStatus,
      evidence: text(row.evidence, 4000),
      method: String(row.method) as AccessibilityAssessment["method"],
      testedAt: iso(row.tested_at),
      testedBy: text(row.tested_by, 200)
    })),
    findings: findingResult.rows.map((row: any) => ({
      publicId: String(row.public_id),
      criterionId: text(row.criterion_id, 20),
      scope: String(row.scope) as AccessibilityScope,
      severity: String(row.severity) as AccessibilityFinding["severity"],
      title: String(row.title),
      details: String(row.details),
      status: String(row.status) as AccessibilityFinding["status"],
      source: String(row.source) as AccessibilityFinding["source"],
      reportPublicId: text(row.report_public_id, 80),
      openedAt: iso(row.opened_at) ?? new Date(0).toISOString(),
      resolvedAt: iso(row.resolved_at)
    })),
    reports: reportResult.rows.map((row: any) => ({
      publicId: String(row.public_id),
      pagePath: String(row.page_path),
      barrier: String(row.barrier),
      expected: text(row.expected, 2000),
      assistiveTechnology: text(row.assistive_technology, 500),
      browserContext: text(row.browser_context, 500),
      contactEmail: text(row.contact_email, 320),
      consentToContact: row.consent_to_contact === true,
      status: String(row.status) as AccessibilityReportStatus,
      resolution: text(row.resolution, 4000),
      createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
      updatedAt: iso(row.updated_at) ?? new Date(0).toISOString()
    })),
    audits: auditResult.rows.map((row: any) => ({
      publicId: String(row.public_id),
      scope: String(row.scope) as AccessibilityScope | "all",
      method: String(row.method) as AccessibilityAuditMethod,
      passCount: Number(row.pass_count ?? 0),
      failCount: Number(row.fail_count ?? 0),
      notApplicableCount: Number(row.not_applicable_count ?? 0),
      notTestedCount: Number(row.not_tested_count ?? 0),
      summary: text(row.summary, 4000),
      performedBy: text(row.performed_by, 200),
      completedAt: iso(row.completed_at) ?? new Date(0).toISOString()
    }))
  };
}

export async function adminAccessibilityAssessmentAction(principal: SessionPrincipal, input: {
  criterionId: string;
  scope: string;
  status: string;
  evidence?: string;
  method?: string;
}) {
  assertAdminPermission(principal, "accessibility.manage");
  validateCriterion(input.criterionId);
  validateScope(input.scope);
  validateAssessmentStatus(input.status);
  const method = String(input.method ?? "manual");
  validateAuditMethod(method);
  const evidence = text(input.evidence, 4000);
  if (input.status !== "not_tested" && (!evidence || evidence.length < 3)) throw new Error("Evidence is required for a tested criterion");
  const criterion = criterionFor(input.criterionId);
  const testedAt = input.status === "not_tested" ? undefined : new Date().toISOString();

  if (!productionDatabaseConfigured()) {
    const memory = memoryState();
    memory.assessments.set(`${input.criterionId}:${input.scope}`, {
      criterionId: input.criterionId,
      level: criterion.level,
      principle: criterion.principle,
      name: criterion.name,
      scope: input.scope,
      status: input.status,
      evidence,
      method,
      testedAt,
      testedBy: input.status === "not_tested" ? undefined : principal.userId
    });
    const existing = memory.findings.find((finding) => finding.criterionId === input.criterionId && finding.scope === input.scope && ["open", "in_progress"].includes(finding.status));
    if (input.status === "fail" && !existing) {
      memory.findings.push({
        publicId: publicId("a11y_find"), criterionId: input.criterionId, scope: input.scope,
        severity: "high", title: `WCAG ${input.criterionId} failed in ${input.scope}`,
        details: evidence ?? "Failed accessibility criterion", status: "open", source: method === "automated" ? "automated" : "manual",
        openedAt: new Date().toISOString()
      });
    } else if ((input.status === "pass" || input.status === "not_applicable") && existing) {
      memory.findings = memory.findings.map((finding) => finding.publicId === existing.publicId ? { ...finding, status: "resolved", resolvedAt: new Date().toISOString() } : finding);
    }
  } else {
    const client = await getProductionPostgresRuntime().sqlPool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE accessibility_assessments
         SET status=$3, evidence=$4, method=$5,
             tested_at=CASE WHEN $3='not_tested' THEN NULL ELSE now() END,
             tested_by=CASE WHEN $3='not_tested' THEN NULL ELSE $6 END,
             updated_at=now()
         WHERE criterion_id=$1 AND scope=$2`,
        [input.criterionId, input.scope, input.status, evidence ?? null, method, principal.userId]
      );
      if (updated.rowCount !== 1) throw new Error("Accessibility assessment was not found");

      if (input.status === "fail") {
        await client.query(
          `INSERT INTO accessibility_findings (public_id, criterion_id, scope, severity, title, details, status, source, opened_by)
           SELECT $1,$2,$3,'high',$4,$5,'open',$6,$7
           WHERE NOT EXISTS (
             SELECT 1 FROM accessibility_findings WHERE criterion_id=$2 AND scope=$3 AND status IN ('open','in_progress')
           )`,
          [publicId("a11y_find"), input.criterionId, input.scope, `WCAG ${input.criterionId} failed in ${input.scope}`, evidence, method === "automated" ? "automated" : "manual", principal.userId]
        );
      } else if (input.status === "pass" || input.status === "not_applicable") {
        await client.query(
          `UPDATE accessibility_findings
           SET status='resolved', resolved_by=$3, resolved_at=now(), updated_at=now()
           WHERE criterion_id=$1 AND scope=$2 AND status IN ('open','in_progress')`,
          [input.criterionId, input.scope, principal.userId]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  await recordAdminAudit(principal, "accessibility.assessment.updated", "accessibility_assessment", `${input.criterionId}:${input.scope}`, evidence, { status: input.status, method });
  return adminAccessibilityWorkspace(principal);
}

export async function adminAccessibilityAuditSnapshot(principal: SessionPrincipal, input: {
  scope: string;
  method?: string;
  summary?: string;
}) {
  assertAdminPermission(principal, "accessibility.manage");
  if (input.scope !== "all") validateScope(input.scope);
  const method = String(input.method ?? "mixed");
  validateAuditMethod(method);
  const summary = text(input.summary, 4000);
  const workspace = await adminAccessibilityWorkspace(principal);
  const rows = input.scope === "all" ? workspace.assessments : workspace.assessments.filter((assessment) => assessment.scope === input.scope);
  const counts = {
    pass: rows.filter((row) => row.status === "pass").length,
    fail: rows.filter((row) => row.status === "fail").length,
    notApplicable: rows.filter((row) => row.status === "not_applicable").length,
    notTested: rows.filter((row) => row.status === "not_tested").length
  };
  const audit: AccessibilityAuditRun = {
    publicId: publicId("a11y_audit"), scope: input.scope as AccessibilityScope | "all", method,
    passCount: counts.pass, failCount: counts.fail, notApplicableCount: counts.notApplicable, notTestedCount: counts.notTested,
    summary, performedBy: principal.userId, completedAt: new Date().toISOString()
  };

  if (!productionDatabaseConfigured()) memoryState().audits.push(audit);
  else {
    await getProductionPostgresRuntime().sqlPool.query(
      `INSERT INTO accessibility_audit_runs
       (public_id, scope, method, pass_count, fail_count, not_applicable_count, not_tested_count, summary, performed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [audit.publicId, audit.scope, audit.method, audit.passCount, audit.failCount, audit.notApplicableCount, audit.notTestedCount, audit.summary ?? null, principal.userId]
    );
  }
  await recordAdminAudit(principal, "accessibility.audit.snapshot", "accessibility_audit", audit.publicId, summary, counts);
  return adminAccessibilityWorkspace(principal);
}

export async function adminAccessibilityReportAction(principal: SessionPrincipal, input: {
  reportPublicId: string;
  status: string;
  resolution?: string;
}) {
  assertAdminPermission(principal, "accessibility.manage");
  validateReportStatus(input.status);
  const reportPublicId = String(input.reportPublicId ?? "").trim();
  if (!/^a11y_report_[a-f0-9]{32}$/.test(reportPublicId)) throw new Error("Invalid accessibility report reference");
  const resolution = text(input.resolution, 4000);
  if ((input.status === "resolved" || input.status === "dismissed") && (!resolution || resolution.length < 3)) throw new Error("Resolution is required to close an accessibility report");

  if (!productionDatabaseConfigured()) {
    const memory = memoryState();
    const index = memory.reports.findIndex((report) => report.publicId === reportPublicId);
    if (index < 0) throw new Error("Accessibility report was not found");
    const report = memory.reports[index]!;
    memory.reports[index] = { ...report, status: input.status, resolution, updatedAt: new Date().toISOString() };
    const linked = memory.findings.filter((finding) => finding.reportPublicId === reportPublicId && ["open", "in_progress"].includes(finding.status));
    if (input.status === "in_review" && linked.length === 0) {
      memory.findings.push({
        publicId: publicId("a11y_find"), scope: scopeFromPath(report.pagePath), severity: "high",
        title: `User accessibility report ${report.publicId}`, details: report.barrier, status: "open", source: "user_report",
        reportPublicId: report.publicId, openedAt: new Date().toISOString()
      });
    } else if (input.status === "resolved" || input.status === "dismissed") {
      memory.findings = memory.findings.map((finding) => finding.reportPublicId === reportPublicId && ["open", "in_progress"].includes(finding.status)
        ? { ...finding, status: "resolved", resolvedAt: new Date().toISOString() } : finding);
    }
  } else {
    const client = await getProductionPostgresRuntime().sqlPool.connect();
    try {
      await client.query("BEGIN");
      const reportResult = await client.query(
        `UPDATE accessibility_reports SET status=$2, resolution=$3, updated_at=now()
         WHERE public_id=$1 RETURNING id, page_path, barrier`,
        [reportPublicId, input.status, resolution ?? null]
      );
      if (reportResult.rowCount !== 1) throw new Error("Accessibility report was not found");
      const report = reportResult.rows[0] as any;
      if (input.status === "in_review") {
        await client.query(
          `INSERT INTO accessibility_findings (public_id, scope, severity, title, details, status, source, report_id, opened_by)
           SELECT $1,$2,'high',$3,$4,'open','user_report',$5,$6
           WHERE NOT EXISTS (SELECT 1 FROM accessibility_findings WHERE report_id=$5 AND status IN ('open','in_progress'))`,
          [publicId("a11y_find"), scopeFromPath(String(report.page_path)), `User accessibility report ${reportPublicId}`, String(report.barrier), report.id, principal.userId]
        );
      } else if (input.status === "resolved" || input.status === "dismissed") {
        await client.query(
          `UPDATE accessibility_findings SET status='resolved', resolved_by=$2, resolved_at=now(), updated_at=now()
           WHERE report_id=$1 AND status IN ('open','in_progress')`,
          [report.id, principal.userId]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }

  await recordAdminAudit(principal, "accessibility.report.updated", "accessibility_report", reportPublicId, resolution, { status: input.status });
  return adminAccessibilityWorkspace(principal);
}

export async function submitAccessibilityReport(input: {
  pagePath?: unknown;
  barrier?: unknown;
  expected?: unknown;
  assistiveTechnology?: unknown;
  browserContext?: unknown;
  contactEmail?: unknown;
  consentToContact?: unknown;
}) {
  const pagePath = normalisePagePath(input.pagePath);
  const barrier = text(input.barrier, 4000);
  if (!barrier || barrier.length < 10) throw new Error("Περιέγραψε το εμπόδιο με τουλάχιστον 10 χαρακτήρες.");
  const expected = text(input.expected, 2000);
  const assistiveTechnology = text(input.assistiveTechnology, 500);
  const browserContext = text(input.browserContext, 500);
  const consentToContact = input.consentToContact === true;
  const suppliedEmail = text(input.contactEmail, 320);
  const contactEmail = consentToContact ? suppliedEmail : undefined;
  if (consentToContact && (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) throw new Error("Χρειάζεται έγκυρο email για να επικοινωνήσουμε μαζί σου.");
  const publicReference = publicId("a11y_report");
  const now = new Date().toISOString();
  const report: AccessibilityReport = {
    publicId: publicReference, pagePath, barrier, expected, assistiveTechnology, browserContext,
    contactEmail, consentToContact, status: "submitted", createdAt: now, updatedAt: now
  };

  if (!productionDatabaseConfigured()) memoryState().reports.push(report);
  else {
    await getProductionPostgresRuntime().sqlPool.query(
      `INSERT INTO accessibility_reports
       (public_id, page_path, barrier, expected, assistive_technology, browser_context, contact_email, consent_to_contact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [publicReference, pagePath, barrier, expected ?? null, assistiveTechnology ?? null, browserContext ?? null, contactEmail ?? null, consentToContact]
    );
  }
  return { publicId: publicReference } as const;
}

function normalisePagePath(value: unknown): string {
  const raw = String(value ?? "/").trim().slice(0, 500) || "/";
  try {
    const parsed = new URL(raw, "https://kontamou.local");
    return `${parsed.pathname}${parsed.search}`.slice(0, 500) || "/";
  } catch { return "/"; }
}

function scopeFromPath(path: string): AccessibilityScope {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/vendor")) return "vendor";
  if (path.startsWith("/daily")) return "daily";
  if (path.startsWith("/checkout") || path.startsWith("/cart")) return "checkout";
  if (path.startsWith("/account")) return "customer";
  return "public";
}
