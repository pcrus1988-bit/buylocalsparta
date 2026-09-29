import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasVendorCapability } from "@buy-local-sparta/core";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../lib/vendor-session";
import { updateVendorSeoSource, vendorSeoSourceWorkspace } from "../../../lib/vendor-seo-source-service";

export const metadata: Metadata = { title: "SEO στοιχεία HUB", robots: { index: false, follow: false } };

async function saveSeo(formData:FormData){
  "use server";
  const principal=await getVendorSession(); if(!principal) redirect("/vendor/login");
  await updateVendorSeoSource(principal,{
    shortDescription:String(formData.get("shortDescription")??""),
    story:String(formData.get("story")??""),
    expertise:String(formData.get("expertise")??""),
    seoTitle:String(formData.get("seoTitle")??""),
    seoDescription:String(formData.get("seoDescription")??"")
  });
  revalidatePath("/vendor/seo-source");
}

export default async function VendorSeoSourcePage(){
  const principal=await getVendorSession(); if(!principal) redirect("/vendor/login");
  const context=await vendorOperatingContextForPrincipal(principal);
  if(!hasVendorCapability(context,"seo.source_data.manage")) redirect("/vendor");
  const workspace=await vendorSeoSourceWorkspace(principal);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">SELF_GOVERNED HUB</div><h1>SEO & στοιχεία καταστήματος</h1><p className="lead">Βελτίωσε τα source στοιχεία του δικού σου storefront. Canonical URLs, indexing, sitemap και structured-data governance παραμένουν κεντρικά στο ΚΟΝΤΑ ΜΟΥ.</p></div></section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Source data" title="Πληροφορίες για πελάτες και αναζήτηση" note="Οι αλλαγές αφορούν μόνο το δικό σου profile content και δεν σου δίνουν πρόσβαση σε πλατφορμικές SEO ρυθμίσεις." />
      <WorkspaceHowItWorks><p><strong>SEO title/description:</strong> πηγή για την παρουσίαση της σελίδας σου, όπου επιτρέπεται.</p><p><strong>Story & expertise:</strong> βοηθούν πελάτες και search systems να καταλάβουν τι πραγματικά προσφέρει το κατάστημα.</p><p><strong>Governance:</strong> canonical, noindex/index, sitemap και schema αποφασίζονται από την πλατφόρμα.</p></WorkspaceHowItWorks>
      <form action={saveSeo} className="workspace-tool-panel" style={{padding:"1rem",display:"grid",gap:".9rem"}}>
        <label><strong>SEO title</strong><input name="seoTitle" maxLength={80} defaultValue={workspace.seoTitle}/></label>
        <label><strong>SEO description</strong><textarea name="seoDescription" maxLength={220} rows={3} defaultValue={workspace.seoDescription}/></label>
        <label><strong>Σύντομη περιγραφή</strong><textarea name="shortDescription" maxLength={600} rows={3} defaultValue={workspace.shortDescription}/></label>
        <label><strong>Ιστορία καταστήματος</strong><textarea name="story" rows={6} defaultValue={workspace.story}/></label>
        <label><strong>Εξειδίκευση</strong><textarea name="expertise" rows={5} defaultValue={workspace.expertise}/></label>
        <div><button className="button" type="submit">Αποθήκευση στοιχείων</button></div>
      </form>
    </section>
  </main>;
}
