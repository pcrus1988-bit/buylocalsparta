"use client";

import { useEffect, useRef, useState } from "react";

type DialogKind = "delivery" | "returns";

type ProductPurchaseInfoDialogsProps = Readonly<{
  supplierFulfilled?: boolean;
  showLocationLink?: boolean;
}>;

export function ProductPurchaseInfoDialogs({
  supplierFulfilled = false,
  showLocationLink = false
}: ProductPurchaseInfoDialogsProps) {
  const [open, setOpen] = useState<DialogKind | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open === null) triggerRef.current?.focus();
  }, [open]);

  function launch(kind: DialogKind, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setOpen(kind);
  }

  return <>
    <nav className="purchase-support-links purchase-info-dialog-links" aria-label="Πληροφορίες πριν από την αγορά">
      {showLocationLink ? <a href="/choose-location">Αλλαγή περιοχής</a> : null}
      <button type="button" onClick={(event) => launch("delivery", event.currentTarget)}>Παράδοση &amp; παραλαβή ›</button>
      <button type="button" onClick={(event) => launch("returns", event.currentTarget)}>Επιστροφές &amp; refunds ›</button>
    </nav>

    {open ? <div className="product-info-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(null);
    }}>
      <section
        className="product-info-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`product-info-${open}-title`}
      >
        <div className="product-info-dialog-head">
          <div>
            <div className="eyebrow">Χωρίς να φύγεις από το προϊόν</div>
            <h2 id={`product-info-${open}-title`}>
              {open === "delivery" ? "Παράδοση & παραλαβή" : "Επιστροφές & refunds"}
            </h2>
          </div>
          <button ref={closeButtonRef} className="product-info-close" type="button" onClick={() => setOpen(null)} aria-label="Κλείσιμο">×</button>
        </div>

        {open === "delivery" ? <div className="product-info-dialog-body">
          {supplierFulfilled ? <p className="product-info-lead">Το προϊόν αποστέλλεται από συνεργαζόμενο προμηθευτή.</p> : <p className="product-info-lead">Οι διαθέσιμοι τρόποι παράδοσης ή παραλαβής εμφανίζονται πριν ολοκληρώσεις την αγορά.</p>}
          <div className="product-info-facts">
            <div><strong>Στο checkout</strong><span>Βλέπεις τις διαθέσιμες επιλογές, τον χρόνο και το κόστος πριν από την πληρωμή.</span></div>
            {supplierFulfilled ? <div><strong>Για αυτό το προϊόν</strong><span>Η εξυπηρέτηση γίνεται με αποστολή και όχι με παραλαβή από φυσικό κατάστημα.</span></div> : <div><strong>Τοπική παραλαβή</strong><span>Εμφανίζεται μόνο όταν υποστηρίζεται από το συγκεκριμένο προϊόν και κατάστημα.</span></div>}
            <div><strong>Μετά την αγορά</strong><span>Η παραγγελία σου κρατά συγκεντρωμένη την επιβεβαιωμένη κατάσταση παράδοσης.</span></div>
          </div>
        </div> : <div className="product-info-dialog-body">
          <p className="product-info-lead">Αν χρειαστεί ακύρωση ή επιστροφή, ξεκινάς από τη συγκεκριμένη παραγγελία σου.</p>
          <div className="product-info-facts">
            <div><strong>Πριν από την παράδοση</strong><span>Όπου επιτρέπεται, η διαθέσιμη ενέργεια ακύρωσης εμφανίζεται στην παραγγελία.</span></div>
            <div><strong>Μετά την παραλαβή</strong><span>Η κατάλληλη ροή επιστροφής εμφανίζεται για το συγκεκριμένο προϊόν και την κατάστασή του.</span></div>
            <div><strong>Επιστροφή χρημάτων</strong><span>Η εξέλιξη του αιτήματος παραμένει συνδεδεμένη με την παραγγελία ώστε να έχεις σαφή εικόνα.</span></div>
          </div>
        </div>}

        <button className="button product-info-done" type="button" onClick={() => setOpen(null)}>Εντάξει</button>
      </section>
    </div> : null}

    <style jsx>{`
      .purchase-info-dialog-links button {
        appearance: none;
        border: 0;
        padding: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: inherit;
        text-decoration: underline;
        text-underline-offset: 4px;
        cursor: pointer;
        text-align: left;
      }
      .product-info-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        align-items: end;
        background: rgba(12, 28, 24, .46);
        padding: 12px;
        backdrop-filter: blur(3px);
      }
      .product-info-dialog {
        width: min(100%, 680px);
        max-height: min(82vh, 720px);
        overflow: auto;
        margin: 0 auto;
        border: 1px solid rgba(22, 63, 53, .16);
        border-radius: 26px 26px 18px 18px;
        background: #fffdf8;
        box-shadow: 0 -16px 60px rgba(12, 28, 24, .18);
        padding: 22px;
      }
      .product-info-dialog-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(22, 63, 53, .12);
      }
      .product-info-dialog-head h2 {
        margin: 5px 0 0;
        font-size: clamp(1.45rem, 5vw, 2rem);
        line-height: 1.05;
      }
      .product-info-close {
        flex: 0 0 auto;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        border: 1px solid rgba(22, 63, 53, .24);
        background: transparent;
        color: #163f35;
        font-size: 28px;
        line-height: 1;
        cursor: pointer;
      }
      .product-info-dialog-body { padding: 18px 0 4px; }
      .product-info-lead { margin: 0 0 16px; font-size: 1.05rem; }
      .product-info-facts { display: grid; gap: 0; }
      .product-info-facts > div {
        display: grid;
        gap: 4px;
        padding: 14px 0;
        border-top: 1px solid rgba(22, 63, 53, .1);
      }
      .product-info-facts > div:first-child { border-top: 0; padding-top: 4px; }
      .product-info-facts strong { font-size: .98rem; }
      .product-info-facts span { opacity: .75; line-height: 1.45; }
      .product-info-done { width: 100%; margin-top: 16px; }
      @media (min-width: 720px) {
        .product-info-backdrop { align-items: center; padding: 28px; }
        .product-info-dialog { border-radius: 26px; padding: 28px; }
      }
    `}</style>
  </>;
}
