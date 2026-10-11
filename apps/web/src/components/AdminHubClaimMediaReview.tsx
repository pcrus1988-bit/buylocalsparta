"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Entry = {
  id: string; role: string; altText: string; rightsOwner: string;
  businessName: string; claimId: string; hubCity: string;
};
const ROLE: Record<string,string> = { logo: "Λογότυπο", storefront: "Κύρια φωτογραφία", gallery: "Συλλογή" };

export function AdminHubClaimMediaReview({ items, csrfToken }: { items: Entry[]; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function decide(id: string, decision: "approved" | "rejected") {
    setBusy(id); setError("");
    try {
      const response = await fetch("/api/admin/hubs/claim-media", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ id, decision })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Αποτυχία καταχώρισης απόφασης.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Αποτυχία");
    } finally { setBusy(""); }
  }
  return <section className="shell vendor-section">
    <div className="workspace-inline-note">Οι εικόνες παραμένουν ιδιωτικές μέχρι την έγκριση. Επιβεβαίωσε ότι το αρχείο είναι κατάλληλο, τα δικαιώματα χρήσης είναι σαφή και η φωτογραφία ανήκει στην επιχείρηση.</div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!items.length && <p>Δεν υπάρχουν εκκρεμείς φωτογραφίες CLAIM.</p>}
    <div className="partner-record-command-grid">
      {items.map(item => <article key={item.id} className="partner-record-command">
        <strong>{item.businessName} · HUB {item.hubCity}</strong>
        <p>{ROLE[item.role] ?? item.role} — {item.altText}</p>
        <p>Δικαιούχος εικόνας: {item.rightsOwner}</p>
        <img src={"/api/admin/hubs/claim-media/" + encodeURIComponent(item.id)}
             alt={item.altText} style={{ width: "100%", maxHeight: 360, objectFit: "contain" }} />
        <div className="hero-actions">
          <button className="button" type="button" disabled={Boolean(busy)} onClick={() => void decide(item.id, "approved")}>Έγκριση</button>
          <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void decide(item.id, "rejected")}>Απόρριψη</button>
        </div>
      </article>)}
    </div>
  </section>;
}
