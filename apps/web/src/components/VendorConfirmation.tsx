"use client";

import { useEffect, useState } from "react";

export type VendorConfirmationRequest = Readonly<{
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
}>;

export function useVendorConfirmation() {
  const [pending, setPending] = useState<VendorConfirmationRequest | null>(null);

  useEffect(() => {
    if (!pending) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pending]);

  function requestConfirmation(request: VendorConfirmationRequest) {
    setPending(request);
  }

  async function confirmPending() {
    const action = pending?.onConfirm;
    setPending(null);
    if (action) await action();
  }

  const confirmationDialog = pending ? <div
    className="vendor-confirmation-backdrop"
    role="presentation"
    onMouseDown={() => setPending(null)}
  >
    <section
      className={`vendor-confirmation-dialog${pending.tone === "danger" ? " is-danger" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-confirmation-title"
      aria-describedby="vendor-confirmation-body"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="vendor-confirmation-eyebrow">Επιβεβαίωση ενέργειας</span>
      <h2 id="vendor-confirmation-title">{pending.title}</h2>
      <p id="vendor-confirmation-body">{pending.body}</p>
      <div className="vendor-confirmation-actions">
        <button className="button button-secondary" type="button" onClick={() => setPending(null)}>
          {pending.cancelLabel ?? "Ακύρωση"}
        </button>
        <button className={pending.tone === "danger" ? "button vendor-confirmation-danger" : "button"} type="button" onClick={() => void confirmPending()}>
          {pending.confirmLabel ?? "Επιβεβαίωση"}
        </button>
      </div>
    </section>
  </div> : null;

  return { requestConfirmation, confirmationDialog };
}
