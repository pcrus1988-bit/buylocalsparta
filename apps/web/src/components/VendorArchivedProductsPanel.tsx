"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceSectionHeading } from "./WorkspacePagePrimitives";

type Product = { offerId: string; title: string; vendorSku?: string };
type RequestRow = { offerId: string; status: string; requestedAt: number };

export function VendorArchivedProductsPanel({ products, csrfToken }: { products: readonly Product[]; csrfToken: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/vendor/catalog/activation-requests", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { requests?: RequestRow[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Δεν ήταν δυνατή η φόρτωση των αιτημάτων ενεργοποίησης.");
        if (active) setPending(new Set((payload.requests ?? []).map((item) => item.offerId)));
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η φόρτωση των αιτημάτων ενεργοποίησης."); });
    return () => { active = false; };
  }, []);

  async function requestActivation(product: Product) {
    setBusy(product.offerId);
    setError("");
    try {
      const response = await fetch("/api/vendor/catalog/request-activation", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ offerId: product.offerId })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Το αίτημα ενεργοποίησης απέτυχε.");
      setPending((current) => new Set(current).add(product.offerId));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Το αίτημα ενεργοποίησης απέτυχε.");
    } finally {
      setBusy("");
    }
  }

  if (!products.length) return null;
  return <section className="shell vendor-section">
    <WorkspaceSectionHeading eyebrow="Αρχείο Admin" title="Προϊόντα που χρειάζονται επανέγκριση" note="Εδώ εμφανίζονται μόνο προϊόντα που δεν μπορούν να επανέλθουν από τον δικό σου διακόπτη ορατότητας. Για αυτά απαιτείται αίτημα επανενεργοποίησης προς το ΚΟΝΤΑ ΜΟΥ." />
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="workspace-queue-list">{products.map((product) => {
      const requested = pending.has(product.offerId);
      return <article className="workspace-queue-card" key={product.offerId}>
        <div className="workspace-queue-head"><div><strong>{product.title}</strong><small>{product.vendorSku ? `SKU ${product.vendorSku} · ` : ""}{product.offerId}</small></div><span className="vendor-merchant-status">Χρειάζεται επανέγκριση</span></div>
        <div className="workspace-action-bar"><span>{requested ? "Έχει σταλεί αίτημα επανενεργοποίησης στον Admin." : "Το προϊόν είναι εκτός πώλησης μέχρι να εγκριθεί η επανενεργοποίηση."}</span><div className="workspace-action-buttons"><button type="button" className="button" disabled={requested || Boolean(busy)} onClick={() => void requestActivation(product)}>{requested ? "Αίτημα σε αναμονή" : busy === product.offerId ? "Αποστολή…" : "Ζήτα επανενεργοποίηση"}</button></div></div>
      </article>;
    })}</div>
  </section>;
}
