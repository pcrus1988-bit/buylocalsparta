import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorPickupCollectClient } from "../../../../components/VendorPickupCollectClient";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
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
        <div className="workspace-queue-card">
          <div className="eyebrow">Secure pickup</div>
          <h1>Σάρωση QR πελάτη</h1>
          <p>Άνοιξε την κάμερα του κινητού του καταστήματος και σάρωσε το QR που εμφανίζεται στην παραγγελία του πελάτη. Το QR ανοίγει αυτόματα αυτή τη σελίδα με την αντίστοιχη παραγγελία για τελική επιβεβαίωση.</p>
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
  } catch (error) {
    return <main className="vendor-app">
      <VendorWorkspaceHeader />
      <section className="shell vendor-section" style={{ maxWidth: 760 }}>
        <div className="workspace-queue-card">
          <div className="eyebrow">Secure pickup</div>
          <h1>Το QR δεν μπορεί να χρησιμοποιηθεί</h1>
          <p className="form-error">{error instanceof Error ? error.message : "Μη έγκυρο QR παραλαβής."}</p>
          <p>Έλεγξε ότι είσαι συνδεδεμένος στο σωστό κατάστημα και σάρωσε ξανά το QR από την οθόνη του πελάτη.</p>
        </div>
      </section>
    </main>;
  }
}
