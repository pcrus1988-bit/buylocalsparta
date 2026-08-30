import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminActivationWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { WEB_BUILD_VERSION } from "../../../lib/build";

export const metadata: Metadata = { title: "Admin · Production Readiness", robots: { index: false, follow: false } };

type ActivationEvidence = Awaited<ReturnType<typeof adminActivationWorkspace>>["evidence"][number];
type GateState = "passed" | "failed" | "blocked" | "skipped" | "missing" | "expired";

const PROVIDER_GATES = [
  { key: "database", label: "Database", hint: "PostgreSQL · PostGIS · schema", match: ["postgres", "database"] },
  { key: "payments", label: "Payments", hint: "Viva OAuth · checkout · webhook", match: ["viva", "payment"] },
  { key: "tax", label: "Tax / myDATA", hint: "AADE connectivity · mapping boundary", match: ["aade", "mydata"] },
  { key: "email", label: "Transactional email", hint: "Resend domain · webhook readiness", match: ["resend", "email"] },
  { key: "search", label: "Search", hint: "Meilisearch health · index provider", match: ["meili", "search"] },
  { key: "media", label: "Media", hint: "Object storage · malware-scan boundary", match: ["storage", "clam", "media", "s3"] },
  { key: "delivery", label: "Delivery", hint: "BOX NOW / delivery provider readiness", match: ["box", "delivery"] },
  { key: "web", label: "Production web", hint: "Deployed build · readiness endpoint", match: ["web", "health", "vercel"] }
] as const;

const CORE_GATE_KEYS = new Set(["database", "payments", "tax", "email", "web"]);

function rowExpired(row: ActivationEvidence, now: number) {
  return Boolean(row.expiresAt && row.expiresAt <= now);
}

function stateForRows(rows: ActivationEvidence[], now: number): GateState {
  if (rows.length === 0) return "missing";
  if (rows.some((row) => row.status === "failed")) return "failed";
  if (rows.some((row) => row.status === "blocked")) return "blocked";
  const fresh = rows.filter((row) => !rowExpired(row, now));
  if (fresh.some((row) => row.status === "passed")) return "passed";
  if (fresh.every((row) => row.status === "skipped")) return "skipped";
  if (rows.every((row) => rowExpired(row, now))) return "expired";
  return "missing";
}

function gateSymbol(state: GateState) {
  if (state === "passed") return "●";
  if (state === "failed" || state === "blocked") return "!";
  if (state === "skipped") return "–";
  return "○";
}

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminActivationWorkspace(principal);
  const now = Date.now();
  const currentBuild = data.evidence.filter((row) => row.buildVersion === WEB_BUILD_VERSION);
  const freshPassed = currentBuild.filter((row) => row.status === "passed" && !rowExpired(row, now));
  const expired = currentBuild.filter((row) => rowExpired(row, now)).length;
  const failed = currentBuild.filter((row) => row.status === "failed").length;
  const blocked = currentBuild.filter((row) => row.status === "blocked").length;
  const skipped = currentBuild.filter((row) => row.status === "skipped").length;
  const canRun = principal.roles.includes("super_admin");

  const gates = PROVIDER_GATES.map((gate) => {
    const rows = currentBuild.filter((row) => {
      const haystack = `${row.provider} ${row.checkName}`.toLowerCase();
      return gate.match.some((needle) => haystack.includes(needle));
    });
    return { ...gate, rows, state: stateForRows(rows, now) };
  });
  const coreReady = gates.filter((gate) => CORE_GATE_KEYS.has(gate.key)).every((gate) => gate.state === "passed");
  const hasHardFailure = gates.some((gate) => gate.state === "failed" || gate.state === "blocked");
  const readyForLiveCommerce = coreReady && !hasHardFailure;

  return <main className="vendor-app admin-app admin-production-readiness" data-legacy-label="Launch Readiness">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Platform · Production Readiness · build evidence</div><h1>Production Readiness</h1><p className="lead">Build-scoped evidence showing whether the current production platform is safe to accept live commerce. Green states come only from fresh provider checks, never from configuration assumptions.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Live commerce", value: readyForLiveCommerce ? "READY" : "NOT READY", tone: readyForLiveCommerce ? "positive" : "attention", hint: readyForLiveCommerce ? "Core production gates are green." : "At least one core gate needs evidence or attention." },
      { label: "Current build", value: WEB_BUILD_VERSION },
      { label: "Fresh passed", value: freshPassed.length, tone: freshPassed.length ? "positive" : "attention" },
      { label: "Failed / blocked", value: failed + blocked, tone: failed + blocked ? "attention" : "positive", hint: `${failed} failed · ${blocked} blocked` },
      { label: "Skipped / expired", value: skipped + expired, tone: expired ? "attention" : "default", hint: `${skipped} skipped · ${expired} expired` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Production decision" title={readyForLiveCommerce ? "READY FOR LIVE COMMERCE" : "LIVE COMMERCE REMAINS GATED"} note={readyForLiveCommerce ? "Payments, tax, email, database and deployed-web evidence are fresh for this build, with no failed or blocked provider gate." : "No operator should infer readiness from configuration alone. Run the checks and clear every failed/blocked core gate before real customer money is accepted."} />
      <div className="workspace-queue-list">{gates.map((gate) => <article className="workspace-queue-card" key={gate.key}>
        <div className="workspace-queue-head"><div><strong>{gateSymbol(gate.state)} {gate.label}</strong><small>{gate.hint}</small></div><span className="status-pill">{gate.state}</span></div>
        <div className="workspace-queue-primary"><span>{gate.rows.length ? `${gate.rows.length} evidence record${gate.rows.length === 1 ? "" : "s"}` : "No current-build evidence"}</span>{CORE_GATE_KEYS.has(gate.key) && <span>Core commerce gate</span>}</div>
      </article>)}</div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Production verification" title="Run fresh provider checks" note="Checks PostgreSQL, Viva, AADE myDATA, Resend, search, object storage, BOX NOW and the deployed web. It does not create a payment, invoice, email or shipment." />
      {canRun ? <div className="workspace-inline-actions">
        <AdminActionButton label="Run production readiness checks" endpoint="/api/admin/activation/run" csrfToken={data.csrfToken} />
      </div> : <p className="workspace-muted">Running and recording production evidence is restricted to super admin. Existing evidence remains readable according to Admin permissions.</p>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Durable evidence" title="Production readiness evidence" note="Each run writes append-only, build-scoped evidence with expiry and SHA-256 digest. Secrets and credentials are not stored in the details." />
      {data.evidence.length === 0 ? <WorkspaceEmptyState title="No production-readiness evidence has been recorded." body="A super admin can run the production readiness checks above. Only checks that actually execute successfully are recorded as passed." /> : <div className="workspace-queue-list">{data.evidence.map((row) => {
        const isExpired = rowExpired(row, now);
        const isCurrent = row.buildVersion === WEB_BUILD_VERSION;
        const details = Object.entries(row.details ?? {}).filter(([, value]) => value !== undefined && value !== null);
        return <article className="workspace-queue-card" key={row.id}>
          <div className="workspace-queue-head"><div><strong>{row.provider} · {row.checkName}</strong><small>{row.environment} · {isCurrent ? "current build" : `build ${row.buildVersion}`}</small></div><span className="status-pill">{row.status}{isExpired ? " · expired" : ""}</span></div>
          <div className="workspace-queue-primary"><span>{row.checkKind}</span><span>{new Date(row.observedAt).toLocaleString("el-GR")}</span>{row.expiresAt && <span>Expires {new Date(row.expiresAt).toLocaleString("el-GR")}</span>}</div>
          <WorkspaceRecordDetails label="Evidence details & digest"><div className="workspace-compact-list">
            {details.map(([key, value]) => <div className="workspace-compact-row" key={key}><strong>{key}</strong><span>{String(value)}</span></div>)}
            <div className="workspace-compact-row"><strong>Evidence digest</strong><span>{row.evidenceDigest}</span></div>
            <div className="workspace-compact-row"><strong>Build</strong><span>{row.buildVersion}</span></div>
            <div className="workspace-compact-row"><strong>Evidence ID</strong><span>{row.id}</span></div>
          </div></WorkspaceRecordDetails>
        </article>;
      })}</div>}
    </section>
  </main>;
}
