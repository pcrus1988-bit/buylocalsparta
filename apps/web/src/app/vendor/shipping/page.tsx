import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { VendorShippingClient } from "../../../components/VendorShippingClient";
import { WorkspaceEmptyState } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { boxNowShippingEnabled, vendorBoxNowWorkspace } from "../../../lib/boxnow-shipping-runtime";

export const metadata: Metadata = { title: "Αποστολές", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");

  if (!boxNowShippingEnabled()) return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Αποστολές</div><h1>Αποστολές</h1><p className="lead">Η υπηρεσία μεταφορών δεν είναι ενεργή αυτή τη στιγμή. Δεν εμφανίζονται ενέργειες αποστολής που δεν μπορούν να εκτελεστούν.</p></div></section>
    <section className="shell vendor-section"><WorkspaceEmptyState eyebrow="Υπηρεσία μη διαθέσιμη" title="Οι αποστολές μέσω BOX NOW είναι προσωρινά κλειστές." body="Το κατάστημά σου μπορεί να συνεχίσει τις υπόλοιπες εργασίες. Οι ενέργειες αποστολής θα εμφανιστούν αυτόματα όταν ολοκληρωθούν οι απαραίτητες ρυθμίσεις της υπηρεσίας." action={<Link className="button button-secondary" href="/vendor">Επιστροφή στην επισκόπηση</Link>} /></section>
  </main>;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Αποστολές</div><h1>Αποστολές BOX NOW</h1><p className="lead">Δημιούργησε ετικέτα αποστολής, κατέβασε το PDF και κατέγραψε την παράδοση στον μεταφορέα. Η τελική παράδοση επιβεβαιώνεται από την υπηρεσία μεταφοράς.</p></div></section>
    <VendorShippingClient initial={await vendorBoxNowWorkspace(principal)} />
  </main>;
}
