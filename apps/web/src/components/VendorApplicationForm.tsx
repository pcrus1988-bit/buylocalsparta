"use client";

import { useState, type FormEvent } from "react";
import styles from "./VendorApplicationForm.module.css";

const categories = [
  ["home-living", "Για το σπίτι · φωτισμός · διακόσμηση"],
  ["fashion", "Μόδα · παπούτσια · αξεσουάρ · γάμος"],
  ["beauty", "Ομορφιά · προσωπική φροντίδα"],
  ["kids", "Παιδί · παιχνίδι · hobby"],
  ["technology", "Τεχνολογία · ηλεκτρικά · ηλεκτρονικά"],
  ["gifts", "Δώρα · βιβλία · χαρτικά · ειδικά είδη"]
] as const;

type Receipt = Readonly<{
  reference: string;
  accountClaimRequired: boolean;
  message: string;
}>;

export function VendorApplicationForm({ csrfToken, signedInEmail }: { csrfToken?: string; signedInEmail?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [receipt, setReceipt] = useState<Receipt | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setErrorCode("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    payload.acceptedAccuracy = form.get("acceptedAccuracy") === "on";
    payload.acceptedGovernedOnboarding = form.get("acceptedGovernedOnboarding") === "on";
    payload.acceptedPrivacy = form.get("acceptedPrivacy") === "on";
    try {
      const response = await fetch("/api/vendor-application", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json() as Partial<Receipt> & { error?: string; code?: string };
      if (!response.ok) {
        setErrorCode(data.code ?? "");
        throw new Error(data.error ?? "Η αίτηση δεν καταχωρίστηκε.");
      }
      if (!data.reference || typeof data.accountClaimRequired !== "boolean") throw new Error("Η αίτηση καταχωρίστηκε αλλά δεν επιστράφηκε αριθμός αναφοράς.");
      setReceipt({ reference: data.reference, accountClaimRequired: data.accountClaimRequired, message: data.message ?? "Η αίτηση καταχωρίστηκε." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αίτηση δεν καταχωρίστηκε.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return <div className="account-gate" role="status">
      <div className="eyebrow">Application received</div>
      <h2>Η αίτηση μπήκε σε έλεγχο.</h2>
      <p>{receipt.message}</p>
      <p><strong>Αριθμός αναφοράς:</strong> <code>{receipt.reference}</code></p>
      <div className="fairness-note">
        <strong>Τι γίνεται τώρα</strong>
        <p>1. Ελέγχουμε τα στοιχεία της επιχείρησης και την επιλεξιμότητα για την αγορά της Σπάρτης.</p>
        <p>2. Επιβεβαιώνουμε τα στοιχεία επικοινωνίας, ΑΦΜ/ΓΕΜΗ όπου απαιτείται και τις εμπορικές προϋποθέσεις.</p>
        <p>3. Μόνο μετά τον έλεγχο περνάμε σε catalog onboarding και δοκιμαστική λειτουργία.</p>
        <p>4. Η ενεργοποίηση vendor dashboard γίνεται αποκλειστικά από Admin μετά τα gates.</p>
      </div>
      {receipt.accountClaimRequired ? <p>Έχει δεσμευτεί προσωρινά η ταυτότητα του email σου για την αίτηση, <strong>χωρίς δυνατότητα σύνδεσης</strong>. Όταν ενεργοποιηθεί η ασφαλής επιβεβαίωση email, θα μπορείς να δημιουργήσεις κωδικό και να διεκδικήσεις τον λογαριασμό από τη σελίδα εγγραφής.</p> : <p>Η αίτηση έχει συνδεθεί με τον ήδη επαληθευμένο λογαριασμό σου.</p>}
      <div className="hero-actions"><a className="button" href="/join">Επιστροφή στο Vendor Hub</a><a className="button button-secondary" href="/fairness">Πώς λειτουργεί η δικαιοσύνη</a></div>
    </div>;
  }

  return <form className="login-form" onSubmit={submit}>
    <div className="eyebrow">1 · Επιχείρηση</div>
    <label htmlFor="vendor-legal-name">Νομική επωνυμία *</label>
    <input id="vendor-legal-name" name="legalName" required maxLength={160} autoComplete="organization" />

    <label htmlFor="vendor-trading-name">Εμπορική ονομασία / διακριτικός τίτλος *</label>
    <input id="vendor-trading-name" name="tradingName" required maxLength={120} />

    <div className={styles.twoColumn}>
      <label htmlFor="vendor-tax-number"><span>ΑΦΜ *</span><input id="vendor-tax-number" name="taxNumber" required inputMode="numeric" pattern="[0-9]{9}" maxLength={9} placeholder="9 ψηφία" /></label>
      <label htmlFor="vendor-gemi"><span>Αριθμός ΓΕΜΗ</span><input id="vendor-gemi" name="gemiNumber" inputMode="numeric" pattern="[0-9]{8,20}" maxLength={20} /></label>
    </div>

    <div className="eyebrow">2 · Υπεύθυνος & επικοινωνία</div>
    <label htmlFor="vendor-email">Email επικοινωνίας *</label>
    <input id="vendor-email" name="contactEmail" type="email" required maxLength={254} defaultValue={signedInEmail ?? ""} autoComplete="email" />
    {signedInEmail ? <small>Είσαι συνδεδεμένος ως {signedInEmail}. Μπορείς να χρησιμοποιήσεις διαφορετικό business contact email χωρίς να αλλάξει ο ιδιοκτήτης της αίτησης.</small> : <small>Αν αυτό το email ανήκει ήδη σε λογαριασμό Buy Local Sparta, θα σου ζητηθεί πρώτα σύνδεση για προστασία της ιδιοκτησίας της αίτησης.</small>}

    <label htmlFor="vendor-phone">Τηλέφωνο *</label>
    <input id="vendor-phone" name="phone" type="tel" required maxLength={32} autoComplete="tel" placeholder="27310… ή +30…" />

    <div className="eyebrow">3 · Φυσικό κατάστημα</div>
    <label htmlFor="vendor-address">Διεύθυνση καταστήματος *</label>
    <input id="vendor-address" name="address" required maxLength={180} autoComplete="street-address" placeholder="Οδός και αριθμός" />

    <label htmlFor="vendor-postcode">Ταχυδρομικός κώδικας *</label>
    <input id="vendor-postcode" name="postcode" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" placeholder="23100" />
    <small>Η ομάδα θα επαληθεύσει ότι το κατάστημα βρίσκεται στη Σπάρτη ή στην επιλέξιμη ζώνη του marketplace.</small>

    <label htmlFor="vendor-category">Κύρια κατηγορία *</label>
    <select id="vendor-category" name="primaryCategory" required defaultValue="">
      <option value="" disabled>Επίλεξε κατηγορία</option>
      {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>

    <div className="eyebrow">4 · Συνεργασία</div>
    <label htmlFor="vendor-plan">Ενδιαφέρον προγράμματος *</label>
    <select id="vendor-plan" name="requestedPlanCode" required defaultValue="founding_2026">
      <option value="founding_2026">Founding / Early Bird — 36 μήνες · €1.500 + ΦΠΑ · μετά από έγκριση</option>
      <option value="free_listing">Free Listing — προφίλ/συμβουλή, χωρίς checkout</option>
    </select>
    <small>Η επιλογή είναι δήλωση ενδιαφέροντος. Δεν δημιουργεί χρέωση ή σύμβαση. Οι τελικοί όροι επιβεβαιώνονται πριν από την ενεργοποίηση.</small>

    <label htmlFor="vendor-story">Πες μας για το κατάστημα</label>
    <textarea id="vendor-story" name="shopStory" rows={6} maxLength={1500} placeholder="Τι πουλάτε, τι σας ξεχωρίζει, σε τι είδους συμβουλή μπορείτε να βοηθήσετε τον πελάτη, πώς διαχειρίζεστε σήμερα προϊόντα και stock;" />

    <div className="fairness-note">
      <strong>Σημαντικό: η αίτηση δεν είναι vendor registration access</strong>
      <p>Η υποβολή δημιουργεί μόνο ένα ελεγχόμενο application record με κατάσταση <code>verification_pending</code>. Δεν δημιουργεί ενεργό vendor, προϊόντα, offer visibility ή πρόσβαση σε dashboard.</p>
    </div>

    <label className="checkbox-row" htmlFor="vendor-accuracy"><input id="vendor-accuracy" name="acceptedAccuracy" type="checkbox" required /><span>Δηλώνω ότι τα στοιχεία της επιχείρησης είναι ακριβή και μπορώ να τα τεκμηριώσω.</span></label>
    <label className="checkbox-row" htmlFor="vendor-governance"><input id="vendor-governance" name="acceptedGovernedOnboarding" type="checkbox" required /><span>Κατανοώ ότι η συνεργασία απαιτεί επαλήθευση, catalog onboarding, test readiness και τελική ενεργοποίηση από Admin.</span></label>
    <label className="checkbox-row" htmlFor="vendor-privacy"><input id="vendor-privacy" name="acceptedPrivacy" type="checkbox" required /><span>Συμφωνώ με την επεξεργασία των στοιχείων για αξιολόγηση της αίτησης και έχω διαβάσει τα <a href="/privacy-controls">privacy controls</a>.</span></label>

    <div className={styles.honeypot} aria-hidden="true"><label htmlFor="vendor-website">Website</label><input id="vendor-website" name="website" tabIndex={-1} autoComplete="off" /></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {errorCode === "login_required" && <a className="button button-secondary" href="/login?next=%2Fjoin%2Fapply">Σύνδεση και επιστροφή στην αίτηση</a>}
    <button className="button" type="submit" disabled={busy}>{busy ? "Καταχώριση…" : "Υποβολή για έλεγχο"}</button>
    {!signedInEmail && <p className="login-demo-note">Έχεις ήδη λογαριασμό; <a className="text-link" href="/login?next=%2Fjoin%2Fapply">Συνδέσου πριν την αίτηση →</a></p>}
  </form>;
}
