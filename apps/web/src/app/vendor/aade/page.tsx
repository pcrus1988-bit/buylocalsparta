import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasVendorCapability } from "@buy-local-sparta/core";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";
import { requestVendorAadeAction, vendorAadeWorkspace } from "../../../lib/vendor-self-governed-service";

export const metadata: Metadata = { title: "AADE / myDATA HUB", robots: { index: false, follow: false } };
const euro=(minor:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
const when=(ms:number)=>new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(ms));

async function createAadeRequest(formData:FormData){
  "use server";
  const principal=await getVendorSession(); if(!principal) redirect("/vendor/login");
  const action=String(formData.get("action")??"review") as "review"|"retry"|"reconcile";
  await requestVendorAadeAction(principal,{documentId:String(formData.get("documentId")??""),action,note:String(formData.get("note")??"")});
  revalidatePath("/vendor/aade");
}

export default async function VendorAadePage(){
  const principal=await getVendorSession(); if(!principal) redirect("/vendor/login");
  const context=await vendorOperatingContextForPrincipal(principal);
  if(!hasVendorCapability(context,"aade.manage")) redirect("/vendor");
  const workspace=await vendorAadeWorkspace(principal);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">SELF_GOVERNED HUB</div><h1>AADE / myDATA</h1><p className="lead">Παρακολούθησε τα δικά σου παραστατικά και ζήτησε review, retry ή reconciliation χωρίς πρόσβαση σε platform credentials.</p></div></section>
    <section className="shell vendor-section">
      <WorkspaceHowItWorks><p><strong>Review:</strong> ανθρώπινος έλεγχος.</p><p><strong>Retry:</strong> νέα προσπάθεια μετάδοσης.</p><p><strong>Reconcile:</strong> αντιπαραβολή με AADE/myDATA.</p></WorkspaceHowItWorks>
      <WorkspaceSectionHeading eyebrow="Παραστατικά" title="Δικά σου tax documents" />
      {workspace.documents.length===0?<WorkspaceEmptyState title="Δεν υπάρχουν vendor tax documents." body="Όταν δημιουργηθούν σχετικά παραστατικά, θα εμφανιστούν εδώ." />:<div className="workspace-queue-list">{workspace.documents.map(d=><article className="workspace-queue-card" key={d.id}><div className="workspace-queue-head"><div><strong>{d.number??d.id}</strong><small>{d.type} · {euro(d.grossMinor)} · {when(d.createdAt)}</small></div><span className="vendor-merchant-status">{d.transmissionStatus}</span></div><div className="workspace-queue-primary"><span>MARK: {d.mark??"—"}</span><span>UID: {d.uid??"—"}</span></div>{d.lastError&&<p className="workspace-queue-summary">{d.lastError}</p>}<form action={createAadeRequest} style={{display:"flex",gap:".6rem",flexWrap:"wrap",alignItems:"end"}}><input type="hidden" name="documentId" value={d.id}/><label><small>Ενέργεια</small><select name="action" defaultValue="review"><option value="review">Review</option><option value="retry">Retry</option><option value="reconcile">Reconcile</option></select></label><label style={{flex:"1 1 260px"}}><small>Σημείωση</small><input name="note" maxLength={1000}/></label><button className="button button-secondary" type="submit">Αποστολή αιτήματος</button></form></article>)}</div>}
    </section>
    <section className="shell vendor-section"><WorkspaceSectionHeading eyebrow="Αιτήματα" title="AADE actions" />{workspace.requests.length===0?<WorkspaceEmptyState title="Δεν υπάρχουν αιτήματα." body="Τα αιτήματα θα εμφανίζονται εδώ." />:<div className="workspace-queue-list">{workspace.requests.map(r=><article className="workspace-queue-card" key={r.id}><div className="workspace-queue-head"><div><strong>{r.documentNumber??r.documentId}</strong><small>{r.action} · {when(r.createdAt)}</small></div><span className="vendor-merchant-status">{r.status}</span></div>{r.note&&<p>{r.note}</p>}{r.resolutionNote&&<small>{r.resolutionNote}</small>}</article>)}</div>}</section>
  </main>;
}
