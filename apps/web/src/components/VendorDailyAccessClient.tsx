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

  return <div className="vendor-daily-access-stack">
    <section className="workspace-queue-card vendor-daily-access-card">
      <div><div className="eyebrow">Νέα πρόσβαση</div><h2 className="vendor-card-title">Δώσε πρόσβαση στην καθημερινή λειτουργία</h2><p className="vendor-card-copy">Ο λογαριασμός Daily βλέπει μόνο τις καθημερινές εργασίες: παραγγελίες, Ask Local, QR παραλαβές και ειδοποιήσεις. Δεν αποκτά πρόσβαση στον πλήρη χώρο συνεργάτη.</p></div>
      <VendorLifecycle steps={[
        { label: "Στοιχεία ατόμου", tone: "attention" },
        { label: "Δημιουργία πρόσβασης", tone: "future" },
        { label: "Σύνδεση στο Daily", tone: "future" }
      ]} ariaLabel="Δημιουργία Daily πρόσβασης" />
      <WorkspaceHowItWorks>
        <p><strong>Δεν υπάρχουν διαφορετικοί ρόλοι Daily.</strong> Κάθε ενεργή Daily πρόσβαση έχει το ίδιο περιορισμένο εύρος λειτουργιών.</p>
        <p><strong>Ο κωδικός είναι ξεχωριστός</strong> από τον λογαριασμό ιδιοκτήτη του χώρου συνεργάτη. Αν αλλάξεις τον κωδικό, οι προηγούμενες Daily συνεδρίες κλείνουν.</p>
        <p><strong>Ανάκληση πρόσβασης:</strong> αποσυνδέει αμέσως το συγκεκριμένο άτομο από όλες τις ενεργές Daily συνεδρίες.</p>
      </WorkspaceHowItWorks>
      <form className="vendor-daily-access-form workspace-form-grid" onSubmit={create}>
        <label className="workspace-form-field">Όνομα<input name="displayName" required maxLength={120} placeholder="π.χ. Μαρία — Κατάστημα" /></label>
        <label className="workspace-form-field">Email<input name="email" type="email" required autoComplete="off" /></label>
        <label className="workspace-form-field span-2">Αρχικός κωδικός<input name="password" type="password" required minLength={10} autoComplete="new-password" /><small className="vendor-field-help">Τουλάχιστον 10 χαρακτήρες. Χρησιμοποίησε ξεχωριστό email που δεν είναι ήδη λογαριασμός KONTA MOY.</small></label>
        <button className="button span-2" type="submit" disabled={Boolean(busy)}>{busy === "create" ? "Δημιουργία…" : "Δημιουργία πρόσβασης Daily"}</button>
      </form>
      {error && <VendorActionNotice tone="danger" title="Η ενέργεια δεν ολοκληρώθηκε">{error}</VendorActionNotice>}
      {success && <VendorActionNotice tone="positive" title="Ολοκληρώθηκε">{success}</VendorActionNotice>}
    </section>

    <section className="vendor-daily-access-list">
      <div><div className="eyebrow">Πρόσβαση Daily</div><h2 className="vendor-card-title">Άτομα με πρόσβαση</h2><p className="vendor-card-copy">Βλέπεις άμεσα ποιος έχει ενεργή πρόσβαση, αν υπάρχουν συνδεδεμένες συνεδρίες και αν έχουν ενεργοποιηθεί ειδοποιήσεις σε συσκευή.</p></div>
      {accesses.length === 0 ? <div className="workspace-queue-card">Δεν έχει δημιουργηθεί ακόμη πρόσβαση για συνεργάτη ή υπάλληλο.</div> : accesses.map((access) => <article className={`workspace-queue-card vendor-daily-access-card${access.active ? "" : " is-inactive"}`} key={access.id}>
        <div className="workspace-queue-head">
          <div><strong>{access.displayName}</strong><small>{access.email}</small></div>
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
          <div className="workspace-compact-row"><strong>Συσκευές με ειδοποιήσεις</strong><span>{access.pushDevices}</span></div>
          <div className="workspace-compact-row"><strong>Δημιουργήθηκε</strong><span>{date(access.createdAt)}</span></div>
        </div>
        {access.active && <div className="vendor-daily-access-actions">
          <details className="workspace-record-details"><summary>Αλλαγή κωδικού</summary><div><form className="vendor-inline-reset-form" onSubmit={(event) => void resetPassword(event, access.id)}><input name="password" type="password" minLength={10} required placeholder="Νέος κωδικός" autoComplete="new-password" /><button className="button button-secondary" type="submit" disabled={Boolean(busy)}>{busy === `reset:${access.id}` ? "Αλλαγή…" : "Αλλαγή κωδικού"}</button></form></div></details>
          <button className="button button-secondary" type="button" disabled={Boolean(busy)} onClick={() => void revoke(access.id)}>{busy === access.id ? "Ανάκληση…" : "Ανάκληση πρόσβασης"}</button>
        </div>}
      </article>)}
    </section>
  </div>;
}
