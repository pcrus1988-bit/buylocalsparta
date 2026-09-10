"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { HomepageLocalMarketScene } from "../lib/homepage-local-market-runtime";

export function AdminHomepageLocalMarketManager({ scene, csrfToken }: { scene: HomepageLocalMarketScene; csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    data.set("isVisible", data.get("isVisible") ? "true" : "false");

    try {
      const response = await fetch("/api/admin/homepage-local-market", {
        method: "PATCH",
        headers: { "x-csrf-token": csrfToken },
        body: data
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to save the homepage local-market section.");
      setMessage("Αποθηκεύτηκε.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the homepage local-market section.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="vendor-section">
      <div className="shell">
        <div className="eyebrow">Homepage · Local market story</div>
        <h2>Η πόλη πίσω από τα προϊόντα</h2>
        <p className="lead">Διαχειρίσου τη δεξιά κάρτα του homepage: κείμενα, CTA, εικόνα και Visible / Hidden. Η εικόνα εμφανίζεται χωρίς φίλτρα, overlays ή οπτικές αλλοιώσεις.</p>

        <article className="workspace-queue-card" style={{ marginTop: 24 }}>
          <div className="workspace-queue-head">
            <div><strong>{scene.headline}</strong><small>{scene.id}</small></div>
            <span className="status-pill">{scene.isVisible ? "visible" : "hidden"}</span>
          </div>

          {scene.imageUrl ? (
            <img
              src={scene.imageUrl}
              alt={scene.altText}
              style={{ display: "block", width: "100%", height: "auto", maxHeight: 420, objectFit: "contain", background: "#f4efe6", borderRadius: 14, margin: "16px 0" }}
            />
          ) : (
            <div style={{ margin: "16px 0", padding: 24, borderRadius: 14, background: "#f4efe6" }}>Δεν έχει οριστεί εικόνα.</div>
          )}

          <form className="admin-json-form" onSubmit={save}>
            <label><span>Eyebrow</span><input name="eyebrow" defaultValue={scene.eyebrow} required /></label>
            <label><span>Κεντρικός τίτλος</span><input name="headline" defaultValue={scene.headline} required /></label>
            <label><span>Κείμενο</span><textarea name="body" rows={4} defaultValue={scene.body} /></label>
            <label><span>CTA κείμενο</span><input name="ctaLabel" defaultValue={scene.ctaLabel} placeholder="Άφησέ το κενό μαζί με το link για χωρίς CTA" /></label>
            <label><span>CTA link</span><input name="ctaUrl" defaultValue={scene.ctaUrl} placeholder="/shops ή https://..." /></label>
            <label><span>Alt text εικόνας</span><input name="altText" defaultValue={scene.altText} placeholder="Περιγραφή για accessibility" /></label>
            <label><span>Αντικατάσταση εικόνας</span><input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" /></label>
            <small>Αν δεν επιλέξεις νέο αρχείο, η τρέχουσα εικόνα παραμένει ακριβώς ίδια.</small>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}><input name="isVisible" type="checkbox" defaultChecked={scene.isVisible} style={{ width: 18 }} /><span>Visible / Hidden</span></label>
            <button className="button" disabled={busy}>{busy ? "Αποθηκεύεται…" : "Save section"}</button>
            {message ? <small role="status">{message}</small> : null}
          </form>
        </article>
      </div>
    </section>
  );
}
