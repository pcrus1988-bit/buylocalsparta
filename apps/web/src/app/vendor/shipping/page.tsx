import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { VendorShippingClient } from "../../../components/VendorShippingClient";
import { WorkspaceEmptyState } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { boxNowShippingEnabled, vendorBoxNowWorkspace } from "../../../lib/boxnow-shipping-runtime";

export const metadata: Metadata = { title: "Vendor Shipping", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");

  if (!boxNowShippingEnabled()) return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Αποστολές</div><h1>Shipping</h1><p className="lead">Ο εξωτερικός courier provider δεν είναι ενεργός στο production. Δεν εμφανίζονται ψεύτικες shipping ενέργειες.</p></div></section>
    <section className="shell vendor-section"><WorkspaceEmptyState eyebrow="Provider unavailable" title="Οι αποστολές μέσω BOX NOW είναι προσωρινά κλειστές." body="Το κατάστημά σου μπορεί να συνεχίσει τις υπόλοιπες εργασίες. Τα shipping controls θα εμφανιστούν αυτόματα όταν ενεργοποιηθούν provider credentials και origin mapping." action={<Link className="button button-secondary" href="/vendor">Επιστροφή στην επισκόπηση</Link>} /></section>
  </main>;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Αποστολές</div><h1>BOX NOW shipments</h1><p className="lead">Δημιούργησε label, κατέβασε PDF και κατέγραψε handover. Η τελική παράδοση επιβεβαιώνεται μόνο από τον carrier.</p></div></section>
    <VendorShippingClient initial={await vendorBoxNowWorkspace(principal)} />
  </main>;
}
