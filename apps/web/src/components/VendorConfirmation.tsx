"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VendorConfirmationRequest = Readonly<{
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => unknown | Promise<unknown>;
}>;

export function useVendorConfirmation() {
  const [pending, setPending] = useState<VendorConfirmationRequest | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Restore focus before the confirmed action can enter a busy/disabled state.
  const closeAndRestoreFocus = useCallback(async () => {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    setPending(null);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        target?.focus();
        resolve();
      });
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? []);
    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void closeAndRestoreFocus();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pending, closeAndRestoreFocus]);

  useEffect(() => () => {
    returnFocusRef.current?.focus();
    returnFocusRef.current = null;
  }, []);

  function requestConfirmation(request: VendorConfirmationRequest) {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending(request);
  }

  async function confirmPending() {
    const action = pending?.onConfirm;
    await closeAndRestoreFocus();
    if (action) await action();
  }

  const confirmationDialog = pending ? <div
    className="vendor-confirmation-backdrop"
    role="presentation"
    onMouseDown={() => void closeAndRestoreFocus()}
  >
    <section
      ref={dialogRef}
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
        <button className="button button-secondary" type="button" onClick={() => void closeAndRestoreFocus()}>
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
