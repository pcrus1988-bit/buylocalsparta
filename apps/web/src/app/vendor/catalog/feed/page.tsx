import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorProductFeedClient } from "../../../../components/VendorProductFeedClient";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { getVendorSession, vendorOperatingContextForPrincipal } from "../../../../lib/vendor-session";
import { vendorProductFeedWorkspace } from "../../../../lib/vendor-product-feed-service";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Product Feed · XML",robots:{index:false,follow:false}};

export default async function VendorProductFeedPage(){
  const principal=await getVendorSession();
  if(!principal)redirect("/vendor/login");
  const context=await vendorOperatingContextForPrincipal(principal);
  const canImport=context.capabilities.includes("catalogue.import");
  const workspace=await vendorProductFeedWorkspace(principal);
  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Προϊόντα · Product Feed</div>
        <h1>XML Feed &amp; αυτόματος συγχρονισμός</h1>
        <p className="lead">Σύνδεσε το XML του e-shop σου μία φορά. Το ΚΟΝΤΑ ΜΟΥ αναλύει, χαρτογραφεί και ελέγχει τα προϊόντα πριν τα περάσει στο υπάρχον canonical catalogue workflow — χωρίς διπλό κατάλογο και χωρίς τυφλές δημοσιεύσεις.</p>
      </div>
      <aside className="dashboard-health-card"><span>Κατάσταση</span><strong>{workspace.feeds.length ? `${workspace.feeds.length} feed${workspace.feeds.length===1?"":"s"}` : "Έτοιμο για σύνδεση"}</strong><p>URL feeds συγχρονίζονται αυτόματα. Τα uploaded XML παραμένουν ελεγχόμενα και μπορούν να αντικατασταθούν όποτε θέλεις.</p></aside>
    </section>
    {!canImport
      ? <section className="shell vendor-section"><div className="workspace-inline-note"><strong>Η εισαγωγή catalogue δεν είναι ενεργή για αυτόν τον λογαριασμό.</strong> Μπορείς να βλέπεις την κατάσταση των υπαρχόντων feeds, αλλά δεν μπορείς να δημιουργήσεις ή να αλλάξεις feed.</div><VendorProductFeedClient initialWorkspace={workspace} canImport={false} /></section>
      : <VendorProductFeedClient initialWorkspace={workspace} canImport />}
  </main>;
}
