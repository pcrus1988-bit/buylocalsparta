"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminTaxReconcileForm({ documentId, csrfToken }: Readonly<{ documentId: string; csrfToken: string }>) {
  const router = useRouter();
  const [documentNumber, setDocumentNumber] = useState("");
  const [aadeMark, setAadeMark] = useState("");
  const [aadeUid, setAadeUid] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [issueDate, setIssueDate] = useState(athensToday());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/tax/reconcile", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ documentId, documentNumber, aadeMark, aadeUid: aadeUid || undefined, qrUrl: qrUrl || undefined, issueDate })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Η συμφωνία timologio δεν ολοκληρώθηκε.");
      setMessage("Τα επίσημα στοιχεία timologio καταγράφηκαν.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Η συμφωνία timologio δεν ολοκληρώθηκε.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="workspace-action-bar" onSubmit={submit}>
    <div>
      <strong>Καταχώριση επίσημου παραστατικού timologio</strong>
      <p className="workspace-queue-summary">Συμπλήρωσε τα στοιχεία μόνο αφού το παραστατικό έχει εκδοθεί στο timologio. Το MARK και ο αριθμός παραστατικού κλειδώνουν μετά την καταχώριση.</p>
      <div className="form-grid">
        <label>Αριθμός παραστατικού<input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} maxLength={120} required placeholder="π.χ. Α-123" /></label>
        <label>MARK AADE<input value={aadeMark} onChange={(event) => setAadeMark(event.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={40} required /></label>
        <label>Ημερομηνία έκδοσης<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} required /></label>
        <label>UID (προαιρετικό)<input value={aadeUid} onChange={(event) => setAadeUid(event.target.value)} maxLength={160} /></label>
        <label>QR URL (προαιρετικό)<input type="url" value={qrUrl} onChange={(event) => setQrUrl(event.target.value)} maxLength={2000} placeholder="https://…" /></label>
      </div>
      {message && <p className="workspace-inline-note" role="status">{message}</p>}
      {error && <p className="workspace-inline-note" role="alert">{error}</p>}
    </div>
    <div className="workspace-action-buttons"><button className="button" type="submit" disabled={busy}>{busy ? "Καταχώριση…" : "Καταχώριση timologio"}</button></div>
  </form>;
}

function athensToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
