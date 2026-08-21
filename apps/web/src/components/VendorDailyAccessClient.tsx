"use client";

import { useState, type FormEvent } from "react";
import { VendorActionNotice, VendorLifecycle } from "./VendorLifecycle";
import { WorkspaceHowItWorks } from "./WorkspacePagePrimitives";

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

const date = (value: number) => new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value));

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
    if (!response.ok) throw new Error(payload.error ?? "Δεν μπορέσαμε να ολοκληρώσουμε την ενέργεια.");
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
      setSuccess("Η πρόσβαση Daily δημιουργήθηκε. Δώσε τα στοιχεία σύνδεσης μόνο στο άτομο που θα χρησιμοποιεί την καθημερινή λειτουργία.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Η δημιουργία απέτυχε"); }
    finally { setBusy(""); }
  }

  async function revoke(accessId: string) {
    if (!window.confirm("Να ανακληθεί αυτή η Daily πρόσβαση; Όλες οι ενεργές συνεδρίες του συγκεκριμένου λογαριασμού θα τερματιστούν αμέσως.")) return;
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
      <div><div className="eyebrow">Νέα πρόσβαση</div><h2 style={{ margin: "4px 0 6px" }}>Δώσε πρόσβαση στην καθημερινή λειτουργία</h2><p style={{ margin: 0, opacity: .72 }}>Ο λογαριασμός Daily βλέπει μόνο τις καθημερινές εργασίες: παραγγελίες, Ask Local, QR παραλαβές και ειδοποιήσεις. Δεν αποκτά πρόσβαση στο πλήρες vendor backoffice.</p></div>
      <VendorLifecycle steps={[
        { label: "Στοιχεία ατόμου", tone: "attention" },
        { label: "Δημιουργία πρόσβασης", tone: "future" },
        { label: "Σύνδεση στο Daily", tone: "future" }
      ]} ariaLabel="Δημιουργία Daily πρόσβασης" />
      <WorkspaceHowItWorks>
        <p><strong>Δεν υπάρχουν διαφορετικοί ρόλοι Daily.</strong> Κάθε ενεργή Daily πρόσβαση έχει το ίδιο περιορισμένο operational scope.</p>
        <p><strong>Ο κωδικός είναι ξεχωριστός</strong> από τον λογαριασμό ιδιοκτήτη του vendor dashboard. Αν αλλάξεις τον κωδικό, οι προηγούμενες Daily συνεδρίες κλείνουν.</p>
        <p><strong>Ανάκληση πρόσβασης:</strong> αποσυνδέει αμέσως το συγκεκριμένο άτομο από όλες τις ενεργές Daily συνεδρίες.</p>
      </WorkspaceHowItWorks>
      <form onSubmit={create} style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>Όνομα<input name="displayName" required maxLength={120} placeholder="π.χ. Μαρία — Κατάστημα" /></label>
        <label style={{ display: "grid", gap: 6 }}>Email<input name="email" type="email" required autoComplete="off" /></label>
        <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>Αρχικός κωδικός<input name="password" type="password" required minLength={10} autoComplete="new-password" /><small style={{ opacity: .65 }}>Τουλάχιστον 10 χαρακτήρες. Χρησιμοποίησε ξεχωριστό email που δεν είναι ήδη λογαριασμός KONTA MOY.</small></label>
        <button className="button" type="submit" disabled={Boolean(busy)} style={{ gridColumn: "1 / -1" }}>{busy === "create" ? "Δημιουργία…" : "Δημιουργία πρόσβασης Daily"}</button>
      </form>
      {error && <VendorActionNotice tone="danger" title="Η ενέργεια δεν ολοκληρώθηκε">{error}</VendorActionNotice>}
      {success && <VendorActionNotice tone="positive" title="Ολοκληρώθηκε">{success}</VendorActionNotice>}
    </section>

    <section style={{ display: "grid", gap: 12 }}>
      <div><div className="eyebrow">Πρόσβαση Daily</div><h2 style={{ margin: "4px 0" }}>Άτομα με πρόσβαση</h2><p style={{ margin: 0, opacity: .7 }}>Βλέπεις άμεσα ποιος έχει ενεργή πρόσβαση, αν υπάρχουν συνδεδεμένες συνεδρίες και αν έχει ενεργοποιηθεί push σε συσκευή.</p></div>
      {accesses.length === 0 ? <div className="workspace-queue-card">Δεν έχει δημιουργηθεί ακόμη ξεχωριστή πρόσβαση Daily.</div> : accesses.map((access) => <article className="workspace-queue-card" key={access.id} style={{ display: "grid", gap: 14, opacity: access.active ? 1 : .65 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
          <div><strong style={{ display: "block", fontSize: "1.05rem" }}>{access.displayName}</strong><span style={{ opacity: .68 }}>{access.email}</span></div>
          <span className="vendor-merchant-status">{access.active ? "Ενεργή πρόσβαση" : "Ανακλήθηκε"}</span>
        </div>
        <VendorLifecycle steps={access.active ? [
          { label: "Δημιουργήθηκε", tone: "done" },
          { label: "Ενεργή", tone: "current" },
          { label: "Ανάκληση", tone: "future" }
        ] : [
          { label: "Δημιουργήθηκε", tone: "done" },
          { label: "Ήταν ενεργή", tone: "done" },
          { label: "Ανακλήθηκε", tone: "blocked" }
        ]} ariaLabel={`Κατάσταση πρόσβασης ${access.displayName}`} />
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Ενεργές συνεδρίες</strong><span>{access.activeSessions}</span></div>
          <div className="workspace-compact-row"><strong>Συσκευές με push</strong><span>{access.pushDevices}</span></div>
          <div className="workspace-compact-row"><strong>Δημιουργήθηκε</strong><span>{date(access.createdAt)}</span></div>
        </div>
        {access.active && <div style={{ display: "grid", gap: 10 }}>
          <details className="workspace-record-details"><summary>Αλλαγή κωδικού</summary><div><form onSubmit={(event) => void resetPassword(event, access.id)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><input name="password" type="password" minLength={10} required placeholder="Νέος κωδικός" autoComplete="new-password" style={{ flex: "1 1 220px" }} /><button className="button button-secondary" type="submit" disabled={Boolean(busy)}>{busy === `reset:${access.id}` ? "Αλλαγή…" : "Αλλαγή κωδικού"}</button></form></div></details>
          <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void revoke(access.id)}>{busy === access.id ? "Ανάκληση…" : "Ανάκληση πρόσβασης"}</button>
        </div>}
      </article>)}
    </section>
  </div>;
}
