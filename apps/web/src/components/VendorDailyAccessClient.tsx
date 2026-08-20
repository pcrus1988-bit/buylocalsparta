"use client";

import { useState, type FormEvent } from "react";

type Access = {
  id: string;
  displayName: string;
  email: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  activeSessions: number;
  pushDevices: number;
};

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export function VendorDailyAccessClient({ initial, csrfToken }: { initial: ReadonlyArray<Access>; csrfToken: string }) {
  const [accesses, setAccesses] = useState([...initial]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/vendor/daily-access", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify(body)
    });
    const payload = await response.json() as { error?: string; accesses?: Access[] };
    if (!response.ok) throw new Error(payload.error ?? "Η ενέργεια απέτυχε");
    if (payload.accesses) setAccesses(payload.accesses);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("create"); setError(""); setSuccess("");
    try {
      await send({ action: "create", displayName: String(data.get("displayName") ?? ""), email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
      form.reset();
      setSuccess("Η πρόσβαση Daily δημιουργήθηκε. Ο κωδικός μπορεί να δοθεί απευθείας στο άτομο που θα χρησιμοποιεί το Daily.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Η δημιουργία απέτυχε"); }
    finally { setBusy(""); }
  }

  async function revoke(accessId: string) {
    setBusy(accessId); setError(""); setSuccess("");
    try { await send({ action: "revoke", accessId }); setSuccess("Η πρόσβαση ανακλήθηκε και οι ενεργές Daily συνεδρίες τερματίστηκαν."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Η ανάκληση απέτυχε"); }
    finally { setBusy(""); }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>, accessId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    setBusy(`reset:${accessId}`); setError(""); setSuccess("");
    try { await send({ action: "reset_password", accessId, password }); form.reset(); setSuccess("Ο κωδικός άλλαξε και οι προηγούμενες Daily συνεδρίες τερματίστηκαν."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Η αλλαγή κωδικού απέτυχε"); }
    finally { setBusy(""); }
  }

  return <div style={{ display: "grid", gap: 24 }}>
    <section className="workspace-queue-card" style={{ display: "grid", gap: 16 }}>
      <div><div className="eyebrow">KONTA MOY Daily</div><h2 style={{ margin: "4px 0 6px" }}>Νέα πρόσβαση καθημερινής λειτουργίας</h2><p style={{ margin: 0, opacity: .68 }}>Ένας απλός λογαριασμός Daily για παραγγελίες, Ask Local, QR παραλαβές και ειδοποιήσεις. Δεν δημιουργείται πρόσβαση στο πλήρες vendor backoffice.</p></div>
      <form onSubmit={create} style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>Όνομα<input name="displayName" required maxLength={120} placeholder="π.χ. Μαρία — Κατάστημα" /></label>
        <label style={{ display: "grid", gap: 6 }}>Email<input name="email" type="email" required autoComplete="off" /></label>
        <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>Αρχικός κωδικός<input name="password" type="password" required minLength={10} autoComplete="new-password" /><small style={{ opacity: .6 }}>Τουλάχιστον 10 χαρακτήρες. Χρησιμοποίησε ξεχωριστό email που δεν είναι ήδη λογαριασμός KONTA MOY.</small></label>
        <button className="button" type="submit" disabled={Boolean(busy)} style={{ gridColumn: "1 / -1" }}>{busy === "create" ? "Δημιουργία…" : "Δημιουργία πρόσβασης Daily"}</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <div className="workspace-inline-note">{success}</div>}
    </section>

    <section style={{ display: "grid", gap: 12 }}>
      <div><div className="eyebrow">Entrusted access</div><h2 style={{ margin: "4px 0" }}>Άτομα με Daily πρόσβαση</h2></div>
      {accesses.length === 0 ? <div className="workspace-queue-card">Δεν έχει δημιουργηθεί ακόμη ξεχωριστή πρόσβαση Daily.</div> : accesses.map((access) => <article className="workspace-queue-card" key={access.id} style={{ display: "grid", gap: 14, opacity: access.active ? 1 : .65 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div><strong style={{ display: "block", fontSize: "1.05rem" }}>{access.displayName}</strong><span style={{ opacity: .65 }}>{access.email}</span></div>
          <span className="status-pill">{access.active ? "ACTIVE" : "REVOKED"}</span>
        </div>
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Ενεργές συνεδρίες</strong><span>{access.activeSessions}</span></div>
          <div className="workspace-compact-row"><strong>Συσκευές push</strong><span>{access.pushDevices}</span></div>
          <div className="workspace-compact-row"><strong>Δημιουργήθηκε</strong><span>{date(access.createdAt)}</span></div>
        </div>
        {access.active && <div style={{ display: "grid", gap: 10 }}>
          <details><summary style={{ cursor: "pointer", fontWeight: 700 }}>Αλλαγή κωδικού</summary><form onSubmit={(event) => void resetPassword(event, access.id)} style={{ display: "flex", gap: 8, marginTop: 10 }}><input name="password" type="password" minLength={10} required placeholder="Νέος κωδικός" autoComplete="new-password" style={{ flex: 1 }} /><button className="button button-secondary" type="submit" disabled={Boolean(busy)}>{busy === `reset:${access.id}` ? "…" : "Αλλαγή"}</button></form></details>
          <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void revoke(access.id)}>{busy === access.id ? "Ανάκληση…" : "Ανάκληση Daily πρόσβασης"}</button>
        </div>}
      </article>)}
    </section>
  </div>;
}
