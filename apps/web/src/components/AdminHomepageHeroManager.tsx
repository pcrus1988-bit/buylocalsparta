"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HomepageHeroSlide } from "../lib/homepage-hero-runtime";

export function AdminHomepageHeroManager({ slides, csrfToken }: { slides: readonly HomepageHeroSlide[]; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("isVisible", data.get("isVisible") ? "true" : "false");
    try {
      const response = await fetch("/api/admin/hero", { method: "POST", headers: { "x-csrf-token": csrfToken }, body: data });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to upload hero banner.");
      form.reset();
      setMessage("Το banner προστέθηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload hero banner.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="shell vendor-section">
        <details className="workspace-tool-panel" open>
          <summary><span><strong>Νέο homepage banner</strong><small>Upload εικόνας και άμεσος έλεγχος προβολής.</small></span></summary>
          <div className="workspace-tool-body">
            <form className="admin-json-form" onSubmit={create}>
              <label><span>Εικόνα</span><input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" required /></label>
              <label><span>Τίτλος (Admin)</span><input name="title" type="text" required /></label>
              <label><span>Alt text</span><input name="altText" type="text" placeholder="Περιγραφή για accessibility" /></label>
              <label><span>Προαιρετικό link</span><input name="linkUrl" type="text" placeholder="/register ή https://..." /></label>
              <label><span>Σειρά</span><input name="sortOrder" type="number" defaultValue="100" /></label>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input name="isVisible" type="checkbox" defaultChecked style={{ width: 18 }} /><span>Visible</span></label>
              <button className="button" disabled={busy}>{busy ? "Ανεβαίνει…" : "Upload banner"}</button>
              {message ? <small role="status">{message}</small> : null}
            </form>
          </div>
        </details>
      </section>

      <section className="vendor-section section-tint">
        <div className="shell">
          <div className="eyebrow">Homepage</div>
          <h2>Hero carousel</h2>
          <p className="lead">Το πρώτο visible banner εμφανίζεται πρώτο. Το υπάρχον hero παραμένει πάντα ως δεύτερη προβολή μετά το πρώτο ενεργό banner.</p>
          <div className="workspace-queue-list">
            {slides.map((slide) => <HeroSlideEditor key={slide.id} slide={slide} csrfToken={csrfToken} />)}
          </div>
        </div>
      </section>
    </>
  );
}

function HeroSlideEditor({ slide, csrfToken }: { slide: HomepageHeroSlide; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const payload = {
      title: String(data.get("title") || ""),
      altText: String(data.get("altText") || ""),
      linkUrl: String(data.get("linkUrl") || ""),
      sortOrder: Number(data.get("sortOrder") || 0),
      isVisible: Boolean(data.get("isVisible"))
    };
    try {
      const response = await fetch(`/api/admin/hero/${encodeURIComponent(slide.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payload)
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to save hero banner.");
      setMessage("Αποθηκεύτηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save hero banner.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (slide.isSeed || !window.confirm("Να διαγραφεί οριστικά αυτό το banner;")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/hero/${encodeURIComponent(slide.id)}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken }
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to delete hero banner.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete hero banner.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="workspace-queue-card">
      <div className="workspace-queue-head">
        <div><strong>{slide.title}</strong><small>{slide.isSeed ? "Launch banner · protected" : slide.id}</small></div>
        <span className="status-pill">{slide.isVisible ? "visible" : "hidden"}</span>
      </div>
      <img src={slide.imageUrl} alt="" style={{ display: "block", width: "100%", maxHeight: 260, objectFit: "contain", background: "#f4efe6", borderRadius: 12, margin: "12px 0" }} />
      <form className="admin-json-form" onSubmit={save}>
        <label><span>Τίτλος</span><input name="title" defaultValue={slide.title} required /></label>
        <label><span>Alt text</span><input name="altText" defaultValue={slide.altText} /></label>
        <label><span>Link</span><input name="linkUrl" defaultValue={slide.linkUrl ?? ""} /></label>
        <label><span>Σειρά</span><input name="sortOrder" type="number" defaultValue={slide.sortOrder} /></label>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input name="isVisible" type="checkbox" defaultChecked={slide.isVisible} style={{ width: 18 }} /><span>Visible / Hidden</span></label>
        <div className="workspace-action-buttons">
          <button className="button" disabled={busy}>{busy ? "…" : "Save"}</button>
          {!slide.isSeed ? <button className="button button-secondary" type="button" disabled={busy} onClick={remove}>Delete</button> : null}
        </div>
        {message ? <small role="status">{message}</small> : null}
      </form>
    </article>
  );
}
