import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { getRetailStudyDashboard } from "../../../lib/retail-study-2026-runtime";

export const metadata: Metadata = {
  title: "Admin · Έρευνα Ελληνικού Λιανεμπορίου 2026",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "vendor.manage")) redirect("/admin");

  const dashboard = await getRetailStudyDashboard();

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Retail 2026" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">RESEARCH · 2026</div>
        <h1>Έρευνα Ελληνικού Λιανεμπορίου 2026</h1>
        <p className="lead">Ελεγχόμενο sampling frame, versioned questionnaire, pseudonymous responses, reproducible weighting και ξεχωριστό permission ledger.</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="admin-local-tabs" aria-label="Research navigation">
        <Link href="/admin/partners/gemi">ΓΕΜΗ frame</Link>
        <Link className="active" href="/admin/research/retail-2026" aria-current="page">Έρευνα 2026</Link>
      </div>

      <WorkspaceSectionHeading
        eyebrow="Study status"
        title={dashboard.study.status === "draft" ? "Draft — δεν έχει ανοίξει fieldwork" : dashboard.study.status}
        note="Το questionnaire και η μεθοδολογία παγώνουν μόλις αρχίσει fieldwork ή δημιουργηθούν invitations. Τα αποτελέσματα δεν πρέπει να δημοσιεύονται χωρίς raw N, weighted base και limitation statement."
      />

      <div className="dashboard-grid">
        <Metric label="Sampling-frame population" value={formatNumber(dashboard.population)} />
        <Metric label="Completed responses" value={formatNumber(dashboard.completed)} />
        <Metric label="Response rate" value={dashboard.responseRate == null ? "—" : formatPercent(dashboard.responseRate)} />
        <Metric label="Effective weighted N" value={dashboard.effectiveBase ? String(dashboard.effectiveBase) : "—"} />
        <Metric label="Digital readiness" value={dashboard.weightedDigitalReadiness == null ? "—" : dashboard.weightedDigitalReadiness + "/100"} />
        <Metric label="Commerce friction" value={dashboard.weightedCommerceFriction == null ? "—" : dashboard.weightedCommerceFriction + "/100"} />
        <Metric label="KONTA MOY interest · pending" value={formatNumber(dashboard.permissionPending)} />
        <Metric label="KONTA MOY interest · confirmed" value={formatNumber(dashboard.permissionConfirmed)} />
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Comparisons"
        title="Weighted sector comparison"
        note="Οι σταθμίσεις χρησιμοποιούν το frozen sector×prefecture frame. Για census-invitation/non-probability αποτελέσματα δεν εμφανίζεται συμβατικό margin of error."
      />
      {dashboard.sectorComparisons.length ? <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Κλάδος</th><th>Raw N</th><th>Digital readiness</th><th>Commerce friction</th></tr></thead>
          <tbody>{dashboard.sectorComparisons.map((row) => <tr key={row.sector}>
            <td>{row.sector}</td>
            <td>{formatNumber(row.rawBase)}</td>
            <td>{row.weightedDigitalReadiness == null ? "—" : row.weightedDigitalReadiness + "/100"}</td>
            <td>{row.weightedCommerceFriction == null ? "—" : row.weightedCommerceFriction + "/100"}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="panel"><p>Δεν υπάρχουν ακόμη ολοκληρωμένες απαντήσεις. Η σελίδα είναι έτοιμη να παράγει συγκρίσεις μόλις φορτωθεί το sampling frame και ξεκινήσει fieldwork.</p></div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Scientific guardrails"
        title="Τι θα θεωρούμε δημοσιεύσιμο αποτέλεσμα"
        note="Ελάχιστο raw subgroup N=30, warning κάτω από 50, πάντα denominator/missing base, frozen instrument hash και reproducible analysis snapshot. Probability intervals μόνο όταν η επιλογή δείγματος έχει καταγραφεί ως πραγματικό stratified probability sample."
      />
      <div className="panel">
        <p><strong>Privacy separation:</strong> contact/invitation identity και survey answers βρίσκονται σε διαφορετικούς πίνακες. Το Admin reporting δεν χρειάζεται email για να υπολογίσει κανένα αποτέλεσμα.</p>
        <p><strong>Non-response:</strong> η στάθμιση σε ΓΕΜΗ sector×prefecture διορθώνει γνωστή σύνθεση του δείγματος, όχι άγνωστη non-response bias. Αυτό θα αναφέρεται ρητά στη δημοσίευση.</p>
        <p><strong>Reproducibility:</strong> instrument, methodology, sampling frame και result payloads έχουν SHA-256 evidence και μπορούν να αποθηκευτούν ως immutable analysis snapshots.</p>
      </div>
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <article className="panel"><div className="eyebrow">{label}</div><strong style={{ fontSize: "1.55rem" }}>{value}</strong></article>;
}
function formatNumber(value: number): string { return new Intl.NumberFormat("el-GR").format(value); }
function formatPercent(value: number): string { return new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(value); }
