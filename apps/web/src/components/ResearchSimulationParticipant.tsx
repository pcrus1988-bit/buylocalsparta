"use client";

import { useState } from "react";

export function ResearchSimulationParticipant({ token, slug, expiresAt }: {
  token: string;
  slug: string;
  expiresAt: number;
}) {
  const [business, setBusiness] = useState("");
  const [online, setOnline] = useState("");
  const [priority, setPriority] = useState("");
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || receipt) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/research/simulation/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token, answers: { business, online, priority } })
      });
      const data = await response.json() as { receipt?: string; error?: string };
      if (!response.ok || !data.receipt) throw new Error(data.error || "Η δοκιμαστική υποβολή απέτυχε.");
      setReceipt(data.receipt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Σφάλμα κατά την υποβολή.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="shell vendor-section" style={{ maxWidth: 760, margin: "32px auto", padding: 24 }}>
    <div className="eyebrow">KONTA MOY · RESEARCH · TEST ONLY</div>
    <h1>{receipt ? "Η δοκιμαστική απάντηση υποβλήθηκε" : "Δοκιμή συμμετοχής στην έρευνα"}</h1>
    <div className="workspace-inline-note" role="status" style={{ marginBottom: 20 }}>
      <strong>Περιβάλλον προσομοίωσης.</strong> Δεν πρόκειται για την πραγματική μελέτη και οι απαντήσεις σας δεν υπολογίζονται σε αποτελέσματα.
      Ο σύνδεσμος λήγει {new Date(expiresAt).toLocaleString("el-GR", { timeZone: "Europe/Athens", dateStyle: "medium", timeStyle: "short" })}.
    </div>
    {!receipt
      ? <form onSubmit={(event) => { event.preventDefault(); void submit(); }} style={{ display: "grid", gap: 20 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <strong>1. Κύρια δραστηριότητα επιχείρησης</strong>
          <input className="input" required maxLength={120} value={business}
            onChange={(event) => setBusiness(event.target.value)} placeholder="π.χ. Βιβλιοπωλείο" />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <strong>2. Διαθέτετε ηλεκτρονικό κατάστημα;</strong>
          <select className="input" required value={online} onChange={(event) => setOnline(event.target.value)}>
            <option value="">Επιλέξτε απάντηση</option>
            <option value="yes">Ναι</option>
            <option value="no">Όχι</option>
            <option value="planning">Σχεδιάζεται</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <strong>3. Ποια είναι η βασική σας προτεραιότητα;</strong>
          <textarea className="input" required maxLength={400} value={priority}
            onChange={(event) => setPriority(event.target.value)} rows={3} placeholder="Σύντομη δοκιμαστική απάντηση" />
        </label>
        {error && <div className="workspace-inline-note form-error" role="alert">{error}</div>}
        <button className="button" type="submit" disabled={busy || !business.trim() || !online || !priority.trim()}>
          {busy ? "Υποβολή…" : "Υποβολή δοκιμαστικών απαντήσεων"}
        </button>
      </form>
      : <div style={{ display: "grid", gap: 14 }}>
        <div className="workspace-inline-note" role="status">
          <strong>Επιτυχής έλεγχος υποβολής.</strong> Δεν δημιουργήθηκε πραγματική απάντηση.
          Αντιγράψτε την απόδειξη παρακάτω και επικολλήστε την στο βήμα «Επαλήθευση απάντησης» του Admin simulator.
        </div>
        <label htmlFor="sim-receipt"><strong>Κρυπτογραφική απόδειξη δοκιμής</strong></label>
        <textarea id="sim-receipt" readOnly value={receipt} rows={5}
          style={{ width: "100%", overflowWrap: "anywhere" }}
          onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="button" onClick={() => void navigator.clipboard.writeText(receipt)}>
          Αντιγραφή απόδειξης
        </button>
      </div>}
  </div>;
}
