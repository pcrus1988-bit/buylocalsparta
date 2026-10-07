"use client";

import { useState } from "react";

export function ResearchInviteLinkControl({
  slug,
  inviteId,
  csrfToken,
  canReissue
}: {
  slug: string;
  inviteId: string;
  csrfToken: string;
  canReissue: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string }>();
  const [message, setMessage] = useState("");

  async function issue() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({ action: "reissue_invite_link", inviteId })
      });
      const result = await response.json() as { token?: string; expiresAt?: string; error?: string };
      if (!response.ok || !result.token || !result.expiresAt) {
        throw new Error(result.error || "Δεν δημιουργήθηκε προσωρινός σύνδεσμος.");
      }
      setLink({
        url: window.location.origin + "/research/" + encodeURIComponent(slug) + "/t/" + encodeURIComponent(result.token),
        expiresAt: result.expiresAt
      });
      setMessage("Νέος προσωρινός σύνδεσμος. Το μυστικό εμφανίζεται μόνο σε αυτή τη συνεδρία.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Δεν δημιουργήθηκε προσωρινός σύνδεσμος.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link?.url) return;
    await navigator.clipboard.writeText(link.url);
    setMessage("Ο σύνδεσμος αντιγράφηκε.");
  }

  if (link) {
    return <div style={{ display: "grid", gap: 6, minWidth: 280 }}>
      <input aria-label="Προσωρινός προσωπικός σύνδεσμος" readOnly value={link.url} />
      <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
        <button className="button button-secondary" onClick={() => void copy()} type="button">Αντιγραφή</button>
        <small>Λήγει {new Date(link.expiresAt).toLocaleString("el-GR")}</small>
      </div>
      {message && <small>{message}</small>}
    </div>;
  }

  return <div style={{ display: "grid", gap: 6 }}>
    <button
      className="button button-secondary"
      disabled={busy || !canReissue}
      onClick={() => void issue()}
      type="button"
    >
      {busy ? "Έκδοση…" : canReissue ? "Έκδοση προσωρινού link" : "Δεν είναι διαθέσιμο"}
    </button>
    {message && <small>{message}</small>}
  </div>;
}
