"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminVendorVisibilityToggle({ vendorId, visible, enabled, csrfToken }: {
  vendorId: string;
  visible: boolean;
  enabled: boolean;
  csrfToken: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function change(nextVisible: boolean) {
    if (!enabled || busy) return;
    const reason = window.prompt(nextVisible ? "Reason for publishing this shop" : "Reason for hiding this shop");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setError("Χρειάζεται σύντομη αιτιολογία.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/vendors/shops/${encodeURIComponent(vendorId)}/visibility`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ visible: nextVisible, reason })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Visibility update failed");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Visibility update failed");
    } finally {
      setBusy(false);
    }
  }

  return <span className="admin-action-wrap">
    <label className="workspace-toggle-control" title={enabled ? "Public shop directory visibility" : "Only active shops can be published"}>
      <input
        type="checkbox"
        role="switch"
        checked={visible}
        disabled={!enabled || busy}
        onChange={(event) => void change(event.target.checked)}
      />
      <span>{busy ? "Ενημέρωση…" : visible ? "Ορατό δημόσια" : "Κρυφό"}</span>
    </label>
    {error && <small className="form-error" role="alert">{error}</small>}
  </span>;
}
