"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export function ResearchStudyPrivacyControls({
  slug,
  csrfToken,
  studyStatus,
  linkageRetentionUntil,
  linkageDestroyedAt,
  linkageDestructionVersion
}: {
  slug: string;
  csrfToken: string;
  studyStatus: string;
  linkageRetentionUntil?: string;
  linkageDestroyedAt?: string;
  linkageDestructionVersion?: string;
}) {
  const router = useRouter();
  const initial = useMemo(() => linkageRetentionUntil ? new Date(linkageRetentionUntil).toISOString().slice(0, 16) : "", [linkageRetentionUntil]);
  const [retainUntil, setRetainUntil] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"retention" | "destroy" | null>(null);
  const [message, setMessage] = useState("");

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/research/surveys/" + encodeURIComponent(slug) + "/privacy", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Research privacy operation failed");
    return payload;
  }

  async function saveRetention() {
    setBusy("retention");
    setMessage("");
    try {
      const local = new Date(retainUntil);
      if (!retainUntil || !Number.isFinite(local.getTime())) throw new Error("Ορίστε έγκυρη ημερομηνία retention.");
      await post({ action: "set_retention_until", retainUntil: local.toISOString() });
      setMessage("Η ημερομηνία καταστροφής linkage καταχωρήθηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η ενέργεια απέτυχε.");
    } finally {
      setBusy(null);
    }
  }

  async function destroyLinkage() {
    if (!window.confirm("Η ενέργεια είναι μη αναστρέψιμη. Θα αποσυνδέσει οριστικά response από invitation/sample/contact identity. Συνέχεια;")) return;
    setBusy("destroy");
    setMessage("");
    try {
      await post({ action: "destroy_linkage", reason });
      setMessage("Το contact/company/response linkage καταστράφηκε και καταγράφηκε immutable evidence event.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Η ενέργεια απέτυχε.");
    } finally {
      setBusy(null);
    }
  }

  if (linkageDestroyedAt) {
    return <div className="workspace-inline-note">
      Identity linkage destroyed {new Date(linkageDestroyedAt).toLocaleString("el-GR")}
      {linkageDestructionVersion ? " · " + linkageDestructionVersion : ""}.
    </div>;
  }

  return <div className="workspace-queue-card">
    <div className="workspace-action-bar">
      <span>
        <strong>Privacy retention boundary</strong><br />
        Δεν υπάρχει hard-coded retention. Η ημερομηνία πρέπει να οριστεί ρητά πριν επιτραπεί irreversible unlinking.
      </span>
      <div className="workspace-action-buttons">
        <input
          aria-label="Linkage retention until"
          type="datetime-local"
          value={retainUntil}
          onChange={(event) => setRetainUntil(event.target.value)}
        />
        <button className="button button-secondary" disabled={Boolean(busy)} type="button" onClick={() => void saveRetention()}>
          {busy === "retention" ? "Αποθήκευση…" : "Ορισμός retention"}
        </button>
      </div>
    </div>
    {["published", "archived"].includes(studyStatus) && <div className="workspace-action-bar">
      <span>
        <strong>Irreversible linkage destruction</strong><br />
        Επιτρέπεται μόνο μετά από published frozen release και αφού λήξει το explicit retention deadline.
      </span>
      <div className="workspace-action-buttons">
        <input
          aria-label="Linkage destruction reason"
          placeholder="Αιτιολόγηση (τουλάχιστον 10 χαρακτήρες)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <button className="button button-secondary" disabled={Boolean(busy) || reason.trim().length < 10} type="button" onClick={() => void destroyLinkage()}>
          {busy === "destroy" ? "Καταστροφή…" : "Καταστροφή linkage"}
        </button>
      </div>
    </div>}
    {message && <div className="workspace-inline-note">{message}</div>}
  </div>;
}
