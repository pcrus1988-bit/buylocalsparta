"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./AdminProductLifecycleActions.module.css";

type LifecycleState = {
  submissionStatus: string;
  offerStatus?: string;
  archived: boolean;
  activationRequest?: { id: string; status: string; requestedAt: number; resolutionNote?: string };
};

export function AdminProductLifecycleActions({ submissionId, submissionStatus, csrfToken }: { submissionId: string; submissionStatus: string; csrfToken: string }) {
  const router = useRouter();
  const [state, setState] = useState<LifecycleState>({ submissionStatus, archived: submissionStatus === "archived" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/catalog/lifecycle?submissionId=${encodeURIComponent(submissionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as LifecycleState & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load product lifecycle state");
        if (active) setState(payload);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load product lifecycle state"); });
    return () => { active = false; };
  }, [submissionId]);

  async function post(action: "archive" | "reactivate" | "delete", reason: string, acknowledged = false) {
    setBusy(action);
    setError("");
    try {
      const response = await fetch("/api/admin/catalog/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ action, submissionId, reason, acknowledged })
      });
      const payload = await response.json() as { error?: string; status?: string; deleted?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "Product lifecycle action failed");
      setDeleteOpen(false);
      setAcknowledged(false);
      setDeleteReason("");
      if (!payload.deleted) {
        const nextStatus = payload.status ?? (action === "archive" ? "archived" : state.submissionStatus);
        setState((current) => ({
          ...current,
          archived: nextStatus === "archived",
          submissionStatus: nextStatus,
          offerStatus: action === "archive" ? (current.offerStatus ? "archived" : current.offerStatus) : action === "reactivate" ? (current.offerStatus ? "approved" : current.offerStatus) : current.offerStatus,
          activationRequest: action === "reactivate" && current.activationRequest ? { ...current.activationRequest, status: "approved" } : current.activationRequest
        }));
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Product lifecycle action failed");
    } finally {
      setBusy("");
    }
  }

  function archive() {
    const reason = window.prompt("Reason for archiving this product");
    if (reason === null) return;
    if (reason.trim().length < 3) { setError("Archive reason must contain at least 3 characters."); return; }
    void post("archive", reason.trim());
  }

  function reactivate() {
    const reason = window.prompt("Reason for reactivating this product");
    if (reason === null) return;
    if (reason.trim().length < 3) { setError("Activation reason must contain at least 3 characters."); return; }
    void post("reactivate", reason.trim());
  }

  function archiveInstead() {
    const reason = deleteReason.trim().length >= 3 ? deleteReason.trim() : "Archived instead of permanent deletion";
    void post("archive", reason);
  }

  const pending = state.activationRequest?.status === "pending";

  return <div className={styles.wrap}>
    {pending && <span className={styles.requestBadge}>Vendor requested activation</span>}
    <div className="workspace-action-buttons">
      {state.archived
        ? <button type="button" className="button" onClick={reactivate} disabled={Boolean(busy)}>{busy === "reactivate" ? "Reactivating…" : "Reactivate product"}</button>
        : <>
          <button type="button" className="button button-secondary" onClick={archive} disabled={Boolean(busy)}>{busy === "archive" ? "Archiving…" : "Archive product"}</button>
          <button type="button" className="button admin-danger" onClick={() => { setDeleteOpen(true); setError(""); }} disabled={Boolean(busy)}>Delete product</button>
        </>}
    </div>
    {error && <small className="form-error" role="alert">{error}</small>}

    {deleteOpen && <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setDeleteOpen(false); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="delete-product-title">
        <div className={styles.dialogHead}><div><span className={styles.kicker}>Permanent deletion</span><h3 id="delete-product-title">Delete this product and its related data?</h3></div><button type="button" className={styles.close} onClick={() => setDeleteOpen(false)} disabled={Boolean(busy)} aria-label="Close">×</button></div>
        <p>This permanently removes the vendor product record and the removable catalogue, inventory and matching data attached to it. It cannot be undone.</p>
        <div className={styles.archiveChoice}><strong>Prefer to keep the history?</strong><span>Archive instead. The item remains visible to Admin and the vendor, is removed from sale, and can be reactivated later.</span><button type="button" className="button button-secondary" onClick={archiveInstead} disabled={Boolean(busy)}>{busy === "archive" ? "Archiving…" : "Archive instead"}</button></div>
        <label className={styles.field}><span>Deletion reason</span><textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Why is this product being permanently deleted?" rows={3} /></label>
        <label className={styles.ack}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I acknowledge that this product and its related removable data will be permanently deleted.</span></label>
        <p className={styles.safetyNote}>Products with protected order, return or counteroffer history cannot be permanently deleted; the system will require archiving instead.</p>
        {error && <small className="form-error" role="alert">{error}</small>}
        <div className={styles.dialogActions}><button type="button" className="button button-secondary" onClick={() => setDeleteOpen(false)} disabled={Boolean(busy)}>Cancel</button><button type="button" className="button admin-danger" disabled={!acknowledged || deleteReason.trim().length < 3 || Boolean(busy)} onClick={() => void post("delete", deleteReason.trim(), true)}>{busy === "delete" ? "Deleting…" : "Permanently delete"}</button></div>
      </section>
    </div>}
  </div>;
}
