"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getHubExpansionPlan, type HubBillingCycle, type HubExpansionPlanCode } from "../lib/hub-expansion-plans";
import styles from "./HubExpansionApplicationForm.module.css";

type LookupStage = "afm" | "loading" | "matched";

const JOIN_AFM_STORAGE_KEY = "kontamou:vendor-join-afm";
const REWARD_STORAGE_KEY = "kontamou:research-onboarding-reward";

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
  checkedAt: number;
}>;

type ResolvedHub = Readonly<{
  id: string;
  slug: string;
  nameEl: string;
  regionEl: string;
  isLive: boolean;
  isSpartaLegacy: boolean;
}>;

type Receipt = Readonly<{
  reference: string;
  status: "pending";
  hubName: string;
  planCode: HubExpansionPlanCode;
  billingCycle: HubBillingCycle;
  recurringFeeCents: number;
  setupFeeCents?: number;
  originalSetupFeeCents?: number;
  setupDiscountCents?: number;
  rewardRedeemed?: boolean;
  paymentRequired: false;
  message: string;
  redirectTo?: string;
  trial?: Readonly<{ expiresAt: string }>;
}>;

type Props = Readonly<{
  planCode: HubExpansionPlanCode;
  billingCycle: HubBillingCycle;
  csrfToken?: string;
  signedInEmail?: string;
}>;

const categories = [
  "Εργαλεία & οικοδομικά",
  "Σπίτι & διακόσμηση",
  "Ηλεκτρικά & τεχνολογία",
  "Μόδα & υπόδηση",
  "Ομορφιά & προσωπική φροντίδα",
  "Παιδί & παιχνίδι",
  "Βιβλία & χαρτικά",
  "Δώρα & ειδικά είδη",
  "Αθλητικά & outdoor",
  "Αυτοκίνητο & μοτοσυκλέτα",
  "Άλλη μη διατροφική λιανική"
] as const;

export function HubExpansionApplicationForm({ planCode, billingCycle, csrfToken, signedInEmail }: Props) {
  const [busy, setBusy] = useState(false);
  const [lookupStage, setLookupStage] = useState<LookupStage>("afm");
  const [lookupError, setLookupError] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [company, setCompany] = useState<GemiCompany>();
  const [hub, setHub] = useState<ResolvedHub>();
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt>();
  const restoredAfmRef = useRef(false);
  const [rewardCode, setRewardCode] = useState("");
  const [rewardVerified, setRewardVerified] = useState(false);
  const [rewardChecking, setRewardChecking] = useState(false);
  const [rewardError, setRewardError] = useState("");
  const plan = getHubExpansionPlan(planCode)!;
  const euro = (cents: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);

  async function verifyReward(candidate: string) {
    setRewardChecking(true);
    setRewardVerified(false);
    setRewardError("");
    try {
      const response = await fetch("/api/hub-research-reward", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: candidate, planCode })
      });
      const data = await response.json() as { valid?: boolean; error?: string };
      if (!response.ok || !data.valid) throw new Error(data.error ?? "Ο κωδικός δεν είναι έγκυρος.");
      setRewardVerified(true);
      setRewardCode(candidate.trim().toUpperCase());
      sessionStorage.setItem(REWARD_STORAGE_KEY, candidate.trim().toUpperCase());
    } catch (cause) {
      sessionStorage.removeItem(REWARD_STORAGE_KEY);
      setRewardError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η επαλήθευση.");
    } finally { setRewardChecking(false); }
  }

  useEffect(() => {
    if (planCode === "claim") return;
    const stored = sessionStorage.getItem(REWARD_STORAGE_KEY);
    if (stored) { setRewardCode(stored); void verifyReward(stored); }
  }, [planCode]);

  const lookupCompany = useCallback(async (afmOverride?: string) => {
    const candidateAfm = (afmOverride ?? taxNumber).replace(/\D/g, "").slice(0, 9);
    if (candidateAfm.length !== 9) {
      setLookupError("Το ΑΦΜ πρέπει να έχει 9 ψηφία.");
      setLookupStage("afm");
      return;
    }
    setTaxNumber(candidateAfm);
    setLookupError("");
    setError("");
    setLookupStage("loading");
    try {
      const response = await fetch("/api/hubs/resolve-company-by-afm", {
        method: "POST",
        headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify({ afm: candidateAfm })
      });
      const data = await response.json() as {
        company?: GemiCompany;
        hub?: ResolvedHub;
        error?: string;
        redirectTo?: string;
      };
      if (!response.ok || !data.company || !data.hub) {
        throw new Error(data.error ?? "Δεν ήταν δυνατή η επαλήθευση της επιχείρησης και του HUB.");
      }
      if (data.hub.isSpartaLegacy) {
        window.location.assign(data.redirectTo ?? "/join/sparta");
        return;
      }
      setCompany(data.company);
      setHub(data.hub);
      setTaxNumber(data.company.afm);
      sessionStorage.setItem(JOIN_AFM_STORAGE_KEY, data.company.afm);
      setLookupStage("matched");
    } catch (cause) {
      setCompany(undefined);
      setHub(undefined);
      setLookupError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η επαλήθευση της επιχείρησης και του HUB.");
      setLookupStage("afm");
    }
  }, [taxNumber, csrfToken]);

  useEffect(() => {
    if (restoredAfmRef.current) return;
    restoredAfmRef.current = true;
    const storedAfm = (sessionStorage.getItem(JOIN_AFM_STORAGE_KEY) ?? "").replace(/\D/g, "").slice(0, 9);
    if (storedAfm.length !== 9) return;
    setTaxNumber(storedAfm);
    void lookupCompany(storedAfm);
  }, [lookupCompany]);

  function changeAfm() {
    setCompany(undefined);
    setHub(undefined);
    setLookupError("");
    setError("");
    sessionStorage.removeItem(JOIN_AFM_STORAGE_KEY);
    setLookupStage("afm");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload: Record<string, unknown> = Object.fromEntries(data.entries());
    payload.rewardCode = rewardCode.trim() || undefined;
    payload.acceptedAccuracy = data.get("acceptedAccuracy") === "on";
    payload.acceptedPrivacy = data.get("acceptedPrivacy") === "on";
    payload.acceptedProspectStatus = data.get("acceptedProspectStatus") === "on";

    try {
      const response = await fetch("/api/hub-prospect-application", {
        method: "POST",
        headers: { "content-type": "application/json", ...(csrfToken ? { "x-csrf-token": csrfToken } : {}) },
        body: JSON.stringify(payload)
      });
      const result = await response.json() as Partial<Receipt> & { error?: string; code?: string; redirectTo?: string; trial?: { expiresAt?: string } };
      if (!response.ok) {
        if (result.code === "sparta_uses_existing_join") {
          window.location.assign(result.redirectTo ?? "/join/sparta");
          return;
        }
        if (result.code === "login_required") {
          const returnTo = `/hubs/join/apply?plan=${encodeURIComponent(planCode)}&billing=${encodeURIComponent(billingCycle)}`;
          window.location.assign(`/login?next=${encodeURIComponent(returnTo)}`);
          return;
        }
        throw new Error(result.error ?? "Η αίτηση δεν καταχωρίστηκε.");
      }
      if (
        !result.reference ||
        result.status !== "pending" ||
        !result.hubName ||
        !result.planCode ||
        (result.billingCycle !== "annual" && result.billingCycle !== "monthly") ||
        typeof result.recurringFeeCents !== "number"
      ) {
        throw new Error("Η αίτηση καταχωρίστηκε αλλά δεν επιστράφηκε έγκυρη απόδειξη.");
      }
      sessionStorage.removeItem(JOIN_AFM_STORAGE_KEY);
      if (result.rewardRedeemed) sessionStorage.removeItem(REWARD_STORAGE_KEY);
      setReceipt({
        reference: result.reference,
        status: "pending",
        hubName: result.hubName,
        planCode: result.planCode,
        billingCycle: result.billingCycle,
        recurringFeeCents: result.recurringFeeCents,
        setupFeeCents: result.setupFeeCents,
        originalSetupFeeCents: result.originalSetupFeeCents,
        setupDiscountCents: result.setupDiscountCents,
        rewardRedeemed: result.rewardRedeemed,
        paymentRequired: false,
        message: result.message ?? "Η αίτηση καταχωρίστηκε.",
        redirectTo: result.redirectTo,
        trial: result.trial?.expiresAt ? { expiresAt: result.trial.expiresAt } : undefined
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Η αίτηση δεν καταχωρίστηκε.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    const billingText = receipt.planCode === "claim"
      ? "Δωρεάν"
      : `${receipt.billingCycle === "annual" ? "Ετήσια" : "Μηνιαία"} · ${formatEuro(receipt.recurringFeeCents)}`;
    return <div className={styles.receipt} role="status">
      <span className={styles.receiptMark}>✓</span>
      <div>
        <div className={styles.receiptEyebrow}>Η αίτηση καταχωρίστηκε</div>
        <h2>{receipt.hubName} · {receipt.planCode.toUpperCase()}</h2>
        <p>{receipt.message}</p>
        <div className={styles.reference}>Επιλογή <strong>{billingText}</strong></div>
        <div className={styles.reference}>Αριθμός αναφοράς <strong>{receipt.reference}</strong></div>
        {receipt.rewardRedeemed && <div className={styles.reference}>Ο κωδικός εξαργυρώθηκε με την υποβολή της αίτησης · εφάπαξ ένταξη <strong><s>{euro(receipt.originalSetupFeeCents ?? 0)}</s> {euro(receipt.setupFeeCents ?? 0)}</strong></div>}
        <p className={styles.receiptNote}>{receipt.redirectTo
          ? "Το HUB επιβεβαιώθηκε ξανά server-side από τα στοιχεία Γ.Ε.ΜΗ. Η αίτηση παραμένει σε έλεγχο, αλλά δημιουργήθηκε ιδιωτικό DEMO workspace για το 3ήμερο Trial. Δεν έγινε χρέωση και οι δημόσιες πωλήσεις παραμένουν κλειδωμένες."
          : "Το HUB επιβεβαιώθηκε ξανά server-side από τα στοιχεία Γ.Ε.ΜΗ. Η επιλογή χρέωσης αποθηκεύτηκε με την αίτηση. Δεν έγινε χρέωση και δεν δημιουργήθηκε ενεργός vendor λογαριασμός."}</p>
        {receipt.redirectTo && <a className="button" href={receipt.redirectTo}>Άνοιξε το 3ήμερο Vendor Trial →</a>}
        <a className="button button-secondary" href="/hubs/join">Επιστροφή στα προγράμματα</a>
      </div>
    </div>;
  }

  return <form className={styles.form} onSubmit={submit}>
    <input type="hidden" name="planCode" value={planCode} />
    <input type="hidden" name="billingCycle" value={billingCycle} />
    {planCode !== "claim" && <section className={styles.rewardPanel} aria-labelledby="hub-reward-title">
      <div className={styles.stepLabel}>Έκπτωση συμμετοχής στην έρευνα</div>
      <h2 id="hub-reward-title">Κωδικός ευχαριστίας · 50% στην ένταξη</h2>
      <p>Έχεις λάβει κωδικό μετά τη συμμετοχή σου στην έρευνα; Ισχύει μόνο για το εφάπαξ κόστος ένταξης — όχι για τη συνδρομή ή την προμήθεια.</p>
      <div className={styles.lookupRow}>
        <input aria-label="Κωδικός επιβράβευσης" autoComplete="off" placeholder="KM26-XXXX-XXXX-XXXX"
          value={rewardCode} maxLength={19} onChange={event => {
            setRewardCode(event.target.value.toUpperCase()); setRewardVerified(false); setRewardError("");
            sessionStorage.removeItem(REWARD_STORAGE_KEY);
          }} />
        <button type="button" className="button button-secondary" disabled={!rewardCode.trim() || rewardChecking}
          onClick={() => void verifyReward(rewardCode)}>{rewardChecking ? "Έλεγχος…" : "Επαλήθευση κωδικού"}</button>
      </div>
      {rewardError && <div role="alert" className={styles.error}>{rewardError}</div>}
      {rewardVerified && <p className={styles.rewardAccepted} role="status">✓ Έγκυρος κωδικός. Θα εξαργυρωθεί μόνο με επιτυχή υποβολή της αίτησης.</p>}
      <div className={styles.rewardPrices}>
        <div><small>Εφάπαξ κόστος ένταξης {plan.name}</small><strong>{rewardVerified ? <><s>{euro(plan.setupFeeCents)}</s> <span>{euro(plan.setupFeeCents / 2)}</span></> : euro(plan.setupFeeCents)}</strong></div>
        <div><small>Συνδρομή — χωρίς έκπτωση</small><strong>{euro(billingCycle === "annual" ? plan.annualFeeCents : plan.monthlyFeeCents)} / {billingCycle === "annual" ? "έτος" : "μήνα"}</strong></div>
      </div>
      <small>Τιμές προ ΦΠΑ, όπου εφαρμόζεται. Δεν γίνεται πληρωμή κατά την αίτηση.</small>
    </section>}
    <div className={styles.honeypot} aria-hidden="true"><label>Website<input name="companyWebsiteCheck" tabIndex={-1} autoComplete="off" /></label></div>

    <section className={styles.lookupPanel} aria-labelledby="afm-title">
      <div>
        <div className={styles.stepLabel}>1 · Ταυτοποίηση με ΑΦΜ</div>
        <h2 id="afm-title">Βρες την επιχείρησή σου στο Γ.Ε.ΜΗ.</h2>
        <p>Από το ΑΦΜ ανακτούμε τα δημόσια στοιχεία Γ.Ε.ΜΗ. και προσδιορίζουμε αυτόματα το σωστό KONTA MOY HUB από την επαληθευμένη τοποθεσία και τον ταχυδρομικό κώδικα.</p>
      </div>
      <label htmlFor="hub-vendor-tax-number">ΑΦΜ επιχείρησης *</label>
      <div className={styles.lookupRow}>
        <input
          id="hub-vendor-tax-number"
          name="taxNumber"
          required
          inputMode="numeric"
          pattern="[0-9]{9}"
          maxLength={9}
          placeholder="9 ψηφία"
          value={taxNumber}
          readOnly={lookupStage === "matched"}
          onChange={(event) => setTaxNumber(event.target.value.replace(/\D/g, "").slice(0, 9))}
        />
        {lookupStage === "matched"
          ? <button className="button button-secondary" type="button" onClick={changeAfm}>Αλλαγή ΑΦΜ</button>
          : <button className="button button-secondary" type="button" disabled={lookupStage === "loading" || taxNumber.length !== 9} onClick={() => void lookupCompany()}>{lookupStage === "loading" ? "Έλεγχος…" : "Ανάκτηση από ΓΕΜΗ"}</button>}
      </div>
      {lookupError && <div className={styles.error} role="alert">{lookupError}</div>}
    </section>

    {company && hub && <>
      <section className={styles.verifiedPanel} aria-label="Επαληθευμένη επιχείρηση και HUB">
        <div className={styles.verifiedHeader}>
          <div><span className={styles.verifiedBadge}>Γ.Ε.ΜΗ. ✓</span><strong>{company.tradingName ?? company.legalName}</strong><small>{company.legalName}</small></div>
          <div className={styles.hubResult}><span>Αυτόματο HUB</span><strong>{hub.nameEl}</strong><small>{hub.regionEl}</small></div>
        </div>
        <div className={styles.registryGrid}>
          <div><span>ΑΦΜ</span><strong>{company.afm}</strong></div>
          <div><span>Αρ. Γ.Ε.ΜΗ.</span><strong>{company.gemiNumber}</strong></div>
          <div><span>Διεύθυνση Γ.Ε.ΜΗ.</span><strong>{[company.address, company.city || company.municipality].filter(Boolean).join(", ") || "—"}</strong></div>
          <div><span>Τ.Κ.</span><strong>{company.postcode ?? "—"}</strong></div>
        </div>
        <p className={styles.lockedNote}>Το HUB δεν επιλέγεται χειροκίνητα. Κατά την τελική υποβολή το σύστημα επαναλαμβάνει την επαλήθευση ΑΦΜ → Γ.Ε.ΜΗ. → τοποθεσία → HUB.</p>
      </section>

      <fieldset>
        <legend>2. Στοιχεία συνεργασίας</legend>
        <div className={styles.grid}>
          <label>Εμπορική ονομασία <span>*</span><input name="businessName" required maxLength={120} autoComplete="organization" defaultValue={company.tradingName ?? company.legalName} /></label>
          <label>Ονοματεπώνυμο υπευθύνου <span>*</span><input name="contactName" required maxLength={120} autoComplete="name" /></label>
          <label>Email επικοινωνίας <span>*</span><input name="email" type="email" required maxLength={160} autoComplete="email" defaultValue={company.email ?? signedInEmail ?? ""} /></label>
          <label>Τηλέφωνο <span>*</span><input name="phone" type="tel" required maxLength={32} autoComplete="tel" defaultValue={company.phone ?? ""} /></label>
          <label>Κύρια κατηγορία <span>*</span><select name="primaryCategory" required defaultValue=""><option value="" disabled>Επίλεξε κατηγορία…</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label>Υφιστάμενο website / e-shop<input name="websiteUrl" type="url" maxLength={240} placeholder="https://…" defaultValue={company.url ?? ""} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>3. Σημερινή εμπορική παρουσία</legend>
        <div className={styles.grid}>
          <label className={styles.full}>Πού πουλάς σήμερα;<textarea name="currentSalesChannels" maxLength={600} rows={3} placeholder="π.χ. φυσικό κατάστημα, δικό μας e-shop, Skroutz, social media…" /></label>
          <label className={styles.full}>Σημειώσεις / τι θα ήθελες από το ΚΟΝΤΑ ΜΟΥ;<textarea name="notes" maxLength={1500} rows={4} /></label>
        </div>
      </fieldset>

      <div className={styles.consentBox}>
        <label><input type="checkbox" name="acceptedAccuracy" required /> <span>Επιβεβαιώνω ότι έχω ελέγξει τα στοιχεία και μπορώ να εκπροσωπώ ή να υποβάλω ενδιαφέρον για αυτή την επιχείρηση.</span></label>
        <label><input type="checkbox" name="acceptedProspectStatus" required /> <span>Κατανοώ ότι αυτή είναι αίτηση prospect για HUB επέκτασης. Σε εμπορικό πλάνο μπορεί να ανοίξει ιδιωτικό 3ήμερο DEMO Trial, αλλά δεν ενεργοποιεί δημόσιες πωλήσεις, συνδρομή ή χρέωση.</span></label>
        <label><input type="checkbox" name="acceptedPrivacy" required /> <span>Συμφωνώ με την επεξεργασία των στοιχείων για επαλήθευση, επικοινωνία και προετοιμασία της συνεργασίας σύμφωνα με την πολιτική απορρήτου.</span></label>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      <button className={`button ${styles.submit}`} type="submit" disabled={busy}>{busy ? "Καταχώριση…" : planCode === "claim" ? "Υποβολή δωρεάν CLAIM" : `Υποβολή ενδιαφέροντος · ${planCode.toUpperCase()} · ${billingCycle === "annual" ? "Ετήσια" : "Μηνιαία"}`}</button>
      <p className={styles.noPayment}>Δεν ζητούνται στοιχεία κάρτας. Για εμπορικό πλάνο, οποιαδήποτε χρέωση συμφωνείται μόνο μετά το verification και πριν από την ενεργοποίηση.</p>
    </>}
  </form>;
}

function formatEuro(cents: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
