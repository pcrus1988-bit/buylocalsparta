"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminStoryMediaForm({
  storyId,
  csrfToken,
  currentMediaId,
  candidates
}: {
  storyId: string;
  csrfToken: string;
  currentMediaId?: string;
  candidates: readonly { mediaId: string; altText?: string }[];
}) {
  const router = useRouter();
  const [mediaId, setMediaId] = useState(currentMediaId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/content/story-media", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ storyId, mediaId })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Merchant media update failed");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Merchant media update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-story-media-form">
      <label>
        <span>Εγκεκριμένη φωτογραφία καταστήματος</span>
        <select value={mediaId} onChange={(event) => setMediaId(event.target.value)} disabled={busy}>
          <option value="">Χωρίς φωτογραφία · χρήση γραφικού fallback</option>
          {candidates.map((candidate) => (
            <option value={candidate.mediaId} key={candidate.mediaId}>
              {candidate.altText ? `${candidate.altText} · ${candidate.mediaId}` : candidate.mediaId}
            </option>
          ))}
        </select>
      </label>
      <button className="button" type="button" disabled={busy} onClick={save}>{busy ? "…" : "Αποθήκευση εικόνας"}</button>
      {error && <small className="form-error" role="alert">{error}</small>}
    </div>
  );
}
