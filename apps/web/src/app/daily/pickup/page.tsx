import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorPickupCollectClient } from "../../../components/VendorPickupCollectClient";
import { getVendorSession } from "../../../lib/vendor-session";
import { getVendorPickupScanPreview } from "../../../lib/order-lifecycle";

export const metadata: Metadata = { title: "KONTA MOY Daily · Παραλαβή", robots: { index: false, follow: false } };

export default async function DailyPickupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const principal = await getVendorSession();
  if (!principal) redirect("/daily/login");
  if (!token) redirect("/daily/scan");

  try {
    const preview = await getVendorPickupScanPreview(principal, token);
    return <main className="vendor-app" style={{ minHeight: "100dvh", paddingTop: 24 }}>
      <VendorPickupCollectClient initial={preview} token={token} csrfToken={principal.csrfToken} returnHref="/daily" />
    </main>;
  } catch (error) {
    return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20, background: "#f6f4ee" }}>
      <section className="workspace-queue-card" style={{ width: "min(100%, 650px)", display: "grid", gap: 14 }}>
        <div className="eyebrow">KONTA MOY Daily · Secure pickup</div>
        <h1 style={{ margin: 0 }}>Το QR δεν μπορεί να χρησιμοποιηθεί</h1>
        <p className="form-error">{error instanceof Error ? error.message : "Μη έγκυρο QR παραλαβής."}</p>
        <p>Έλεγξε ότι είσαι συνδεδεμένος στο σωστό κατάστημα και σάρωσε ξανά το QR από την οθόνη του πελάτη.</p>
        <Link className="button" href="/daily/scan">Νέα σάρωση</Link>
      </section>
    </main>;
  }
}
