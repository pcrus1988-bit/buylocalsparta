"use client";

import { useState } from "react";

export function ResearchRewardAdminActions({ slug, id, csrfToken }: { slug: string; id: string; csrfToken: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function revoke() {
    if (!window.confirm("Ακύρωση κωδικού; Δεν θα μπορεί πλέον να εξαργυρωθεί. Η ενέργεια καταγράφεται.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/rewards", {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action: "revoke", entitlementId: id })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Η ακύρωση απέτυχε.");
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η ακύρωση.");
      setBusy(false);
    }
  }
  return <div style={{ display: "grid", gap: 5 }}>
    <button className="button button-secondary" type="button" disabled={busy} onClick={() => void revoke()}>
      {busy ? "Ακύρωση…" : "Ακύρωση"}
    </button>
    {error && <small role="alert" style={{ color: "#9a3028" }}>{error}</small>}
  </div>;
}
