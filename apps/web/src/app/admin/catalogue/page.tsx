import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import {
  WorkspaceEmptyState,
  WorkspaceMetricStrip,
  WorkspaceSectionHeading
} from "../../../components/WorkspacePagePrimitives";
import {
  adminCatalogueOperationsWorkspace,
  type CatalogueOperationsQueueKey
} from "../../../lib/admin-catalogue-operations";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = {
  title: "Admin · Catalogue Operations",
  robots: { index: false, follow: false, nocache: true }
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminCatalogueOperationsWorkspace(principal);
  const automaticPending = data.automation.intelligenceRefreshPending + data.automation.canonicalizationRowsPending;

  return <main className="vendor-app admin-app admin-catalogue-operations">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Catalogue Operations" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Catalog · exception-driven operations</div>
        <h1>Catalogue Operations</h1>
        <p className="lead">One control centre for catalogue decisions. Deterministic work stays automated; this inbox shows only the structure, identity, normalization and matching decisions that still require a person.</p>
        <div className="workspace-action-bar" style={{ marginTop: "1rem" }}>
          <Link className="button button-primary" href="/admin/catalogue-intake/import">Import catalogue</Link>
          <Link className="button button-secondary" href="/admin/catalogue-intake">Supplier PIM</Link>
          <Link className="button button-secondary" href="/admin/catalogue/vendor-feeds">Vendor XML Feeds</Link>
          <Link className="button button-secondary" href="/admin/products">Products & categories</Link>
        </div>
      </div>
      <aside className="dashboard-health-card">
        <span>Operating model</span>
        <strong>{data.humanDecisionCount === 0 ? "Automation caught up" : data.humanDecisionCount.toLocaleString("el-GR") + " human decisions"}</strong>
        <p>{automaticPending > 0
          ? automaticPending.toLocaleString("el-GR") + " deterministic items are still being processed automatically and do not require manual intervention."
          : "The deterministic intake backlog is currently clear. Only governed exceptions appear below."}</p>
      </aside>
    </section>

    <WorkspaceMetricStrip ariaLabel="Catalogue operations metrics" items={[
      {
        label: "Human decisions",
        value: data.humanDecisionCount,
        tone: data.humanDecisionCount ? "attention" : "positive",
        hint: "Decision groups across all governed queues"
      },
      {
        label: "Affected evidence",
        value: data.affectedObservations,
        hint: "Products, observations and matching candidates covered by those decisions"
      },
      {
        label: "Auto intelligence",
        value: data.automation.intelligenceRefreshPending,
        tone: data.automation.intelligenceRefreshPending ? "attention" : "positive",
        hint: "Refresh jobs still owned by automation"
      },
      {
        label: "Auto canonicalization",
        value: data.automation.canonicalizationRowsPending,
        tone: data.automation.canonicalizationRowsPending ? "attention" : "positive",
        hint: "Assigned source rows the scheduled worker still owns"
      }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Work next"
        title="Single priority inbox"
        note="Priority is intentionally based on workflow blockage: strong identity conflicts first, then ambiguous structure, commercial matching, attribute meaning and controlled values. Each item opens the specialist decision panel with its governance rules intact."
      />

      {data.nextWork.length === 0
        ? <WorkspaceEmptyState
            title="No human catalogue decisions are waiting."
            body="Imports, intelligence refresh and canonicalization can continue automatically. New exceptions will appear here when a deterministic rule cannot decide safely."
          />
        : <div className="workspace-queue-list">
            {data.nextWork.map((item, index) => <Link
              key={item.key + ":" + item.id}
              href={item.href}
              className="workspace-queue-card"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="workspace-queue-head">
                <div>
                  <strong>{String(index + 1) + ". " + item.title}</strong>
                  <small>{item.context}</small>
                </div>
                <span className="status-pill">{queueLabel(item.key)}</span>
              </div>
              <div className="workspace-compact-list">
                <div className="workspace-compact-row"><strong>Decision</strong><span>{item.detail}</span></div>
                <div className="workspace-compact-row"><strong>Impact</strong><span>{item.affected.toLocaleString("el-GR")} affected</span></div>
              </div>
            </Link>)}
          </div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Decision lanes"
        title="All governed exception queues"
        note="These are not five separate workflows anymore. They are stages of the same catalogue lifecycle; use the lane only when the unified inbox sends you there."
      />
      <div className="workspace-queue-list">
        {data.queues.map((queue) => <article className="workspace-queue-card" key={queue.key}>
          <div className="workspace-queue-head">
            <div>
              <strong>{queue.label}</strong>
              <small>{queue.stage}</small>
            </div>
            <span className="status-pill">{queue.count.toLocaleString("el-GR")}</span>
          </div>
          <p>{queue.why}</p>
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Decision groups</strong><span>{queue.count.toLocaleString("el-GR")}</span></div>
            <div className="workspace-compact-row"><strong>Affected</strong><span>{queue.affected.toLocaleString("el-GR")}</span></div>
          </div>
          <div className="workspace-action-bar" style={{ marginTop: "0.75rem" }}>
            <span>{queue.count === 0 ? "No manual action is currently required." : "Open only when you are ready to make the governed decision."}</span>
            <Link className={queue.count ? "button button-primary" : "button button-secondary"} href={queue.href}>
              {queue.count ? "Review queue" : "Inspect"}
            </Link>
          </div>
        </article>)}
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Lifecycle"
        title="What happens automatically and what needs Admin"
        note="A product should move forward without repeated manual handoffs. Human decisions exist only where business context or ambiguous evidence makes automation unsafe."
      />
      <div className="workspace-compact-list">
        <div className="workspace-compact-row"><strong>1 · Import & normalization</strong><span>Admin confirms the source once. Safe rows enter Supplier PIM in one governed action.</span></div>
        <div className="workspace-compact-row"><strong>2 · Structure intelligence</strong><span>Automatic when existing category and attribute knowledge can be reused; ambiguous structure appears in this inbox.</span></div>
        <div className="workspace-compact-row"><strong>3 · Vendor context</strong><span>Admin assigns a supplier snapshot to the intended vendor once. This is a business decision, not an identity-matching task.</span></div>
        <div className="workspace-compact-row"><strong>4 · Canonical identity</strong><span>Automatic for safe evidence. Only strong-ID ambiguity or material variant conflict returns here.</span></div>
        <div className="workspace-compact-row"><strong>5 · Attribute/value normalization</strong><span>Reusable rules handle known source fields and enum values; new meanings are taught once and reused.</span></div>
        <div className="workspace-compact-row"><strong>6 · Commercial matching</strong><span>Legacy/vendor submissions that still use the submission workflow are reviewed separately from supplier identity evidence.</span></div>
        <div className="workspace-compact-row"><strong>7 · Commerce activation</strong><span>Pricing, stock confirmation, sellable offers and publication remain outside intake automation and keep their own approval boundaries.</span></div>
      </div>
    </section>
  </main>;
}

function queueLabel(key: CatalogueOperationsQueueKey): string {
  const labels: Record<CatalogueOperationsQueueKey,string> = {
    identity: "Identity",
    intelligence: "Structure",
    attribute: "Attribute",
    controlled_value: "Value",
    matching: "Matching"
  };
  return labels[key];
}
