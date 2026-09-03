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

type RequestedPlanCode = "founding_2026" | "annual" | "monthly";
type LookupStage = "afm" | "loading" | "matched" | "manual";

type GemiCompany = Readonly<{
  afm: string;
  gemiNumber: string;
  legalName: string;
  tradingName?: string;
  companyStatus?: string;
  legalType?: string;
  address?: string;
  city?: string;
  municipality?: string;
  prefecture?: string;
  postcode?: string;
  email?: string;
  phone?: string;
  url?: string;
}>;

type Receipt = Readonly<{
  reference: string;
  accountClaimRequired: boolean;
  registryLookupStatus?: "matched" | "not_found" | "unavailable";
  message: string;
}>;

type VendorApplicationFormProps = Readonly<{
  csrfToken?: string;
  signedInEmail?: string;
  initialPlanCode?: RequestedPlanCode;
  claimedResearchVendorId?: string;
  claimTargetName?: string;
}>;

export function VendorApplicationForm({
  csrfToken,
  signedInEmail,
  initialPlanCode = "annual",
  claimedResearchVendorId,
  claimTargetName
}: VendorApplicationFormProps) {
  const [busy, setBusy] = useState(false);
  const [lookupStage, setLookupStage] = useState<LookupStage>("afm");
  const [lookupError, setLookupError] = useState("");
  const [manualAllowed, setManualAllowed] = useState(false);
  const [taxNumber, setTaxNumber] = useState("");
  const [company, setCompany] = useState<GemiCompany | undefined>();
  const [legalName, setLegalName] = useState("");
  const [tradingName, setTradingName] = useState(claimTargetName ?? "");
  const [gemiNumber, setGemiNumber] = useState("");
  const [contactEmail, setContactEmail] = useState(signedInEmail ?? "");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [receipt, setReceipt] = useState<Receipt | undefined>();
  const returnPath = `/join/apply?plan=${encodeURIComponent(initialPlanCode)}${claimedResearchVendorId ? `&claim=${encodeURIComponent(claimedResearchVendorId)}` : ""}`;
  const loginHref = `/login?next=${encodeURIComponent(returnPath)}`;

  async function lookupCompany() {
    setLookupError("");
    setManualAllowed(false);
    setError("");
    setLookupStage("loading");
    try {
      const response = await fetch("/api/gemi/company-by-afm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ afm: taxNumber })
      });
      const data = await response.json() as { company?: GemiCompany; error?: string; allowManual?: boolean };
      if (!response.ok || !data.company) {
        setManualAllowed(Boolean(data.allowManual));
        throw new Error(data.error ?? "Δεν ήταν δυνατή η αναζήτηση στο Γ.Ε.ΜΗ.");
      }
      const result = data.company;
      setCompany(result);
      setTaxNumber(result.afm);
      setLegalName(result.legalName);
      setTradingName(result.tradingName ?? claimTargetName ?? result.legalName);
      setGemiNumber(result.gemiNumber);
      setContactEmail(result.email ?? signedInEmail ?? "");
      setPhone(result.phone ?? "");
      setAddress(result.address ?? "");
      setPostcode(result.postcode ?? "");
      setLookupStage("matched");
    } catch (cause) {
      setLookupError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η αναζήτηση στο Γ.Ε.ΜΗ.");
      setLookupStage("afm");
    }
  }

  function continueManually() {
    setCompany(undefined);
    setLegalName("");
    setTradingName(claimTargetName ?? "");
    setGemiNumber("");
    setContactEmail(signedInEmail ?? "");
    setPhone("");
    setAddress("");
    setPostcode("");
    setLookupError("");
    setManualAllowed(false);
    setLookupStage("manual");
  }

  function changeAfm() {
    setCompany(undefined);
    setLegalName("");
    setTradingName(claimTargetName ?? "");
    setGemiNumber("");
    setContactEmail(signedInEmail ?? "");
    setPhone("");
    setAddress("");
    setPostcode("");
    setLookupError("");
    setManualAllowed(false);
    setError("");
    setErrorCode("");
    setLookupStage("afm");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setErrorCode("");
    const formData = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
    payload.acceptedAccuracy = formData.get("acceptedAccuracy") === "on";
    payload.acceptedGovernedOnboarding = formData.get("acceptedGovernedOnboarding") === "on";
    payload.acceptedPrivacy = formData.get("acceptedPrivacy") === "on";
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
      setReceipt({
        reference: data.reference,
        accountClaimRequired: data.accountClaimRequired,
        registryLookupStatus: data.registryLookupStatus,
        message: data.message ?? "Η αίτηση καταχωρίστηκε."
      });
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
      {receipt.registryLookupStatus === "matched" && <div className="fairness-note"><strong>Γ.Ε.ΜΗ. ✓</strong><p>Η νομική ταυτότητα της επιχείρησης διασταυρώθηκε από το Γ.Ε.ΜΗ. Η εκπροσώπηση και τα στοιχεία επικοινωνίας παραμένουν σε έλεγχο.</p></div>}
      <div className="fairness-note">
        <strong>Τι γίνεται τώρα</strong>
        <p>1. Ελέγχουμε ότι ο αιτών μπορεί να εκπροσωπήσει την επιχείρηση και επιβεβαιώνουμε τα στοιχεία επικοινωνίας.</p>
        <p>2. Τα στοιχεία Γ.Ε.ΜΗ. που βρέθηκαν παραμένουν ως registry evidence· τυχόν διαφορετικό email/τηλέφωνο ελέγχεται ως applicant-provided.</p>
        <p>3. Μόνο μετά τον έλεγχο περνάμε σε catalog onboarding και δοκιμαστική λειτουργία.</p>
        <p>4. Η ενεργοποίηση vendor dashboard γίνεται αποκλειστικά από Admin μετά τα gates.</p>
      </div>
      {receipt.accountClaimRequired ? <p>Έχει δεσμευτεί προσωρινά η ταυτότητα του email σου για την αίτηση, <strong>χωρίς δυνατότητα σύνδεσης</strong>. Όταν ενεργοποιηθεί η ασφαλής επιβεβαίωση email, θα μπορείς να δημιουργήσεις κωδικό και να διεκδικήσεις τον λογαριασμό από τη σελίδα εγγραφής.</p> : <p>Η αίτηση έχει συνδεθεί με τον ήδη επαληθευμένο λογαριασμό σου.</p>}
      <div className="hero-actions"><a className="button" href="/join">Επιστροφή στο Vendor Hub</a><a className="button button-secondary" href="/fairness">Πώς λειτουργεί η δικαιοσύνη</a></div>
    </div>;
  }

  return <form className={`login-form ${styles.form}`} onSubmit={submit}>
    {claimedResearchVendorId && <>
      <input type="hidden" name="claimedResearchVendorId" value={claimedResearchVendorId} />
      <div className="fairness-note">
        <strong>Διεκδίκηση υπάρχουσας σελίδας{claimTargetName ? ` · ${claimTargetName}` : ""}</strong>
        <p>Το ΑΦΜ και το Γ.Ε.ΜΗ. θα χρησιμοποιηθούν και ως πρόσθετο evidence για τη διεκδίκηση. Η σελίδα παραμένει αμετάβλητη μέχρι την επιβεβαίωση από Admin.</p>
      </div>
    </>}

    <div className="eyebrow">1 · Ταυτοποίηση με ΑΦΜ</div>
    <label htmlFor="vendor-tax-number">ΑΦΜ επιχείρησης *</label>
    <div className={styles.twoColumn}>
      <input
        id="vendor-tax-number"
        name="taxNumber"
        required
        inputMode="numeric"
        pattern="[0-9]{9}"
        maxLength={9}
        placeholder="9 ψηφία"
        value={taxNumber}
        readOnly={lookupStage === "matched" || lookupStage === "manual"}
        onChange={(event) => setTaxNumber(event.target.value.replace(/\D/g, "").slice(0, 9))}
      />
      {lookupStage === "afm" || lookupStage === "loading"
        ? <button className="button button-secondary" type="button" disabled={lookupStage === "loading" || taxNumber.length !== 9} onClick={lookupCompany}>{lookupStage === "loading" ? "Αναζήτηση…" : "Ανάκτηση από Γ.Ε.ΜΗ."}</button>
        : <button className="button button-secondary" type="button" onClick={changeAfm}>Αλλαγή ΑΦΜ</button>}
    </div>
    <small>Βάλε το ΑΦΜ της επιχείρησής σου και θα συμπληρώσουμε αυτόματα τα διαθέσιμα στοιχεία από το Γ.Ε.ΜΗ.</small>
    {lookupError && <div className="account-gate" role="alert"><strong>Δεν ολοκληρώθηκε η αναζήτηση.</strong><p>{lookupError}</p>{manualAllowed && <button className="button button-secondary" type="button" onClick={continueManually}>Συνέχεια με χειροκίνητη συμπλήρωση</button>}</div>}

    {lookupStage === "matched" && company && <div className="fairness-note" role="status">
      <strong>Βρήκαμε την επιχείρησή σου ✓</strong>
      <p><strong>{company.legalName}</strong>{company.tradingName ? ` · ${company.tradingName}` : ""}</p>
      <p>ΑΦΜ {company.afm} · ΓΕΜΗ {company.gemiNumber}{company.legalType ? ` · ${company.legalType}` : ""}</p>
      {(company.address || company.city || company.postcode) && <p>{[company.address, company.postcode, company.city].filter(Boolean).join(" · ")}</p>}
      {company.companyStatus && <p>Κατάσταση Γ.Ε.ΜΗ.: <strong>{company.companyStatus}</strong></p>}
      <p>Η εύρεση στο Γ.Ε.ΜΗ. επιβεβαιώνει τη νομική ταυτότητα της επιχείρησης, όχι ότι ο αιτών είναι εξουσιοδοτημένος εκπρόσωπος. Αυτό παραμένει μέρος του verification.</p>
    </div>}

    {(lookupStage === "matched" || lookupStage === "manual") && <>
      <div className="eyebrow">2 · Στοιχεία επιχείρησης</div>
      <label htmlFor="vendor-legal-name">Νομική επωνυμία *</label>
      <input id="vendor-legal-name" name="legalName" required maxLength={160} autoComplete="organization" value={legalName} readOnly={lookupStage === "matched"} onChange={(event) => setLegalName(event.target.value)} />
      {lookupStage === "matched" && <small>Η νομική επωνυμία προέρχεται από το Γ.Ε.ΜΗ. και θα επαληθευτεί ξανά server-side κατά την υποβολή.</small>}

      <label htmlFor="vendor-trading-name">Εμπορική ονομασία / διακριτικός τίτλος *</label>
      <input id="vendor-trading-name" name="tradingName" required maxLength={120} value={tradingName} onChange={(event) => setTradingName(event.target.value)} />

      <label htmlFor="vendor-gemi">Αριθμός ΓΕΜΗ</label>
      <input id="vendor-gemi" name="gemiNumber" inputMode="numeric" pattern="[0-9]{8,20}" maxLength={20} value={gemiNumber} readOnly={lookupStage === "matched"} onChange={(event) => setGemiNumber(event.target.value.replace(/\D/g, "").slice(0, 20))} />

      <div className="eyebrow">3 · Επικοινωνία</div>
      <label htmlFor="vendor-email">Email επικοινωνίας *</label>
      <input id="vendor-email" name="contactEmail" type="email" required maxLength={254} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} autoComplete="email" />
      {lookupStage === "matched" && company?.email
        ? <small>Βρέθηκε email στο Γ.Ε.ΜΗ. και συμπληρώθηκε αυτόματα. Μπορείς να το αλλάξεις αν θέλεις άλλο email επικοινωνίας· τότε θα καταγραφεί ως applicant-provided.</small>
        : <small>Δεν βρήκαμε email επικοινωνίας στο Γ.Ε.ΜΗ. Συμπλήρωσε το email που θέλεις να χρησιμοποιεί το ΚΟΝΤΑ ΜΟΥ.</small>}
      {signedInEmail && <small>Είσαι συνδεδεμένος ως {signedInEmail}. Ο ιδιοκτήτης της αίτησης παραμένει αυτός ο επαληθευμένος λογαριασμός, ακόμη κι αν το business contact email είναι διαφορετικό.</small>}

      <label htmlFor="vendor-phone">Τηλέφωνο επικοινωνίας *</label>
      <input id="vendor-phone" name="phone" type="tel" required maxLength={32} autoComplete="tel" placeholder="27310… ή +30…" value={phone} onChange={(event) => setPhone(event.target.value)} />
      {lookupStage === "matched" && company?.phone
        ? <small>Βρέθηκε τηλέφωνο στο Γ.Ε.ΜΗ. και συμπληρώθηκε αυτόματα. Μπορείς να το αλλάξεις.</small>
        : <small>Δεν βρήκαμε τηλέφωνο επικοινωνίας στο Γ.Ε.ΜΗ. Συμπλήρωσε ένα τηλέφωνο για την αίτηση.</small>}

      <div className="eyebrow">4 · Φυσικό κατάστημα</div>
      <label htmlFor="vendor-address">Διεύθυνση καταστήματος *</label>
      <input id="vendor-address" name="address" required maxLength={180} autoComplete="street-address" placeholder="Οδός και αριθμός" value={address} onChange={(event) => setAddress(event.target.value)} />
      {lookupStage === "matched" && company?.address && <small>Προ-συμπληρώθηκε η έδρα από το Γ.Ε.ΜΗ. Αν το φυσικό κατάστημα βρίσκεται αλλού, άλλαξε τη διεύθυνση εδώ.</small>}

      <label htmlFor="vendor-postcode">Ταχυδρομικός κώδικας *</label>
      <input id="vendor-postcode" name="postcode" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" placeholder="23100" value={postcode} onChange={(event) => setPostcode(event.target.value.replace(/\D/g, "").slice(0, 5))} />
      <small>Η ομάδα θα επαληθεύσει ότι το κατάστημα βρίσκεται στη Σπάρτη ή στην επιλέξιμη ζώνη του marketplace.</small>

      <label htmlFor="vendor-category">Κύρια κατηγορία *</label>
      <select id="vendor-category" name="primaryCategory" required defaultValue="">
        <option value="" disabled>Επίλεξε κατηγορία</option>
        {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>

      <div className="eyebrow">5 · Συνεργασία</div>
      <label htmlFor="vendor-plan">Πρόγραμμα συνεργασίας *</label>
      <select id="vendor-plan" name="requestedPlanCode" required defaultValue={initialPlanCode}>
        <option value="founding_2026">Founding Partner — €1.500 εφάπαξ · €0 συνδρομή · 2% προμήθεια</option>
        <option value="annual">Annual — €299 εφάπαξ · €399/έτος · 5% προμήθεια</option>
        <option value="monthly">Monthly — €499 εφάπαξ · €49/μήνα · 7% προμήθεια</option>
      </select>
      <small>Η επιλογή είναι δήλωση ενδιαφέροντος. Δεν δημιουργεί χρέωση ή σύμβαση. Οι τελικοί όροι επιβεβαιώνονται πριν από την ενεργοποίηση.</small>

      <label htmlFor="vendor-story">Πες μας για το κατάστημα</label>
      <textarea id="vendor-story" name="shopStory" rows={6} maxLength={1500} placeholder="Τι πουλάτε, τι σας ξεχωρίζει, σε τι είδους συμβουλή μπορείτε να βοηθήσετε τον πελάτη, πώς διαχειρίζεστε σήμερα προϊόντα και stock;" />

      <div className="fairness-note">
        <strong>Σημαντικό: η αίτηση δεν είναι vendor registration access</strong>
        <p>Η υποβολή δημιουργεί μόνο ένα ελεγχόμενο application record με κατάσταση <code>verification_pending</code>. Το Γ.Ε.ΜΗ. μειώνει τη χειροκίνητη καταχώριση και ενισχύει το evidence, αλλά δεν παρακάμπτει ownership/contact verification ή Admin activation.</p>
      </div>

      <label className="checkbox-row" htmlFor="vendor-accuracy"><input id="vendor-accuracy" name="acceptedAccuracy" type="checkbox" required /><span>Δηλώνω ότι τα στοιχεία της επιχείρησης και τυχόν αλλαγές που έκανα στα προ-συμπληρωμένα στοιχεία είναι ακριβή και μπορώ να τα τεκμηριώσω.</span></label>
      <label className="checkbox-row" htmlFor="vendor-governance"><input id="vendor-governance" name="acceptedGovernedOnboarding" type="checkbox" required /><span>Κατανοώ ότι η συνεργασία απαιτεί επαλήθευση εκπροσώπησης/επικοινωνίας, catalog onboarding, test readiness και τελική ενεργοποίηση από Admin.</span></label>
      <label className="checkbox-row" htmlFor="vendor-privacy"><input id="vendor-privacy" name="acceptedPrivacy" type="checkbox" required /><span>Συμφωνώ με την επεξεργασία των στοιχείων της αίτησης και την ανάκτηση δημοσιευμένων εταιρικών στοιχείων από το Γ.Ε.ΜΗ. για ταυτοποίηση/αξιολόγηση και έχω διαβάσει τα <a href="/privacy-controls">privacy controls</a>.</span></label>

      <div className={styles.honeypot} aria-hidden="true"><label htmlFor="vendor-website">Website</label><input id="vendor-website" name="website" tabIndex={-1} autoComplete="off" /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {errorCode === "login_required" && <a className="button button-secondary" href={loginHref}>Σύνδεση και επιστροφή στην αίτηση</a>}
      <button className="button" type="submit" disabled={busy}>{busy ? "Καταχώριση…" : "Υποβολή για έλεγχο"}</button>
      {!signedInEmail && <p className="login-demo-note">Έχεις ήδη λογαριασμό; <a className="text-link" href={loginHref}>Συνδέσου πριν την αίτηση →</a></p>}
    </>}
  </form>;
}
