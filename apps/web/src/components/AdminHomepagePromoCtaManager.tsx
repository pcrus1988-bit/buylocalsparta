"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HomepagePromoCta } from "../lib/homepage-promo-cta-runtime";

function payloadFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    eyebrow: String(data.get("eyebrow") || ""),
    headline: String(data.get("headline") || ""),
    body: String(data.get("body") || ""),
    buttonLabel: String(data.get("buttonLabel") || ""),
    linkUrl: String(data.get("linkUrl") || ""),
    supportingText: String(data.get("supportingText") || ""),
    sortOrder: Number(data.get("sortOrder") || 0),
    isVisible: Boolean(data.get("isVisible"))
  };
}

export function AdminHomepagePromoCtaManager({ ctas, csrfToken }: { ctas: readonly HomepagePromoCta[]; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/admin/homepage-cta", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payloadFromForm(form))
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to create homepage CTA.");
      form.reset();
      setMessage("Το CTA προστέθηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create homepage CTA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="vendor-section section-tint">
      <div className="shell">
        <div className="eyebrow">Homepage · CTA</div>
        <h2>Registration CTA κάτω από το Hero</h2>
        <p className="lead">Το πρώτο visible CTA εμφανίζεται αμέσως μετά το hero carousel. Μπορείς να αλλάξεις κείμενα, link και σειρά, να το κρύψεις προσωρινά ή να το διαγράψεις.</p>

        <div className="workspace-queue-list" style={{ marginTop: 24 }}>
          {ctas.map((cta) => <PromoCtaEditor key={cta.id} cta={cta} csrfToken={csrfToken} />)}
        </div>

        <details className="workspace-tool-panel" style={{ marginTop: 24 }}>
          <summary><span><strong>Νέο promotional CTA</strong><small>Χρήσιμο για επόμενη καμπάνια ή για να ξαναδημιουργήσεις ενότητα που διαγράφηκε.</small></span></summary>
          <div className="workspace-tool-body">
            <form className="admin-json-form" onSubmit={create}>
              <label><span>Eyebrow</span><input name="eyebrow" defaultValue="Η ΣΠΑΡΤΗ ΞΕΚΙΝΑ ΕΔΩ" required /></label>
              <label><span>Κεντρικός τίτλος</span><input name="headline" placeholder="Γίνε από τους πρώτους…" required /></label>
              <label><span>Κείμενο</span><textarea name="body" rows={4} /></label>
              <label><span>Κείμενο κουμπιού</span><input name="buttonLabel" defaultValue="Εγγραφή & συμμετοχή" required /></label>
              <label><span>Link</span><input name="linkUrl" defaultValue="https://kontamou.site/register?next=%2Faccount" required /></label>
              <label><span>Μικρό κείμενο κάτω από το κουμπί</span><input name="supportingText" /></label>
              <label><span>Σειρά</span><input name="sortOrder" type="number" defaultValue="100" /></label>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input name="isVisible" type="checkbox" defaultChecked style={{ width: 18 }} /><span>Visible</span></label>
              <button className="button" disabled={busy}>{busy ? "…" : "Create CTA"}</button>
              {message ? <small role="status">{message}</small> : null}
            </form>
          </div>
        </details>
      </div>
    </section>
  );
}

function PromoCtaEditor({ cta, csrfToken }: { cta: HomepagePromoCta; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/homepage-cta/${encodeURIComponent(cta.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payloadFromForm(event.currentTarget))
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to save homepage CTA.");
      setMessage("Αποθηκεύτηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save homepage CTA.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Να διαγραφεί οριστικά αυτό το homepage CTA;")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/homepage-cta/${encodeURIComponent(cta.id)}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken }
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete homepage CTA.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete homepage CTA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="workspace-queue-card">
      <div className="workspace-queue-head">
        <div><strong>{cta.headline}</strong><small>{cta.id}</small></div>
        <span className="status-pill">{cta.isVisible ? "visible" : "hidden"}</span>
      </div>
      <form className="admin-json-form" onSubmit={save} style={{ marginTop: 16 }}>
        <label><span>Eyebrow</span><input name="eyebrow" defaultValue={cta.eyebrow} required /></label>
        <label><span>Κεντρικός τίτλος</span><input name="headline" defaultValue={cta.headline} required /></label>
        <label><span>Κείμενο</span><textarea name="body" rows={4} defaultValue={cta.body} /></label>
        <label><span>Κείμενο κουμπιού</span><input name="buttonLabel" defaultValue={cta.buttonLabel} required /></label>
        <label><span>Link</span><input name="linkUrl" defaultValue={cta.linkUrl} required /></label>
        <label><span>Μικρό κείμενο κάτω από το κουμπί</span><input name="supportingText" defaultValue={cta.supportingText} /></label>
        <label><span>Σειρά</span><input name="sortOrder" type="number" defaultValue={cta.sortOrder} /></label>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input name="isVisible" type="checkbox" defaultChecked={cta.isVisible} style={{ width: 18 }} /><span>Visible / Hidden</span></label>
        <div className="workspace-action-buttons">
          <button className="button" disabled={busy}>{busy ? "…" : "Save"}</button>
          <button className="button button-secondary" type="button" disabled={busy} onClick={remove}>Delete</button>
        </div>
        {message ? <small role="status">{message}</small> : null}
      </form>
    </article>
  );
}
