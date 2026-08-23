"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Result = Readonly<{
  status: string;
  payloadId: string;
  compressedSize: number;
  compressedSha256: string;
  sourceSha256: string;
  rowCount: number;
  taxonomyNodes: number;
  priceConflict: number;
  priceReviewRequired: number;
  unpriced: number;
}>;

export function AdminCatalogueImportForm({ csrfToken, expectedCompressedBytes, maxCompressedBytes }: {
  csrfToken: string;
  expectedCompressedBytes: number;
  maxCompressedBytes: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Επίλεξε το επαληθευμένο .gz master file."); return; }
    if (file.size > maxCompressedBytes) { setError("Το αρχείο υπερβαίνει το ασφαλές όριο των 2 MB."); return; }
    setBusy(true); setError(""); setResult(undefined);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/admin/catalogue-intake/import", {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        body,
        cache: "no-store"
      });
      const payload = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Η εισαγωγή του source payload απέτυχε.");
      setResult(payload);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return <form className="workspace-form-stack" onSubmit={submit}>
    <label className="workspace-field">
      <span>Verified Nikolaou master gzip</span>
      <input ref={fileRef} type="file" name="file" accept=".gz,application/gzip,application/x-gzip" required disabled={busy} />
      <small>Expected transport size: {new Intl.NumberFormat("el-GR").format(expectedCompressedBytes)} bytes. The server verifies the exact gzip and decompressed CSV hashes; filename alone is never trusted.</small>
    </label>
    <div className="workspace-inline-note">Αυτό το βήμα κάνει μόνο private staging + checksum seal. Δεν δημιουργεί offer, stock, assortment, canonical product ή public listing.</div>
    <div className="workspace-action-bar">
      <span>Upload is permission-gated by <code>catalog.write</code> and protected by Admin CSRF.</span>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Verifying…" : "Verify & seal source"}</button>
    </div>
    {error && <div className="workspace-inline-note" role="alert"><strong>Upload rejected:</strong> {error}</div>}
    {result && <div className="workspace-inline-note" role="status"><strong>{result.status.replaceAll("_", " ")}</strong> · {result.rowCount} rows · {result.taxonomyNodes} source taxonomy nodes · {result.unpriced} unpriced · {result.priceConflict} conflicts · {result.priceReviewRequired} price-review rows.</div>}
  </form>;
}
