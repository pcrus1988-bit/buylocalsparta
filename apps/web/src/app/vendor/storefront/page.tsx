import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorLifecycle } from "../../../components/VendorLifecycle";
import { VendorStorefrontMediaClient } from "../../../components/VendorStorefrontMediaClient";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorProfileMediaWorkspace } from "../../../lib/vendor-profile-media-service";

export const metadata: Metadata = { title: "Vendor · Storefront", robots: { index: false, follow: false } };

function isPublished(asset: { publicationStatus: string; scanStatus: string; rightsStatus: string; moderationStatus: string }) {
  return asset.publicationStatus === "published" && asset.scanStatus === "clean" && asset.rightsStatus === "approved" && asset.moderationStatus === "approved";
}

export default async function VendorStorefrontPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const workspace = await vendorProfileMediaWorkspace(principal);
  const liveRoles = new Set(workspace.assignments.filter(isPublished).map((asset) => asset.role));
  const steps = [
    { label: "Λογότυπο", tone: liveRoles.has("logo") ? "done" as const : "attention" as const, detail: liveRoles.has("logo") ? "Δημοσιευμένο" : "Πρόσθεσε λογότυπο" },
    { label: "Κατάστημα", tone: liveRoles.has("storefront") ? "done" as const : "attention" as const, detail: liveRoles.has("storefront") ? "Δημοσιευμένο" : "Πρόσθεσε κύρια φωτογραφία" },
    { label: "Άνθρωποι", tone: liveRoles.has("team") ? "done" as const : "current" as const, detail: liveRoles.has("team") ? "Δημοσιευμένο" : "Προαιρετικό αλλά προτεινόμενο" },
    { label: "Gallery", tone: liveRoles.has("gallery") ? "done" as const : "future" as const, detail: liveRoles.has("gallery") ? "Υπάρχουν δημοσιευμένες εικόνες" : "Πρόσθεσε αυθεντικές φωτογραφίες" }
  ];

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Δημόσιο προφίλ</div>
        <h1>Η εικόνα του καταστήματός σου προς τον πελάτη</h1>
        <p className="lead">Οργάνωσε τις βασικές εικόνες του προφίλ σου βήμα-βήμα και έλεγξε το αποτέλεσμα όπως το βλέπει ο πελάτης.</p>
        <div className="hero-actions"><Link className="button button-secondary" href={`/vendor/${encodeURIComponent(workspace.vendorId)}`} target="_blank">Προβολή δημόσιου προφίλ ↗</Link></div>
      </div>
      <aside className="dashboard-health-card">
        <span>Δημοσίευση εικόνας</span>
        <strong>Υποβολή → έλεγχος → δημοσίευση</strong>
        <p>Η υπάρχουσα δημόσια εικόνα δεν αφαιρείται μέχρι να εγκριθεί και να δημοσιευθεί η αντικατάσταση.</p>
      </aside>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ολοκλήρωση προφίλ" title="Ξεκίνα από τα βασικά" note="Τα ολοκληρωμένα βήματα παραμένουν πράσινα. Τα σημεία που λείπουν φαίνονται άμεσα χωρίς να χρειάζεται να γνωρίζεις τη διαδικασία ελέγχου εικόνων." />
      <VendorLifecycle steps={steps} ariaLabel="Πρόοδος δημόσιου προφίλ" />
      <WorkspaceHowItWorks>
        <p><strong>Λογότυπο:</strong> χρησιμοποιείται ως βασική ταυτότητα του καταστήματος.</p>
        <p><strong>Φωτογραφία καταστήματος:</strong> βοηθά τον πελάτη να αναγνωρίσει τη φυσική επιχείρηση.</p>
        <p><strong>Άνθρωποι / ομάδα:</strong> υποστηρίζει την ανθρώπινη, συμβουλευτική ταυτότητα του ΚΟΝΤΑ ΜΟΥ.</p>
        <p><strong>Gallery:</strong> δείχνει χώρο, υπηρεσίες και εμπειρία. Οι φωτογραφίες προϊόντων διαχειρίζονται ξεχωριστά.</p>
      </WorkspaceHowItWorks>
    </section>

    <VendorStorefrontMediaClient initial={workspace} />
  </main>;
}
