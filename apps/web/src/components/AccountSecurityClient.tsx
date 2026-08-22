"use client";

import { useState } from "react";
import { CustomerHowItWorks, CustomerLifecycle } from "./CustomerAccountPrimitives";

type PendingEmailChange = Readonly<{ email: string; expiresAt: number }>;

type AccountSecurityClientProps = Readonly<{
  email: string;
  emailVerified: boolean;
  csrfToken: string;
  initialPendingEmailChange: PendingEmailChange | null;
  emailChangeReady: boolean;
  emailChangeMessage: string;
}>;

export function AccountSecurityClient({ email, emailVerified, csrfToken, initialPendingEmailChange, emailChangeReady, emailChangeMessage }: AccountSecurityClientProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [pendingEmailChange, setPendingEmailChange] = useState<PendingEmailChange | null>(initialPendingEmailChange);
  const [emailBusy, setEmailBusy] = useState<"" | "request" | "cancel">("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [developmentVerificationUrl, setDevelopmentVerificationUrl] = useState("");

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("Οι δύο νέοι κωδικοί δεν ταιριάζουν.");
      return;
    }
    setPasswordBusy(true);
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
      setPasswordError(cause instanceof Error ? cause.message : "Ο κωδικός δεν άλλαξε.");
      setPasswordBusy(false);
    }
  }

  async function requestEmailChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError("");
    setEmailSuccess("");
    setDevelopmentVerificationUrl("");
    setEmailBusy("request");
    try {
      const response = await fetch("/api/account/security/email-change", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ newEmail, currentPassword: emailPassword })
      });
      const body = await response.json() as { email?: string; expiresAt?: number; delivered?: boolean; verificationUrl?: string; error?: string };
      if (!response.ok || !body.email || !body.expiresAt) throw new Error(body.error ?? "Το αίτημα αλλαγής email δεν δημιουργήθηκε.");
      setPendingEmailChange({ email: body.email, expiresAt: body.expiresAt });
      setEmailPassword("");
      setNewEmail("");
      setDevelopmentVerificationUrl(body.verificationUrl ?? "");
      setEmailSuccess(body.delivered === false ? "Το αίτημα δημιουργήθηκε. Χρησιμοποίησε τον development σύνδεσμο επιβεβαίωσης." : `Στείλαμε σύνδεσμο επιβεβαίωσης στο ${body.email}.`);
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : "Το αίτημα αλλαγής email δεν δημιουργήθηκε.");
    } finally {
      setEmailBusy("");
    }
  }

  async function cancelEmailChange() {
    setEmailError("");
    setEmailSuccess("");
    setDevelopmentVerificationUrl("");
    setEmailBusy("cancel");
    try {
      const response = await fetch("/api/account/security/email-change", {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken }
      });
      const body = await response.json() as { cancelled?: boolean; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Το αίτημα αλλαγής email δεν ακυρώθηκε.");
      setPendingEmailChange(null);
      setEmailSuccess("Το αίτημα αλλαγής email ακυρώθηκε. Το τρέχον email παραμένει ενεργό.");
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : "Το αίτημα αλλαγής email δεν ακυρώθηκε.");
    } finally {
      setEmailBusy("");
    }
  }

  const pendingLifecycle = pendingEmailChange ? [
    { label: "Τρέχον email", description: email, state: "done" as const },
    { label: "Επιβεβαίωση", description: `Άνοιξε τον σύνδεσμο που στάλθηκε στο ${pendingEmailChange.email}.`, state: "action" as const },
    { label: "Αλλαγή email", description: "Γίνεται μόνο μετά την επιβεβαίωση της νέας διεύθυνσης.", state: "pending" as const },
    { label: "Νέα σύνδεση", description: "Μετά την αλλαγή θα αποσυνδεθούν όλες οι συνεδρίες.", state: "pending" as const }
  ] : [];

  return <section className="shell customer-account-page">
    <div className="customer-page-heading"><div><div className="eyebrow">Ασφάλεια</div><h1>Σύνδεση, email & κωδικός</h1></div><p>Διαχειρίσου τα στοιχεία σύνδεσης χωρίς να χάνεται η επιβεβαίωση ιδιοκτησίας ή η ασφάλεια του λογαριασμού.</p></div>
    <div className="customer-account-grid customer-security-grid">
      <article className="customer-account-panel">
        <div className="eyebrow">Ταυτότητα λογαριασμού</div><h2>Email σύνδεσης</h2>
        <div className="customer-account-panel-list">
          <div className="customer-account-panel-row"><div><strong>{email}</strong><small>Αυτό παραμένει το email σύνδεσης μέχρι να επιβεβαιώσεις τη νέα διεύθυνση.</small></div><span className={emailVerified ? "status-pill" : "status-pill warning"}>{emailVerified ? "Επιβεβαιωμένο" : "Μη επιβεβαιωμένο"}</span></div>
        </div>

        {pendingEmailChange ? <div className="customer-security-email-change">
          <div className="customer-security-pending"><strong>Αναμονή επιβεβαίωσης</strong><p>Νέο email: <strong>{pendingEmailChange.email}</strong></p><small>Ο σύνδεσμος λήγει {new Date(pendingEmailChange.expiresAt).toLocaleString("el-GR")}.</small></div>
          <CustomerLifecycle label="Στάδια αλλαγής email" stages={pendingLifecycle} />
          <button className="button button-secondary" type="button" disabled={emailBusy === "cancel"} onClick={() => void cancelEmailChange()}>{emailBusy === "cancel" ? "Ακύρωση…" : "Ακύρωση αιτήματος"}</button>
        </div> : <form className="customer-security-form customer-email-change-form" onSubmit={requestEmailChange}>
          <label><span>Νέο email</span><input type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required disabled={!emailChangeReady} /></label>
          <label><span>Τρέχων κωδικός</span><input type="password" autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} required disabled={!emailChangeReady} /><small>Ζητείται πριν σταλεί επιβεβαίωση στη νέα διεύθυνση.</small></label>
          <button className="button" type="submit" disabled={!emailChangeReady || emailBusy === "request"}>{emailBusy === "request" ? "Αποστολή…" : "Αποστολή επιβεβαίωσης"}</button>
        </form>}
        {!emailChangeReady && <p className="account-action-error" role="status">{emailChangeMessage}</p>}
        {emailError && <p className="account-action-error" role="alert">{emailError}</p>}
        {emailSuccess && <p className="privacy-status" role="status">{emailSuccess}</p>}
        {developmentVerificationUrl && <p className="account-muted"><a className="text-link" href={developmentVerificationUrl}>Development: άνοιγμα συνδέσμου επιβεβαίωσης →</a></p>}
        <CustomerHowItWorks title="Πώς αλλάζει με ασφάλεια το email;"><p>Πρώτα επιβεβαιώνεις τον τρέχοντα κωδικό. Στέλνουμε σύνδεσμο μόνο στη νέα διεύθυνση και το παλιό email συνεχίζει να λειτουργεί μέχρι να επιλέξεις επιβεβαίωση εκεί. Ο σύνδεσμος λήγει σε 24 ώρες και χρησιμοποιείται μία φορά.</p></CustomerHowItWorks>
      </article>

      <article className="customer-account-panel">
        <div className="eyebrow">Κωδικός</div><h2>Αλλαγή κωδικού</h2>
        <form className="customer-security-form" onSubmit={submitPassword}>
          <label><span>Τρέχων κωδικός</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
          <label><span>Νέος κωδικός</span><input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><small>Τουλάχιστον 10 χαρακτήρες.</small></label>
          <label><span>Επανάληψη νέου κωδικού</span><input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          {passwordError && <p className="account-action-error" role="alert">{passwordError}</p>}
          <button className="button" type="submit" disabled={passwordBusy}>{passwordBusy ? "Αλλαγή…" : "Αλλαγή κωδικού"}</button>
        </form>
        <CustomerHowItWorks title="Τι γίνεται μετά την αλλαγή;"><p>Για λόγους ασφαλείας αποσυνδέονται όλες οι ενεργές συνεδρίες, συμπεριλαμβανομένης της τρέχουσας. Θα μεταφερθείς στη σύνδεση και θα χρησιμοποιήσεις τον νέο κωδικό.</p></CustomerHowItWorks>
      </article>
    </div>
  </section>;
}
