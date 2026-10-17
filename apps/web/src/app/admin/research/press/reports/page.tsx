import type {Metadata} from "next";
import Link from "next/link";
import {redirect} from "next/navigation";
import {AdminWorkspaceHeader} from "../../../../../components/AdminWorkspaceHeader";
import {getAdminSession} from "../../../../../lib/admin-session";
import {hasAdminPermission} from "../../../../../lib/admin-runtime";
import {pressCampaignReport, type PressCampaignSummary} from "../../../../../lib/research-press-report";
import "../press.css";

export const metadata:Metadata={title:"Research · Press Delivery Reports · KONTA MOY",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
type Params=Promise<Record<string,string|string[]|undefined>>;
const one=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]||"":v||"";
const formatted=(v:string|Date|null|undefined)=>v
  ?new Date(v).toLocaleString("el-GR",{timeZone:"Europe/Athens",dateStyle:"medium",timeStyle:"short"}):"—";
const outcomeLabels:Record<string,string>={
  delivered:"Delivered (mail server)",complained:"Spam / abuse complaint",bounced:"Bounced",
  rejected:"Provider rejected",delivery_delayed:"Delivery delayed",accepted_unconfirmed:"SES accepted · unconfirmed",
  pending:"Pending send",held:"Held / unresolved",failed:"Send failed",suppressed:"Suppressed"
};
function fraction(count:number,denominator:number){
  return denominator>0?(100*count/denominator).toFixed(1)+"%":"—";
}
function Metrics({report}:{report:PressCampaignSummary}) {
  const rows=[
    ["Total recipients",report.total],
    ["SES accepted",report.accepted],
    ["Confirmed delivered",report.delivered],
    ["Spam complaints",report.complained],
    ["Bounced",report.bounced],
    ["Rejected",report.rejected],
    ["Delivery delayed",report.delayed],
    ["Awaiting delivery event",report.awaiting],
    ["Pending / not sent",report.pending],
    ["Suppressed",report.suppressed],
    ["Held / unclear",report.held],
    ["Failed to send",report.failed]
  ];
  return <div className="press-report-metrics">
    {rows.map(([label,value])=><div key={String(label)} className="press-report-metric">
      <span>{label}</span><strong>{value}</strong>
    </div>)}
  </div>;
}
export default async function ResearchPressReports({searchParams}:{searchParams:Params}) {
  const principal=await getAdminSession();if(!principal)redirect("/admin/login");
  if(!hasAdminPermission(principal,"research.publish.manage"))redirect("/admin");
  const params=await searchParams;
  const id=one(params.id);
  const safeId=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)?id:undefined;
  const language=one(params.language)==="el"?"el":one(params.language)==="en"?"en":"all";
  const data=await pressCampaignReport(principal,safeId);
  const selected=data.current;
  const base="/admin/research/press/reports";
  const href=(campaignId:string,lang:string="all")=>base+"?id="+encodeURIComponent(campaignId)+(lang!=="all"?"&language="+lang:"");
  const filtered=data.rows.filter(row=>language==="all"||row.language===language);
  const grandTotals=data.campaigns.reduce((a,c)=>({
    recipients:a.recipients+c.total,accepted:a.accepted+c.accepted,delivered:a.delivered+c.delivered,
    bounced:a.bounced+c.bounced,complained:a.complained+c.complained
  }),{recipients:0,accepted:0,delivered:0,bounced:0,complained:0});
  return <main className="vendor-app admin-app press-office">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Press Delivery Reports"/>
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined press-hero">
      <div><div className="eyebrow">KONTA MOY · Research communications</div>
        <h1>Press campaign reports</h1>
        <p className="lead">SES acceptance, verified delivery receipts, bounces, complaints and individual campaign outcomes.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/research/press">← Press Office</Link></div>
      </div>
      <div className="press-hero-identity"><span>DELIVERY INTELLIGENCE</span><strong>ΚΟΝΤΑ ΜΟΥ</strong><small>Evidence-based provider feedback</small></div>
    </section>
    {!data.trackingConfigured && <section className="shell press-alert press-alert-warning">
      <strong>Provider feedback not fully configured.</strong> The report displays SES-accepted messages and existing verified feedback only.
      For automatic delivery, bounce and complaint tracking, configure the SES event destination and verified SNS topic.
      Unreported delivery is shown as <strong>unconfirmed</strong>, never as delivered.
    </section>}
    <section className="shell press-card press-report-global">
      <div className="press-panel-head"><div><strong>All press campaigns</strong><small>Latest 50 campaigns · confirmed provider events only</small></div>
        <span>{data.campaigns.length} campaigns</span>
      </div>
      <div className="press-report-metrics press-report-global-metrics">
        <div className="press-report-metric"><span>Recipients</span><strong>{grandTotals.recipients}</strong></div>
        <div className="press-report-metric"><span>SES accepted</span><strong>{grandTotals.accepted}</strong></div>
        <div className="press-report-metric"><span>Delivered</span><strong>{grandTotals.delivered}</strong></div>
        <div className="press-report-metric"><span>Bounced</span><strong>{grandTotals.bounced}</strong></div>
        <div className="press-report-metric"><span>Spam complaints</span><strong>{grandTotals.complained}</strong></div>
      </div>
      <p className="press-help">Delivered = recipient mail server accepted the message, not proof of inbox placement or reading. Spam complaints are reported by receiving providers; no complaint does not mean the email avoided spam folders.</p>
    </section>
    <section className="shell press-layout press-report-layout">
      <aside className="press-sidebar">
        <div className="press-side-heading"><h2>Campaign history</h2><span>{data.campaigns.length}</span></div>
        {data.campaigns.map(c=><Link href={href(c.id)} key={c.id} className={"press-release-link"+(selected?.id===c.id?" is-selected":"")}>
          <span className="press-release-title">{c.title}</span>
          <span className="press-release-meta">{formatted(c.created_at)} · {c.total} contacts · {c.status}</span>
          <span className="press-release-meta">{c.delivered} delivered · {c.complained} complaints</span>
        </Link>)}
        {!data.campaigns.length&&<p className="press-help">No press campaigns yet. Reports will populate after sending and provider feedback.</p>}
      </aside>
      <div className="press-main">
        {selected ? <>
          <section className="press-card">
            <div className="press-panel-head"><div>
              <strong>Campaign · {selected.title}</strong>
              <small>{formatted(selected.created_at)} · {selected.status} · Greek {selected.greek} / English {selected.english}</small>
            </div><Link className="button button-secondary" href={"/admin/research/press?id="+selected.id}>Open campaign</Link></div>
            <Metrics report={selected}/>
            <div className="press-report-rate">
              <span>Confirmed delivered of SES accepted: <strong>{fraction(selected.delivered,selected.accepted)}</strong></span>
              <span>Complaints of SES accepted: <strong>{fraction(selected.complained,selected.accepted)}</strong></span>
              <span>Last provider event: <strong>{formatted(selected.lastEventAt)}</strong></span>
            </div>
          </section>
          <section className="press-card">
            <div className="press-panel-head"><div><strong>Recipient-level delivery log</strong>
              <small>Individual outcomes and last verified SES feedback. Duplicated/out-of-order events are reconciled.</small></div>
              <a className="button button-secondary" href={"/admin/research/press/reports/export?id="+selected.id}>Export CSV</a>
            </div>
            <div className="press-report-filters" aria-label="Filter recipient language">
              <Link className={language==="all"?"active":""} href={href(selected.id)}>All ({data.rows.length})</Link>
              <Link className={language==="el"?"active":""} href={href(selected.id,"el")}>🇬🇷 Greek</Link>
              <Link className={language==="en"?"active":""} href={href(selected.id,"en")}>🇬🇧 English</Link>
            </div>
            <div className="press-delivery-table-wrap"><table>
              <thead><tr><th>Recipient</th><th>Language</th><th>Outcome</th><th>SES accepted</th><th>Last feedback</th><th>Details</th></tr></thead>
              <tbody>{filtered.map(row=><tr key={row.recipient}>
                <td>{row.recipient}</td><td>{row.language.toUpperCase()}</td>
                <td><span className={"press-report-outcome press-outcome-"+row.outcome}>{outcomeLabels[row.outcome]}</span></td>
                <td>{formatted(row.sent_at)}</td><td>{formatted(row.last_event_at)}</td><td>{row.error_message||"—"}</td>
              </tr>)}
              {!filtered.length&&<tr><td colSpan={6}>No recipients in this selection.</td></tr>}</tbody>
            </table></div>
          </section>
        </> : <section className="press-card"><strong>Choose a campaign</strong><p className="press-help">Select a press release from Campaign history to inspect verified provider outcomes and export the recipient report.</p></section>}
      </div>
    </section>
  </main>;
}
