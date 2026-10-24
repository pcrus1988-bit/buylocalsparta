import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../../../lib/admin-session";
import {
  canViewPrivateResearchExperiment, privateResearchExperimentSummary,
  type PrivateExperimentAttribute, type PrivateExperimentScope
} from "../../../../../../lib/research-experiment-admin";

export const metadata: Metadata = {
  title: "Private Research · Marketplace Choice Experiment · KONTA MOY",
  robots: { index: false, follow: false, nocache: true }
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

const attributeLabels: Record<string, string> = {
  commission_pct: "Commission", monthly_fee_eur: "Monthly subscription",
  reach: "Customer reach", catalog: "Catalogue setup",
  operations: "Platform operations", stock_sync: "Stock synchronisation",
  customer_relationship: "Customer relationship"
};
const levelLabels: Record<string, string> = {
  local: "Local only", national: "Nationwide", local_national: "Local + nationwide",
  manual: "Manual", single_import: "Single import", automatic_sync: "Automatic sync",
  listing_only: "Listings only", payments: "Payments included",
  payments_shipping_returns: "Payments + shipping + returns",
  none: "No synchronisation", daily: "Daily", realtime: "Real-time",
  platform_only: "Platform-only", merchant_access: "Merchant access"
};
const attributesOrder = [
  "commission_pct","monthly_fee_eur","reach","catalog","stock_sync",
  "operations","customer_relationship"
];
function label(row: PrivateExperimentAttribute) {
  if (row.attribute === "commission_pct") return row.level + "%";
  if (row.attribute === "monthly_fee_eur") return "€" + row.level + " / month";
  return levelLabels[row.level] ?? row.level.replaceAll("_"," ");
}
const count = (value: number) => value.toLocaleString("el-GR");
const percent = (n: number, d: number) => d > 0
  ? (100 * n / d).toLocaleString("el-GR",{maximumFractionDigits:1}) + "%"
  : "—";

export default async function PrivateMarketplaceExperimentPage({
  params, searchParams
}: {
  params: Promise<{slug:string}>;
  searchParams: Promise<{scope?:string}>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!canViewPrivateResearchExperiment(principal)) notFound();
  const { slug } = await params;
  if (slug !== "greek-retail-2026") notFound();
  const scope: PrivateExperimentScope =
    (await searchParams).scope === "approved" ? "approved" : "completed";
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);

  let error = false;
  let summary: Awaited<ReturnType<typeof privateResearchExperimentSummary>> | undefined;
  try {
    summary = await privateResearchExperimentSummary(principal, slug, scope);
  } catch (cause) {
    error = true;
    console.error("private_research_experiment_summary_failed",
      cause instanceof Error ? cause.name : "unknown");
  }

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken}
      entityLabel="Research · Private Marketplace Experiment" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">KONTA MOY Research · Restricted superadmin workspace</div>
        <h1>Marketplace Choice Experiment</h1>
        <p className="lead">
          Internal EXP01 choice intelligence. This dashboard is not part of public
          research releases, public exports, or press reporting.
        </p>
        <div className="hero-actions">
          <Link prefetch={false} className="button button-secondary" href={root}>
            ← Survey overview
          </Link>
          <Link prefetch={false} className="button button-secondary" href="/admin/research/surveys">
            All research
          </Link>
        </div>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="workspace-inline-note" role="status">
        <strong>Private / internal only.</strong> Counts are based on actual recorded
        choices, not hypothetical results. A/B are anonymous positions: the
        underlying feature combinations vary between participants. No respondent
        identities or individual submissions are displayed.
      </div>
      <form method="get" action={root + "/marketplace-experiment"}
        className="workspace-queue-card" style={{display:"flex",gap:12,alignItems:"end",flexWrap:"wrap",marginTop:16}}>
        <label style={{display:"grid",gap:6,minWidth:270}}>
          Responses to include
          <select name="scope" defaultValue={scope}>
            <option value="completed">All formally completed questionnaires</option>
            <option value="approved">Main-fieldwork responses approved by QA</option>
          </select>
        </label>
        <button type="submit" className="button">Update analysis</button>
      </form>
    </section>

    {error ? <section className="shell vendor-section" role="alert">
      <div className="workspace-inline-note form-error">
        The live experiment records could not be loaded. No cached or invented values are displayed.
      </div>
    </section> : summary ? <>
      <section className="shell vendor-section">
        <div className="analytics-workflow-grid">
          {([
            ["Respondents",summary.respondents,"Completed questionnaires in this selection"],
            ["A chosen",summary.a,"Position A was selected"],
            ["B chosen",summary.b,"Position B was selected"],
            ["Neither",summary.none,"A deliberate choice of neither offer"],
            ["Unanswered tasks",summary.unanswered,"No selection recorded, NOT a rejection"],
            ["Total tasks assigned",summary.tasks,"Three possible tasks per respondent"]
          ] as const).map(([title,value,hint])=>
            <article className="analytics-workflow-card" key={title}>
              <span>{title}</span><strong>{count(value)}</strong><small>{hint}</small>
            </article>)}
        </div>
      </section>
      <section className="shell vendor-section">
        <h2>Choice completion by task</h2>
        <p>Unanswered tasks are counted separately from deliberate “neither” choices.</p>
        <div className="workspace-queue-card" style={{overflowX:"auto"}}>
          <table style={{width:"100%",textAlign:"left"}}>
            <thead><tr><th>Task</th><th>A chosen</th><th>B chosen</th>
              <th>Neither</th><th>Unanswered</th></tr></thead>
            <tbody>{[1,2,3].map(task=><tr key={task}>
              <td>{task}</td>{(["a","b","none","unanswered"] as const).map(selection=>
                <td key={selection}>{count(summary.taskChoices.find(x=>x.task_number===task && x.selection===selection)?.count ?? 0)}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section className="shell vendor-section">
        <h2>What features were actually selected?</h2>
        <p>
          For each attribute level, “Shown” counts how many randomized offers contained it.
          “Selected” counts how many of those offers were chosen. The rate is Selected ÷ Shown,
          including unanswered and “neither” tasks in the Shown denominator. These are
          descriptive offer-selection rates, not causal estimates or independent observations.
        </p>
        {attributesOrder.map(attribute=>{
          const rows = summary!.attributes.filter(x=>x.attribute===attribute)
            .sort((a,b)=>{
              if (attribute==="commission_pct" || attribute==="monthly_fee_eur")
                return Number(a.level)-Number(b.level);
              return b.chosen-a.chosen;
            });
          return <div className="workspace-queue-card" key={attribute} style={{marginTop:14}}>
            <h3>{attributeLabels[attribute] ?? attribute}</h3>
            {rows.length===0?<p>No observations.</p>:<div style={{overflowX:"auto"}}>
              <table style={{width:"100%",textAlign:"left"}}>
                <thead><tr><th>Offer feature</th><th>Shown</th>
                  <th>Selected</th><th>Selection rate</th></tr></thead>
                <tbody>{rows.map(row=><tr key={row.attribute+":"+row.level}>
                  <td>{label(row)}</td><td>{count(row.offered)}</td>
                  <td><strong>{count(row.chosen)}</strong></td>
                  <td>{percent(row.chosen,row.offered)}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          </div>;
        })}
        <div className="workspace-inline-note" style={{marginTop:16}}>
          <strong>Interpretation:</strong> Because multiple features vary together,
          raw percentages should not be treated as willingness to pay or an adjusted
          effect of a single feature. This screen does not publish results and does not
          include active or withdrawn questionnaires.
        </div>
      </section>
    </> : null}
  </main>;
}
