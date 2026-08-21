import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorPickupCollectClient } from "../../../../components/VendorPickupCollectClient";
import { VendorPickupScanner } from "../../../../components/VendorPickupScanner";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceHowItWorks } from "../../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../../lib/vendor-session";
import { getVendorPickupScanPreview } from "../../../../lib/order-lifecycle";

export const metadata: Metadata = { title: "Επιβεβαίωση παραλαβής", robots: { index: false, follow: false } };

export default async function VendorPickupScanPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const principal = await getVendorSession();
  if (!principal) {
    const next = token ? `/vendor/pickup/scan?token=${encodeURIComponent(token)}` : "/vendor/pickup/scan";
    redirect(`/vendor/login?next=${encodeURIComponent(next)}`);
  }

  if (!token) {
    return <main className="vendor-app">
      <VendorWorkspaceHeader />
      <section className="shell vendor-section" style={{ maxWidth: 760 }}>
        <div className="workspace-queue-card" style={{ display: "grid", gap: 16 }}>
          <div><div className="eyebrow">Παραλαβή από κατάστημα</div><h1>Σάρωση QR πελάτη</h1><p>Άνοιξε την κάμερα και στόχευσε το QR που εμφανίζεται στην παραγγελία του πελάτη. Μόλις αναγνωριστεί, θα εμφανιστεί η σωστή παραγγελία πριν κάνεις την τελική επιβεβαίωση.</p></div>
          <VendorPickupScanner />
          <WorkspaceHowItWorks>
            <p><strong>Πριν επιβεβαιώσεις:</strong> έλεγξε ότι έχεις μπροστά σου τα σωστά προϊόντα και ότι ο πελάτης παρουσιάζει το QR της συγκεκριμένης παραγγελίας.</p>
            <p><strong>Αν ο browser δεν υποστηρίζει τον ενσωματωμένο σαρωτή:</strong> χρησιμοποίησε την κανονική εφαρμογή κάμερας του κινητού. Το QR ανοίγει αυτόματα την ίδια ασφαλή σελίδα επιβεβαίωσης.</p>
            <p><strong>Μετά την επιβεβαίωση:</strong> η παραγγελία κλείνει ως παραληφθείσα και ο πελάτης ενημερώνεται αυτόματα.</p>
          </WorkspaceHowItWorks>
        </div>
      </section>
    </main>;
  }

  try {
    const preview = await getVendorPickupScanPreview(principal, token);
    return <main className="vendor-app">
      <VendorWorkspaceHeader />
      <VendorPickupCollectClient initial={preview} token={token} csrfToken={principal.csrfToken} />
    </main>;
  } catch {
    return <main className="vendor-app">
      <VendorWorkspaceHeader />
      <section className="shell vendor-section" style={{ maxWidth: 760 }}>
        <div className="workspace-queue-card">
          <div className="eyebrow">Παραλαβή από κατάστημα</div>
          <h1>Το QR δεν μπορεί να χρησιμοποιηθεί</h1>
          <p className="form-error">Το QR δεν είναι έγκυρο, έχει λήξει ή δεν ανήκει στο συνδεδεμένο κατάστημα.</p>
          <p>Έλεγξε ότι είσαι συνδεδεμένος στο σωστό κατάστημα και σάρωσε ξανά το QR από την οθόνη του πελάτη. Αν το πρόβλημα συνεχίζεται, άνοιξε την παραγγελία αντί να ολοκληρώσεις την παράδοση χειροκίνητα.</p>
        </div>
      </section>
    </main>;
  }
}
