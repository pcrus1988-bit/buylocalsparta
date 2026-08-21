"use client";

import { useState } from "react";
import { CustomerHowItWorks } from "./CustomerAccountPrimitives";

export function AccountSecurityClient({ email, emailVerified, csrfToken }: { email: string; emailVerified: boolean; csrfToken: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Οι δύο νέοι κωδικοί δεν ταιριάζουν.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/security/password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Ο κωδικός δεν άλλαξε.");
      window.location.assign("/login?reset=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ο κωδικός δεν άλλαξε.");
      setBusy(false);
    }
  }

  return <section className="shell customer-account-page">
    <div className="customer-page-heading"><div><div className="eyebrow">Ασφάλεια</div><h1>Σύνδεση & κωδικός</h1></div><p>Έλεγξε το email σύνδεσης και άλλαξε τον κωδικό σου με επιβεβαίωση του τρέχοντος.</p></div>
    <div className="customer-account-grid customer-security-grid">
      <article className="customer-account-panel">
        <div className="eyebrow">Ταυτότητα λογαριασμού</div><h2>Email σύνδεσης</h2>
        <div className="customer-account-panel-list">
          <div className="customer-account-panel-row"><div><strong>{email}</strong><small>Αυτό είναι το email που χρησιμοποιείς για σύνδεση.</small></div><span className={emailVerified ? "status-pill" : "status-pill warning"}>{emailVerified ? "Επιβεβαιωμένο" : "Μη επιβεβαιωμένο"}</span></div>
        </div>
        <p className="account-muted">Η αλλαγή email δεν γίνεται ως απλή επεξεργασία προφίλ, γιατί χρειάζεται ξεχωριστή επιβεβαίωση της νέας διεύθυνσης.</p>
        <CustomerHowItWorks title="Γιατί δεν μπορώ να αλλάξω απευθείας το email;"><p>Το email είναι στοιχείο σύνδεσης και ανάκτησης λογαριασμού. Για να αλλάξει με ασφάλεια, πρέπει πρώτα να επιβεβαιωθεί η νέα διεύθυνση ώστε να μη χαθεί η πρόσβαση στον λογαριασμό.</p></CustomerHowItWorks>
      </article>
      <article className="customer-account-panel">
        <div className="eyebrow">Κωδικός</div><h2>Αλλαγή κωδικού</h2>
        <form className="customer-security-form" onSubmit={submit}>
          <label><span>Τρέχων κωδικός</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
          <label><span>Νέος κωδικός</span><input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><small>Τουλάχιστον 10 χαρακτήρες.</small></label>
          <label><span>Επανάληψη νέου κωδικού</span><input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          {error && <p className="account-action-error" role="alert">{error}</p>}
          <button className="button" type="submit" disabled={busy}>{busy ? "Αλλαγή…" : "Αλλαγή κωδικού"}</button>
        </form>
        <CustomerHowItWorks title="Τι γίνεται μετά την αλλαγή;"><p>Για λόγους ασφαλείας αποσυνδέονται όλες οι ενεργές συνεδρίες, συμπεριλαμβανομένης της τρέχουσας. Θα μεταφερθείς στη σύνδεση και θα χρησιμοποιήσεις τον νέο κωδικό.</p></CustomerHowItWorks>
      </article>
    </div>
  </section>;
}