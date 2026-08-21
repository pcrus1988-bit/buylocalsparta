import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import {
  WorkspaceEmptyState,
  WorkspaceMetricStrip,
  WorkspaceRecordDetails,
  WorkspaceSectionHeading
} from "../../../components/WorkspacePagePrimitives";
import {
  ACCESSIBILITY_SCOPES,
  adminAccessibilityWorkspace,
  type AccessibilityScope
} from "../../../lib/accessibility-governance";
import { getAdminSession } from "../../../lib/admin-session";
import { hasAdminPermission } from "../../../lib/admin-runtime";

const scopeLabels: Record<AccessibilityScope, string> = {
  public: "Δημόσιο site",
  customer: "Customer",
  checkout: "Checkout",
  vendor: "Vendor",
  daily: "Daily",
  admin: "Admin"
};

const statusLabels = {
  not_tested: "Not tested",
  pass: "Pass",
  fail: "Fail",
  not_applicable: "N/A"
} as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "accessibility.read")) redirect("/admin");
  const canManage = hasAdminPermission(principal, "accessibility.manage");
  const params = await searchParams;
  const selectedScope = ACCESSIBILITY_SCOPES.includes(params.scope as AccessibilityScope)
    ? params.scope as AccessibilityScope
    : "public";

  let data;
  try { data = await adminAccessibilityWorkspace(principal); } catch { redirect("/admin"); }

  const assessments = data.assessments.filter((assessment) => assessment.scope === selectedScope);
  const pass = assessments.filter((assessment) => assessment.status === "pass").length;
  const fail = assessments.filter((assessment) => assessment.status === "fail").length;
  const notApplicable = assessments.filter((assessment) => assessment.status === "not_applicable").length;
  const notTested = assessments.filter((assessment) => assessment.status === "not_tested").length;
  const openFindings = data.findings.filter((finding) => finding.status === "open" || finding.status === "in_progress");
  const selectedFindings = openFindings.filter((finding) => finding.scope === selectedScope);
  const activeReports = data.reports.filter((report) => !["resolved", "dismissed"].includes(report.status));
  const conformanceReady = fail === 0 && notTested === 0 && pass + notApplicable === assessments.length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Accessibility operations</div>
        <h1>WCAG 2.2 AA control center</h1>
        <p className="lead">Evidence-backed accessibility governance για το δημόσιο marketplace και όλα τα authenticated workspaces. Το “Pass” απαιτεί τεκμηρίωση· automated score ή accessibility overlay δεν θεωρείται απόδειξη συμμόρφωσης.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/accessibility">Δημόσια δήλωση</Link>
          {canManage && <AdminActionButton
            label={`Snapshot · ${scopeLabels[selectedScope]}`}
            endpoint="/api/admin/accessibility/action"
            csrfToken={data.csrfToken}
            body={{ kind: "audit", scope: selectedScope, method: "mixed" }}
            extraPrompt={{ field: "summary", message: "Σύντομη περίληψη του audit / verification run (προαιρετικά)." }}
          />}
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Pass", value: pass, tone: pass && !fail ? "positive" : "default", hint: `${assessments.length} criteria in scope` },
      { label: "Fail", value: fail, tone: fail ? "attention" : "positive" },
      { label: "Not tested", value: notTested, tone: notTested ? "attention" : "positive" },
      { label: "N/A", value: notApplicable },
      { label: "Open findings", value: selectedFindings.length, tone: selectedFindings.length ? "attention" : "positive" },
      { label: "Barrier reports", value: activeReports.length, tone: activeReports.length ? "attention" : "default", hint: conformanceReady ? "Scope evidence complete" : "Evidence gate not complete" }
    ]} ariaLabel={`Accessibility readiness · ${scopeLabels[selectedScope]}`} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Scope" title="Έλεγξε κάθε επιφάνεια ξεχωριστά" note="WCAG conformance πρέπει να αποδεικνύεται στις πραγματικές ροές και όχι μόνο στη δημόσια αρχική σελίδα." />
      <nav className="workspace-local-tabs" aria-label="Accessibility scopes">
        {ACCESSIBILITY_SCOPES.map((scope) => <Link key={scope} className={scope === selectedScope ? "is-active" : ""} href={`/admin/accessibility?scope=${scope}`}>{scopeLabels[scope]}</Link>)}
      </nav>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="WCAG 2.2 · A + AA"
        title={`${scopeLabels[selectedScope]} · 55 success criteria`}
        note={conformanceReady ? "Όλα τα criteria έχουν τεκμηριωμένο Pass ή N/A και δεν υπάρχει καταγεγραμμένο failure σε αυτό το scope." : "Το scope δεν είναι readiness-complete όσο υπάρχουν Fail ή Not tested criteria."}
      />
      <div className="workspace-queue-list">
        {assessments.map((assessment) => <article className="workspace-queue-card" key={`${assessment.criterionId}:${assessment.scope}`}>
          <div className="workspace-queue-head">
            <div>
              <strong>{assessment.criterionId} · {assessment.name}</strong>
              <small>{assessment.principle} · Level {assessment.level} · {assessment.method}{assessment.testedAt ? ` · ${new Date(assessment.testedAt).toLocaleString("el-GR")}` : ""}</small>
            </div>
            <span className={`status-pill${assessment.status === "fail" ? " status-attention" : assessment.status === "pass" ? " status-positive" : ""}`}>{statusLabels[assessment.status]}</span>
          </div>

          <WorkspaceRecordDetails label="Evidence & actions" open={assessment.status === "fail"}>
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Evidence</strong><span>{assessment.evidence ?? "Δεν έχει καταγραφεί ακόμη evidence."}</span></div>
              <div className="workspace-compact-row"><strong>Tested by</strong><span>{assessment.testedBy ?? "—"}</span></div>
            </div>
            {canManage && <div className="workspace-action-bar">
              <span>Κάθε tested state χρειάζεται συγκεκριμένο evidence. Ένα Fail ανοίγει αυτόματα remediation finding.</span>
              <div className="workspace-action-buttons">
                <AdminActionButton label="Pass" endpoint="/api/admin/accessibility/action" csrfToken={data.csrfToken} body={{ kind: "assessment", criterionId: assessment.criterionId, scope: selectedScope, status: "pass", method: "manual" }} extraPrompt={{ field: "evidence", message: "Evidence για το Pass (flow, browser/assistive technology, αποτέλεσμα)." }} />
                <AdminActionButton label="Fail" endpoint="/api/admin/accessibility/action" csrfToken={data.csrfToken} body={{ kind: "assessment", criterionId: assessment.criterionId, scope: selectedScope, status: "fail", method: "manual" }} extraPrompt={{ field: "evidence", message: "Περιέγραψε το failure και πώς αναπαράγεται." }} danger />
                <AdminActionButton label="N/A" endpoint="/api/admin/accessibility/action" csrfToken={data.csrfToken} body={{ kind: "assessment", criterionId: assessment.criterionId, scope: selectedScope, status: "not_applicable", method: "manual" }} extraPrompt={{ field: "evidence", message: "Τεκμηρίωσε γιατί το criterion δεν εφαρμόζεται σε αυτό το scope." }} />
                {assessment.status !== "not_tested" && <AdminActionButton label="Reset" endpoint="/api/admin/accessibility/action" csrfToken={data.csrfToken} body={{ kind: "assessment", criterionId: assessment.criterionId, scope: selectedScope, status: "not_tested", method: "manual" }} />}
              </div>
            </div>}
          </WorkspaceRecordDetails>
        </article>)}
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Remediation" title={`Open findings · ${selectedFindings.length}`} note="Failures γίνονται tracked remediation work. Verified Pass ή documented N/A κλείνει το linked criterion finding." />
      {selectedFindings.length === 0
        ? <WorkspaceEmptyState title="Δεν υπάρχουν ανοιχτά findings σε αυτό το scope." body="Αυτό δεν σημαίνει από μόνο του WCAG conformance αν υπάρχουν ακόμη Not tested criteria." />
        : <div className="workspace-queue-list">{selectedFindings.map((finding) => <article className="workspace-queue-card" key={finding.publicId}>
          <div className="workspace-queue-head"><div><strong>{finding.publicId}</strong><small>{finding.criterionId ? `WCAG ${finding.criterionId} · ` : ""}{finding.scope} · {finding.source}</small></div><span className="status-pill status-attention">{finding.severity} · {finding.status}</span></div>
          <WorkspaceRecordDetails label="Finding" open={finding.severity === "critical" || finding.severity === "high"}><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>{finding.title}</strong><span>{finding.details}</span></div>{finding.reportPublicId && <div className="workspace-compact-row"><strong>Source report</strong><span>{finding.reportPublicId}</span></div>}</div></WorkspaceRecordDetails>
        </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Accessibility feedback" title={`Barrier reports · ${data.reports.length}`} note="Οι αναφορές χρηστών μετατρέπονται σε findings όταν ξεκινήσει review. Contact details υπάρχουν μόνο όταν ο χρήστης ζήτησε επικοινωνία." />
      {data.reports.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν accessibility barrier reports." /> : <div className="workspace-queue-list">{data.reports.map((report) => <article className="workspace-queue-card" key={report.publicId}>
        <div className="workspace-queue-head"><div><strong>{report.publicId}</strong><small>{report.pagePath} · {new Date(report.createdAt).toLocaleString("el-GR")}</small></div><span className="status-pill">{report.status}</span></div>
        <WorkspaceRecordDetails label="Report" open={report.status === "submitted" || report.status === "in_review"}>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Barrier</strong><span>{report.barrier}</span></div>
            {report.expected && <div className="workspace-compact-row"><strong>Expected</strong><span>{report.expected}</span></div>}
            {report.assistiveTechnology && <div className="workspace-compact-row"><strong>Assistive technology</strong><span>{report.assistiveTechnology}</span></div>}
            {report.browserContext && <div className="workspace-compact-row"><strong>Browser context</strong><span>{report.browserContext}</span></div>}
            <div className="workspace-compact-row"><strong>Contact</strong><span>{report.consentToContact && report.contactEmail ? report.contactEmail : "No contact requested"}</span></div>
            {report.resolution && <div className="workspace-compact-row"><strong>Resolution</strong><span>{report.resolution}</span></div>}
          </div>
          {canManage && !["resolved", "dismissed"].includes(report.status) && <div className="workspace-action-bar"><span>Review state creates a tracked remediation finding.</span><div className="workspace-action-buttons">
            {report.status === "submitted" && <AdminActionButton label="Acknowledge" endpoint="/api/admin/accessibility/action" csrfToken={data.csrfToken} body={{ kind: "report", reportPublicId: report.publicId, status: "acknowledged" }} />}
            <AdminActionButton label="Start review" endpoint="/api/admin/accessibility/action" csrfToken={data.csrfToken} body={{ kind: "report", reportPublicId: report.publicId, status: "in_review" }} />
            <AdminActionButton label="Resolve" endpoint="/api/admin/accessibility/action" csrfToken={data.csrfToken} body={{ kind: "report", reportPublicId: report.publicId, status: "resolved" }} extraPrompt={{ field: "resolution", message: "Περιέγραψε τη λύση και πώς επαληθεύτηκε." }} />
            <AdminActionButton label="Dismiss" endpoint="/api/admin/accessibility/action" csrfToken={data.csrfToken} body={{ kind: "report", reportPublicId: report.publicId, status: "dismissed" }} extraPrompt={{ field: "resolution", message: "Τεκμηρίωσε γιατί η αναφορά κλείνει χωρίς remediation." }} danger />
          </div></div>}
        </WorkspaceRecordDetails>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Evidence history" title="Audit snapshots" note="Snapshots δεν δημιουργούν conformance claim· διατηρούν το evidence state που υπήρχε στο συγκεκριμένο verification run." />
      {data.audits.length === 0 ? <WorkspaceEmptyState title="Δεν έχει καταγραφεί ακόμη audit snapshot." /> : <div className="workspace-queue-list">{data.audits.map((audit) => <article className="workspace-queue-card" key={audit.publicId}><div className="workspace-queue-head"><div><strong>{audit.publicId}</strong><small>{audit.scope} · {audit.method} · {new Date(audit.completedAt).toLocaleString("el-GR")}</small></div><span className="status-pill">{audit.failCount} fail</span></div><WorkspaceRecordDetails label="Snapshot counts"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Pass</strong><span>{audit.passCount}</span></div><div className="workspace-compact-row"><strong>Fail</strong><span>{audit.failCount}</span></div><div className="workspace-compact-row"><strong>N/A</strong><span>{audit.notApplicableCount}</span></div><div className="workspace-compact-row"><strong>Not tested</strong><span>{audit.notTestedCount}</span></div>{audit.summary && <div className="workspace-compact-row"><strong>Summary</strong><span>{audit.summary}</span></div>}</div></WorkspaceRecordDetails></article>)}</div>}
    </section>
  </main>;
}
