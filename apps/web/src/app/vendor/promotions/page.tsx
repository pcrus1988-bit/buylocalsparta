import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasVendorCapability } from "@buy-local-sparta/core";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";
import { requestVendorPromotion, vendorPromotionsWorkspace } from "../../../lib/vendor-self-governed-service";

export const metadata: Metadata = { title: "Προωθητικές ενέργειες HUB", robots: { index: false, follow: false } };
const euro=(minor:number)=>new Intl.NumberFormat("el-GR",{style:"currency",currency:"EUR"}).format(minor/100);
const when=(ms:number)=>new Intl.DateTimeFormat("el-GR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Athens"}).format(new Date(ms));

async function createPromotion(formData: FormData) {
  "use server";
  const principal=await getVendorSession(); if(!principal) redirect("/vendor/login");
  const price=Number(String(formData.get("promotionalPrice")??"").replace(",","."));
  const startsAt=new Date(String(formData.get("startsAt")??"")).getTime();
  const endsAt=new Date(String(formData.get("endsAt")??"")).getTime();
  await requestVendorPromotion(principal,{offerId:String(formData.get("offerId")??""),name:String(formData.get("name")??""),promotionalPriceMinor:Math.round(price*100),startsAt,endsAt,reason:String(formData.get("reason")??"")});
  revalidatePath("/vendor/promotions");
}

export default async function VendorPromotionsPage(){
  const principal=await getVendorSession(); if(!principal) redirect("/vendor/login");
  const context=await vendorOperatingContextForPrincipal(principal);
  if(!hasVendorCapability(context,"promotions.manage")) redirect("/vendor");
  const workspace=await vendorPromotionsWorkspace(principal);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">SELF_GOVERNED HUB</div><h1>Προωθητικές ενέργειες</h1><p className="lead">Πρότεινε έκπτωση για δικό σου offer. Η δημόσια τιμή αλλάζει μόνο μετά από ελεγχόμενο approval.</p></div></section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Νέα προσφορά" title="Υποβολή promotion" note="Η πρόταση δεν αλλάζει άμεσα τη δημόσια τιμή." />
      <WorkspaceHowItWorks><p><strong>Τιμή:</strong> χαμηλότερη από την τρέχουσα.</p><p><strong>Διάστημα:</strong> σαφής έναρξη και λήξη.</p><p><strong>Έγκριση:</strong> εφαρμόζεται μόνο αφού περάσει τους pricing guardrails.</p></WorkspaceHowItWorks>
      <form action={createPromotion} className="workspace-tool-panel" style={{padding:"1rem",display:"grid",gap:".9rem"}}>
        <label><strong>Προϊόν</strong><select name="offerId" required defaultValue=""><option value="" disabled>Επίλεξε προϊόν</option>{workspace.offers.map(o=><option key={o.offerId} value={o.offerId}>{o.title} · {euro(o.priceMinor)}</option>)}</select></label>
        <label><strong>Ονομασία</strong><input name="name" required minLength={2} maxLength={120} /></label>
        <label><strong>Τιμή προσφοράς (€)</strong><input name="promotionalPrice" required inputMode="decimal" /></label>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:".8rem"}}><label><strong>Έναρξη</strong><input name="startsAt" type="datetime-local" required /></label><label><strong>Λήξη</strong><input name="endsAt" type="datetime-local" required /></label></div>
        <label><strong>Αιτιολογία</strong><textarea name="reason" required minLength={2} maxLength={1000} rows={3} /></label>
        <div><button className="button" type="submit">Υποβολή για έγκριση</button></div>
      </form>
    </section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ιστορικό" title="Αιτήματα promotions" />
      {workspace.requests.length===0?<WorkspaceEmptyState title="Δεν υπάρχουν ακόμη αιτήματα." body="Οι νέες προτάσεις θα εμφανίζονται εδώ." />:<div className="workspace-queue-list">{workspace.requests.map(r=><article className="workspace-queue-card" key={r.id}><div className="workspace-queue-head"><div><strong>{r.name}</strong><small>{r.title} · {when(r.createdAt)}</small></div><span className="vendor-merchant-status">{r.status}</span></div><div className="workspace-queue-primary"><span>{euro(r.currentPriceMinor)} → {euro(r.promotionalPriceMinor)}</span><span>{when(r.startsAt)} → {when(r.endsAt)}</span></div><p className="workspace-queue-summary">{r.reason}</p>{r.reviewNote&&<small>{r.reviewNote}</small>}</article>)}</div>}
    </section>
  </main>;
}
