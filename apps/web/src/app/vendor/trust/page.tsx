import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorLifecycle } from "../../../components/VendorLifecycle";
import { VendorTrustClient } from "../../../components/VendorTrustClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorTrustWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Φωτογραφίες & έγγραφα προϊόντων", robots: { index: false, follow: false } };

export default async function VendorTrustPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const workspace = await vendorTrustWorkspace(principal);
  const hasProducts = workspace.products.length > 0;
  const hasAssets = workspace.assets.length > 0;
  const pending = workspace.assets.some((asset) => !["clean", "approved", "rejected"].includes(asset.scanStatus) || !["approved", "rejected"].includes(asset.rightsStatus) || !["approved", "rejected"].includes(asset.moderationStatus))
    || workspace.documents.some((document) => !["verified", "approved", "rejected", "expired"].includes(document.status));
  const approved = workspace.assets.some((asset) => asset.scanStatus === "clean" && asset.rightsStatus === "approved" && asset.moderationStatus === "approved")
    || workspace.documents.some((document) => ["verified", "approved"].includes(document.status));

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Προϊόντα · υλικό & έγγραφα</div>
        <h1>Φωτογραφίες & έγγραφα προϊόντων</h1>
        <p className="lead">Στείλε το σωστό υλικό για το σωστό προϊόν και παρακολούθησε αν βρίσκεται σε έλεγχο, εγκρίθηκε ή χρειάζεται διόρθωση.</p>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Πορεία υποβολής" title="Από το προϊόν μέχρι την έγκριση" note="Δεν χρειάζεται να γνωρίζεις malware scan, rights review ή moderation. Αυτοί οι έλεγχοι γίνονται από το σύστημα και το ΚΟΝΤΑ ΜΟΥ." />
      <VendorLifecycle steps={[
        { label: "Επίλεξε προϊόν", tone: hasProducts ? "done" : "attention", detail: hasProducts ? "Ο κατάλογος είναι διαθέσιμος" : "Πρόσθεσε πρώτα προϊόν" },
        { label: "Επίλεξε υλικό", tone: hasAssets ? "done" : hasProducts ? "attention" : "future", detail: "Φωτογραφία, βίντεο ή PDF" },
        { label: "Στοιχεία εγγράφου", tone: hasAssets ? "current" : "future", detail: "Μόνο όταν πρόκειται για πιστοποιητικό/δήλωση" },
        { label: "Έλεγχος ΚΟΝΤΑ ΜΟΥ", tone: pending ? "waiting" : approved ? "done" : "future", detail: pending ? "Υπάρχουν υποβολές σε έλεγχο" : "Ασφάλεια, δικαιώματα και εγκυρότητα" },
        { label: "Έγκριση", tone: approved ? "done" : "future", detail: approved ? "Υπάρχει εγκεκριμένο υλικό" : "Χρήση από την πλατφόρμα" }
      ]} ariaLabel="Πορεία φωτογραφιών και εγγράφων προϊόντος" />
      <WorkspaceHowItWorks>
        <p><strong>Για φωτογραφία ή βίντεο:</strong> επίλεξε προϊόν, ανέβασε το αρχείο και δήλωσε τον κάτοχο των δικαιωμάτων.</p>
        <p><strong>Για πιστοποιητικό ή δήλωση PDF:</strong> ανέβασε το PDF και πρόσθεσε τα στοιχεία του εγγράφου ώστε να μπορεί να επαληθευτεί.</p>
        <p><strong>Δεν χρειάζεται πιστοποιητικό για κάθε προϊόν.</strong> Αν δεν υπάρχει σχετικό έγγραφο και δεν σου έχει ζητηθεί, δεν κάνεις καμία επιπλέον ενέργεια.</p>
      </WorkspaceHowItWorks>
    </section>

    <VendorTrustClient initial={workspace} />
  </main>;
}
