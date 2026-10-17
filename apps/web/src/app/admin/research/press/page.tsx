import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { pressWorkspace } from "../../../../lib/research-press-office";
import { getSesAccountSendingStatus,sesMailConfigFromEnv,type SesAccountSendingStatus } from "../../../../lib/admin-mail-ses";
import { PressEditorFields } from "./PressEditorFields";
import {
  deletePressDraftAction, dispatchPressAction, preparePressAction, pressListAction, savePressAction,
  suppressPressAction, testPressAction
} from "./actions";
import "./press.css";

export const metadata: Metadata = { title: "Research · Press Releases · KONTA MOY", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
type SearchParams = Promise<Record<string,string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => Array.isArray(v)?v[0]||"":v||"";
const date = (v: string | Date | null | undefined) => v
  ? new Date(v).toLocaleString("el-GR",{timeZone:"Europe/Athens",dateStyle:"medium",timeStyle:"short"}) : "—";
const labels: Record<string,string> = {
  saved: "The draft has been saved. No email was sent.",
  prepared: "Recipient list frozen. Review the queue before sending.",
  test: "SES accepted the one-recipient TEST email.",
  list: "Distribution list saved.",
  suppressed: "The email is now suppressed for subsequent press sends.",
  deleted: "The unsent draft was permanently deleted. Prepared and sent campaigns are never deleted."
};
const tally = (items: ReadonlyArray<{ status: string }>, status:string) => items.filter(d=>d.status===status).length;

export default async function ResearchPressOfficePage({searchParams}: {searchParams:SearchParams}) {
  const principal = await getAdminSession();
  if(!principal) redirect("/admin/login");
  if(!hasAdminPermission(principal,"research.publish.manage")) redirect("/admin");
  const editable = hasAdminPermission(principal,"research.publish.manage");
  const params = await searchParams;
  const id = one(params.id);
  const safeId = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)?id:undefined;
  let error = one(params.error), workspace: Awaited<ReturnType<typeof pressWorkspace>> = {
    releases: [],lists: [],current: null,deliveries: []
  };
  try { workspace=await pressWorkspace(principal,safeId); }
  catch(cause) {error=error || (cause instanceof Error?cause.message:"Press Office data is not ready.");}
  const current = workspace.current;
  const releaseUrl = "/admin/research/press";
  const locked = current !== null && current.status !== "draft";
  const pending = tally(workspace.deliveries,"pending");
  const sent = tally(workspace.deliveries,"sent");
  const failed = tally(workspace.deliveries,"failed");
  const held = tally(workspace.deliveries,"sending");
  const suppressed = tally(workspace.deliveries,"suppressed");
  const batch = one(params.batch).split("/");
  const deliverySwitchEnabled=process.env.BLS_PRESS_SENDING_ENABLED==="true";
  let sesStatus:SesAccountSendingStatus|null=null;
  let sesStatusError:string|null=null;
  try{sesStatus=await getSesAccountSendingStatus(sesMailConfigFromEnv());}
  catch(e){sesStatusError=e instanceof Error?e.message:"SES account check unavailable";}
  const deliveryReady=deliverySwitchEnabled&&sesStatus?.canSendToUnverifiedRecipients===true;
  const probation=sesStatus?.enforcementStatus==="PROBATION";

  return <main className="vendor-app admin-app press-office">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Press Office"/>
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined press-hero">
      <div><div className="eyebrow">KONTA MOY · Research communications</div>
        <h1>Press Office</h1>
        <p className="lead">Create and send branded press releases to media contacts — without mixing press outreach with survey invitations.</p>
        <div className="hero-actions"><Link href={releaseUrl} className="button">＋ New press release</Link>
          <Link href="/admin/research/surveys" className="button button-secondary">Research Control Center</Link>
          <Link href="/admin/research/press/reports" className="button button-secondary">📊 Campaign delivery reports</Link></div>
      </div>
      <div className="press-hero-identity"><span>PRESS OFFICE</span><strong>ΚΟΝΤΑ ΜΟΥ</strong><small>Developed in Sparta for Greece</small></div>
    </section>

    {error && <section className="shell press-alert press-alert-error" role="alert"><strong>Action unavailable</strong><p>{error}</p></section>}
    {labels[one(params.notice)] && <section className="shell press-alert" role="status">{labels[one(params.notice)]}</section>}
    {one(params.batch) && <section className="shell press-alert" role="status">This batch: {batch[0]} accepted by SES from {batch[1]} attempted. {batch[2]} pending for future batches. Check failed/held records before retrying.</section>}
    {!deliveryReady && <section className="shell press-alert press-alert-warning" role="status">
      <strong>Live distribution is not available.</strong>{" "}
      {!deliverySwitchEnabled?"Press distribution has not been enabled in production. ":""}
      {sesStatus&&!sesStatus.canSendToUnverifiedRecipients
        ?`SES account status: production access ${sesStatus.productionAccess?"yes":"no"}, sending ${sesStatus.sendingEnabled?"on":"off"}, reputation ${sesStatus.enforcementStatus}, review ${sesStatus.reviewStatus||"not specified"}.`
        :""}
      {sesStatusError?`Live SES account verification failed: ${sesStatusError}.`:""}
      {" "}You can still edit drafts and send individual authorized tests. Sending remains blocked until AWS confirms production access, enabled sending, sufficient quota and a permitted account status.
    </section>}
    {deliveryReady&&probation&&<section className="shell press-alert press-alert-warning" role="status">
      <strong>Live manual sending enabled — AWS SES account on PROBATION.</strong>{" "}
      AWS reports production sending enabled and review GRANTED, but the account is
      still under reputation review. Send only to appropriate editorial contacts,
      respect all opt-outs, and monitor complaints and bounces after every batch.
      Each batch requires both the normal SEND confirmation and a separate probation acknowledgement.
      No messages send automatically.
    </section>}
    {deliveryReady&&!probation&&<section className="shell press-alert" role="status">
      <strong>Press distribution available · AWS SES verified.</strong>{" "}
      Each batch sends at most eight recipients after your explicit confirmation.
      No press messages are sent automatically.
    </section>}

    <section className="shell press-layout">
      <aside className="press-sidebar" aria-label="Press release history">
        <div className="press-side-heading"><h2>Releases</h2><span>{workspace.releases.length}</span></div>
        <Link href={releaseUrl} className={!current?"press-release-link is-selected":"press-release-link"}>＋ Create a new draft</Link>
        {workspace.releases.map(item=><Link key={item.id}
          href={releaseUrl+"?id="+encodeURIComponent(item.id)}
          className={current?.id===item.id?"press-release-link is-selected":"press-release-link"}>
          <span className="press-release-title">{item.title}</span><span className="press-release-meta">{date(item.updated_at)} · {item.recipient_count} recipients</span>
          <span className={"press-status press-status-"+item.status}>{item.status}</span>
        </Link>)}
        {!workspace.releases.length&&<p className="press-help">No press releases created yet.</p>}
      </aside>

      <div className="press-main">
        <div className="press-section-heading"><div><div className="eyebrow">Editorial</div><h2>{current?"Press release · "+current.title:"Create press release"}</h2>
          <p>{locked?"This version is frozen after preparation. Create a new release to revise the content.":"Write the announcement, preview its branding and save a draft before testing or sending."}</p></div>
          {current&&<span className={"press-status press-status-"+current.status}>{current.status}</span>}
        </div>

        <form action={savePressAction} encType="multipart/form-data" className="press-edit-form">
          <input type="hidden" name="csrfToken" value={principal.csrfToken}/>
          {current&&<input type="hidden" name="id" value={current.id}/>}
          <PressEditorFields key={current?.id||"new"} editable={editable&&!locked}
            title={current?.title||""} subject={current?.subject||""}
            bodyHtml={current?.body_html||""} bodyHtmlEn={current?.body_html_en||""}
            subjectEn={current?.subject_en||""}
            recipients={current?.recipients||[]} recipientLanguages={current?.recipient_languages||{}}
            attachmentName={current?.attachment_name} attachmentNameEn={current?.attachment_name_en}
            lists={workspace.lists}/>
        </form>

        {current?.status==="draft"&&<section className="press-card press-delete-draft">
          <details>
            <summary>Delete this unsent draft</summary>
            <p className="press-help">This permanently removes only the selected unsent draft, including its content and attachments. Prepared or sent campaigns cannot be deleted.</p>
            <form action={deletePressDraftAction} className="press-action-form">
              <input type="hidden" name="csrfToken" value={principal.csrfToken}/>
              <input type="hidden" name="id" value={current.id}/>
              <label htmlFor="press-delete-confirm">Type DELETE to confirm</label>
              <input id="press-delete-confirm" name="confirmation" placeholder="DELETE" autoComplete="off" required disabled={!editable}/>
              <button className="button button-secondary" type="submit" disabled={!editable}>Permanently delete draft</button>
            </form>
          </details>
        </section>}

        {current&&<div className="press-actions-grid">
          <section className="press-card">
            <div className="press-panel-head"><div><strong>01 · Send test</strong><small>A real email to just one reviewer; does not start the distribution campaign.</small></div></div>
            <form action={testPressAction} className="press-action-form">
              <input type="hidden" name="csrfToken" value={principal.csrfToken}/>
              <input type="hidden" name="id" value={current.id}/>
              <label htmlFor="press-test-address">Test email address</label>
              <input type="email" name="testAddress" id="press-test-address" placeholder="your-address@example.com" required disabled={!editable}/>
              <label htmlFor="press-test-language">Choose test language</label>
              <select name="testLanguage" id="press-test-language" required disabled={!editable}>
                <option value="el">🇬🇷 Greek — matching Greek attachment</option>
                <option value="en">🇬🇧 English — matching English attachment</option>
              </select>
              <label className="press-check"><input type="checkbox" name="confirmTest" value="yes" required disabled={!editable}/> I understand this sends a real TEST email.</label>
              <button className="button button-secondary" type="submit" disabled={!editable}>Send test email</button>
            </form>
          </section>

          <section className="press-card">
            <div className="press-panel-head"><div><strong>02 · Prepare recipients</strong><small>Freeze the saved content and recipient addresses before live dispatch.</small></div></div>
            {current.status==="draft" ? <form action={preparePressAction} className="press-action-form">
              <input type="hidden" name="csrfToken" value={principal.csrfToken}/>
              <input type="hidden" name="id" value={current.id}/>
              <p className="press-help">{current.recipients.length} contacts from CSV (🇬🇷 {current.recipients.filter(email=>current.recipient_languages[email]==="el").length} Greek · 🇬🇧 {current.recipients.filter(email=>current.recipient_languages[email]==="en").length} English). Both matching messages and required attachments are checked before preparation.</p>
              <label htmlFor="press-prepare-confirm">Type PREPARE to freeze this version</label>
              <input id="press-prepare-confirm" name="confirm" placeholder="PREPARE" autoComplete="off" required disabled={!editable||!current.recipients.length}/>
              <button type="submit" className="button button-secondary" disabled={!editable||!current.recipients.length}>Prepare campaign (no send)</button>
            </form> : <p className="press-help">Prepared {date(current.prepared_at)}. Content and recipients are locked to prevent edits during delivery.</p>}
          </section>
        </div>}

        {current&&current.status!=="draft"&&<section className="press-card press-delivery">
          <div className="press-report-shortcut"><Link href={"/admin/research/press/reports?id="+current.id} className="button button-secondary">View delivery, bounce & spam reports →</Link></div>
          <div className="press-panel-head"><div><strong>03 · Delivery queue</strong><small>Messages are sent individually; eight recipient addresses per confirmed batch.</small></div><span className={"press-status press-status-"+current.status}>{current.status}</span></div>
          <div className="press-delivery-metrics">
            <div><span>Pending</span><strong>{pending}</strong></div>
            <div><span>Sent</span><strong>{sent}</strong></div>
            <div><span>Failed</span><strong>{failed}</strong></div>
            <div><span>Held / unclear</span><strong>{held}</strong></div>
            <div><span>Suppressed</span><strong>{suppressed}</strong></div>
          </div>
          {pending>0&&<form action={dispatchPressAction} className="press-action-form press-send-confirm">
            <input type="hidden" name="csrfToken" value={principal.csrfToken}/>
            <input type="hidden" name="id" value={current.id}/>
            <label className="press-check"><input type="checkbox" name="confirmRecipients" value="yes" required disabled={!editable||!deliveryReady}/>
              I reviewed the recipient addresses, their contact basis, the attachment and the final content.</label>
            {probation&&<label className="press-check"><input type="checkbox" name="confirmProbation" value="yes" required disabled={!editable||!deliveryReady}/>
              I understand AWS SES has placed this account on probation. I am sending only to eligible press contacts, respecting opt-outs, and accept that complaints may affect the account.</label>}
            <label htmlFor="press-send-confirm">Type SEND to dispatch the next batch of up to 8 emails</label>
            <input id="press-send-confirm" name="confirmation" placeholder="SEND" required autoComplete="off" disabled={!editable||!deliveryReady}/>
            <button type="submit" className="button" disabled={!editable||!deliveryReady}>Send next batch · max 8 recipients</button>
          </form>}
          {(failed>0||held>0)&&<p className="press-alert press-alert-warning" role="status">
            Failed or held sends are never automatically retried. Inspect the SES mailbox/outbox before deciding on a new campaign.
          </p>}
          {workspace.deliveries.length>0&&<details className="press-recipients-detail">
            <summary>View individual delivery records ({workspace.deliveries.length})</summary>
            <div className="press-delivery-table-wrap"><table><thead><tr><th>Recipient</th><th>Language</th><th>Status</th><th>Sent</th><th>Details</th></tr></thead><tbody>
              {workspace.deliveries.map(d=><tr key={d.recipient}><td>{d.recipient}</td><td>{d.language==="el"?"Greek":"English"}</td><td>{d.status}</td><td>{date(d.sent_at)}</td><td>{d.error_message||"—"}</td></tr>)}
            </tbody></table></div>
          </details>}
        </section>}
      </div>
    </section>

    <section className="shell press-support-grid">
      <section className="press-card">
        <div className="press-panel-head"><div><strong>Distribution lists</strong><small>Store newsroom contacts now; add them to any future draft.</small></div></div>
        <form action={pressListAction} className="press-action-form">
          <input type="hidden" name="csrfToken" value={principal.csrfToken}/>
          {current&&<input type="hidden" name="id" value={current.id}/>}
          <label htmlFor="press-list-name">List name</label><input id="press-list-name" name="listName" required maxLength={120} placeholder="Ελληνικός Τύπος · Οικονομία" disabled={!editable}/>
          <label htmlFor="press-list-recipients">Upload UTF-8 CSV with email and language</label>
          <input id="press-list-recipients" name="listCsv" type="file" accept=".csv,text/csv" required disabled={!editable}/>
          <p className="press-help"><code>email,language,outlet,name</code> — specify el or en for every contact.</p>
          <button className="button button-secondary" disabled={!editable} type="submit">Save / replace named list</button>
        </form>
        <div className="press-saved-lists">{workspace.lists.map(l=><div key={l.id}><strong>{l.name}</strong><span>{l.recipients.length} contacts · 🇬🇷 {l.recipients.filter(a=>l.recipient_languages[a]==="el").length} / 🇬🇧 {l.recipients.filter(a=>l.recipient_languages[a]==="en").length}</span></div>)}</div>
      </section>
      <section className="press-card">
        <div className="press-panel-head"><div><strong>Do-not-contact list</strong><small>Respect explicit opt-outs and bounced press emails before any batch.</small></div></div>
        <form action={suppressPressAction} className="press-action-form">
          <input type="hidden" name="csrfToken" value={principal.csrfToken}/>
          {current&&<input type="hidden" name="id" value={current.id}/>}
          <label htmlFor="press-suppress-email">Email to suppress</label><input type="email" name="email" id="press-suppress-email" required disabled={!editable}/>
          <label htmlFor="press-suppress-reason">Reason</label><select name="reason" id="press-suppress-reason" disabled={!editable}>
            <option value="opt_out">Unsubscribe / opt-out</option><option value="bounce">Bounce</option><option value="complaint">Complaint</option><option value="operator">Manual removal</option>
          </select>
          <button type="submit" className="button button-secondary" disabled={!editable}>Suppress recipient</button>
        </form>
        <p className="press-help">Media lists are separate from survey participants. Only use legitimate press contacts; comply with applicable electronic communications rules and promptly honour opt-outs.</p>
      </section>
    </section>
  </main>;
}
