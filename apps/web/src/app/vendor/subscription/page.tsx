import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasVendorCapability } from "@buy-local-sparta/core";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";
import { requestVendorSubscriptionChange, vendorSubscriptionWorkspace } from "../../../lib/vendor-self-governed-service";

export const metadata: Metadata = { title: "Συνδρομή HUB", robots: { index: false, follow: false } };
const euro=(minor:number|undefined)=>minor==null?"—":new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
const when=(ms:number)=>new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(ms));

async function requestChange(formData:FormData){
  "use server";
  const principal=await getVendorSession(); if(!principal) redirect("/vendor/login");
  await requestVendorSubscriptionChange(principal,{planId:String(formData.get("planId")??""),note:String(formData.get("note")??"")});
  revalidatePath("/vendor/subscription");
}

export default async function VendorSubscriptionPage(){
  const principal=await getVendorSession(); if(!principal) redirect("/vendor/login");
  const context=await vendorOperatingContextForPrincipal(principal);
  if(!hasVendorCapability(context,"subscription.manage")) redirect("/vendor");
  const workspace=await vendorSubscriptionWorkspace(principal);
  const note=workspace.current ? "Κατάσταση: "+workspace.current.status+" · commission "+(workspace.current.salesFeeBps/100).toFixed(2)+"%" : "Η αλλαγή προγράμματος περνά από ελεγχόμενο commercial workflow.";
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">SELF_GOVERNED HUB</div><h1>Συνδρομή & πρόγραμμα</h1><p className="lead">Δες το ισχύον commercial plan και ζήτησε αλλαγή σε πρόγραμμα που έχει εγκριθεί για το δικό σου market/HUB.</p></div></section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Τρέχουσα κατάσταση" title={workspace.current?.name??"Δεν υπάρχει ενεργή συνδρομή"} note={note}/>
      <WorkspaceHowItWorks><p><strong>Δεν αλλάζει αυτόματα:</strong> η υποβολή δημιουργεί αίτημα ώστε billing, συμφωνία και ημερομηνίες να παραμένουν συνεπείς.</p><p><strong>HUB scoped:</strong> εμφανίζονται μόνο plans του market στο οποίο ανήκει ο vendor.</p></WorkspaceHowItWorks>
      <form action={requestChange} className="workspace-tool-panel" style={{padding:"1rem",display:"grid",gap:".8rem"}}>
        <label><strong>Νέο πρόγραμμα</strong><select name="planId" required defaultValue=""><option value="" disabled>Επίλεξε πρόγραμμα</option>{workspace.plans.map(p=><option value={p.id} key={p.id}>{p.name} · monthly {euro(p.monthlyPriceMinor)} · annual {euro(p.annualPriceMinor)} · term {euro(p.termPriceMinor)} · commission {(p.salesFeeBps/100).toFixed(2)}%</option>)}</select></label>
        <label><strong>Σημείωση</strong><textarea name="note" maxLength={1000} rows={3}/></label>
        <div><button className="button" type="submit">Αίτημα αλλαγής</button></div>
      </form>
    </section>
    <section className="shell vendor-section"><WorkspaceSectionHeading eyebrow="Ιστορικό" title="Αιτήματα αλλαγής" />{workspace.requests.length===0?<WorkspaceEmptyState title="Δεν υπάρχουν αιτήματα αλλαγής." body="Η επόμενη υποβολή σου θα εμφανιστεί εδώ." />:<div className="workspace-queue-list">{workspace.requests.map(r=><article className="workspace-queue-card" key={r.id}><div className="workspace-queue-head"><div><strong>{r.name}</strong><small>{when(r.createdAt)}</small></div><span className="vendor-merchant-status">{r.status}</span></div>{r.note&&<p>{r.note}</p>}{r.resolutionNote&&<small>{r.resolutionNote}</small>}</article>)}</div>}</section>
  </main>;
}
