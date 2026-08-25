import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { assertAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { adminLocalDemandWorkspace } from "../../../lib/local-demand-service";

export const metadata: Metadata = { title: "Admin · Demand Intelligence", robots: { index: false, follow: false } };

const confidenceLabel = { qualified: "Qualified", strong: "Strong", very_strong: "Very strong" } as const;

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  assertAdminPermission(principal, "analytics.market.read");
  const data = await adminLocalDemandWorkspace(principal);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Market intelligence · privacy gated</div>
      <h1>Local Demand Intelligence</h1>
      <p className="lead">Συγκεντρωτική εικόνα πραγματικής πρόθεσης αγοράς στη Σπάρτη από Local Watch, Ask Local, zero-result αναζητήσεις, Quick Add misses και αποθηκευμένες αναζητήσεις. Καμία ατομική αναζήτηση ή ταυτότητα actor δεν εμφανίζεται.</p>
    </div></section>

    <WorkspaceMetricStrip items={[
      { label: "Qualified opportunities", value: data.metrics.qualifiedOpportunities },
      { label: "Unmet local variants", value: data.metrics.unmetVariants, tone: data.metrics.unmetVariants ? "attention" : "positive" },
      { label: "Strong signals", value: data.metrics.strongSignals },
      { label: "Active sources", value: `${data.metrics.activeSources}/5`, hint: `${data.windowDays}-day evidence window` },
      { label: "Privacy threshold", value: `${data.minimumActors}+`, hint: "distinct actors required" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ranked opportunity board" title="What Sparta is asking for" note="Score = Local Watch ×4 + canonical Ask Local ×3 + category zero-result search ×2 + resolved Quick Add miss ×2 + category saved-search intent ×1. Results below the five-actor privacy threshold are suppressed before this page receives them." />
      {data.opportunities.length === 0 ? <WorkspaceEmptyState title="No demand cluster has crossed the privacy threshold yet." body="Signals are still collected normally. This board will surface a pattern only after at least five distinct actors contribute to the same product or category cluster." /> : <div className="workspace-queue-list">
        {data.opportunities.slice(0, 30).map((item, index) => <article className="workspace-queue-card" key={item.key}>
          <div className="workspace-queue-head"><div><strong>#{index + 1} · {item.title}</strong><small>{item.kind === "variant" ? `Product · ${item.categoryCode ?? "category"}` : `Category · ${item.categoryCode}`}</small></div><span className={`status-pill${item.availableLocal === false ? " needs-attention" : ""}`}>{item.kind === "variant" && item.availableLocal === false ? "local gap" : confidenceLabel[item.confidence]}</span></div>
          <div className="workspace-queue-primary"><span>Score {item.score}</span><span>{item.signals.distinctActors}+ distinct actors</span></div>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Local Watch</strong><span>{item.signals.localWatch}</span><small>customers watching this become local/available</small></div>
            <div className="workspace-compact-row"><strong>Ask Local</strong><span>{item.signals.askLocal}</span><small>canonical private requests</small></div>
            <div className="workspace-compact-row"><strong>Zero-result search</strong><span>{item.signals.zeroResultSearch}</span><small>category-scoped searches with no result</small></div>
            <div className="workspace-compact-row"><strong>Quick Add miss</strong><span>{item.signals.quickAddMiss}</span><small>shop lookups that previously missed and were later canonically resolved</small></div>
            <div className="workspace-compact-row"><strong>Saved search</strong><span>{item.signals.savedSearch}</span><small>category alert intent</small></div>
          </div>
        </article>)}
      </div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Signal coverage" title="What the score currently knows" note="All five intended demand sources are now instrumented; raw identifiers remain outside this workspace." />
      <div className="workspace-compact-list">
        {Object.entries(data.sourceCoverage).map(([source, state]) => <div className="workspace-compact-row" key={source}><strong>{source}</strong><span>{state === "active" ? "Active" : "Not instrumented"}</span><small>{source === "zeroResultSearch" ? "Active only as category-scoped, five-actor-qualified zero-result events; raw query text is not selected." : source === "quickAddMiss" ? "Active through one-way lookup fingerprints; a miss contributes only after a later lookup resolves that fingerprint to a canonical product/category." : "Durable production signal included in scoring."}</small></div>)}
      </div>
      <p className="workspace-inline-note">Privacy boundary: no email, phone, postcode, raw search text, Ask Local description, photo, voice transcript, barcode, EAN/SKU/model lookup text or request metadata is selected into this workspace.</p>
    </section>
  </main>;
}
