"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { productPublicPath } from "../lib/product-url";
import type {
  SportActivity,
  SportAudience,
  SportDistance,
  SportFitRecommendation,
  SportFitScoredProduct,
  SportFrequency,
  SportPriority,
  SportSurface
} from "../lib/sport-fit-engine";
import styles from "./SportFitStudioExperience.module.css";

type Step = "activity" | "profile" | "details" | "results";

type ApiResponse = Readonly<{
  vendorId: string;
  vendorName: string;
  candidateCount: number;
  sizeGuide?: Readonly<{
    measurementMm: number;
    exact: boolean;
    outOfRange: boolean;
    sizeLabels: readonly string[];
    publisher: string;
    sizeSystem: string;
    measurementHelp?: string;
  }>;
  recommendation: SportFitRecommendation;
  error?: string;
}>;

const ACTIVITIES: readonly Readonly<{ key: SportActivity; icon: string; title: string; body: string }>[] = [
  { key: "running", icon: "↗", title: "Τρέξιμο", body: "Παπούτσι, κάλτσες και αθλητικό set για τον τρόπο που τρέχεις." },
  { key: "walking", icon: "→", title: "Περπάτημα", body: "Άνεση και καθημερινή κίνηση χωρίς ατελείωτα φίλτρα." },
  { key: "gym", icon: "＋", title: "Γυμναστήριο", body: "Training παπούτσι, ρούχα και χρήσιμα συμπληρώματα." },
  { key: "football", icon: "◉", title: "Ποδόσφαιρο", body: "Παπούτσι, κάλτσες και εξοπλισμός με βάση το γήπεδο." }
];

const AUDIENCES: readonly Readonly<{ key: SportAudience; label: string }>[] = [
  { key: "men", label: "Άνδρας" },
  { key: "women", label: "Γυναίκα" },
  { key: "kids", label: "Παιδί" }
];

const PRIORITIES: readonly Readonly<{ key: SportPriority; label: string; body: string }>[] = [
  { key: "comfort", label: "Άνεση", body: "Για καθημερινή, ξεκούραστη χρήση." },
  { key: "cushioning", label: "Απορρόφηση", body: "Δίνουμε βάρος σε cushioning / foam signals." },
  { key: "lightweight", label: "Ελαφριά αίσθηση", body: "Προτεραιότητα σε ελαφριά ή speed-oriented μοντέλα." },
  { key: "stability", label: "Σταθερότητα", body: "Προτιμάμε προϊόντα με σαφή ένδειξη support / stability." },
  { key: "versatility", label: "Πολυχρηστικότητα", body: "Ισορροπημένη επιλογή για διαφορετικές χρήσεις." }
];

const FREQUENCIES: readonly Readonly<{ key: SportFrequency; label: string }>[] = [
  { key: "light", label: "1–2 φορές / εβδομάδα" },
  { key: "regular", label: "3–4 φορές / εβδομάδα" },
  { key: "high", label: "5+ φορές / εβδομάδα" }
];

const DISTANCES: readonly Readonly<{ key: SportDistance; label: string }>[] = [
  { key: "short", label: "Έως 5 km" },
  { key: "medium", label: "5–10 km" },
  { key: "long", label: "10+ km" }
];

function surfacesFor(activity: SportActivity): readonly Readonly<{ key: SportSurface; label: string }>[] {
  if (activity === "football") return [
    { key: "grass", label: "Φυσικό χορτάρι" },
    { key: "artificial", label: "Συνθετικό / turf" },
    { key: "indoor", label: "Indoor / futsal" }
  ];
  if (activity === "gym") return [
    { key: "indoor", label: "Γυμναστήριο" },
    { key: "treadmill", label: "Διάδρομος" },
    { key: "mixed", label: "Μικτή προπόνηση" }
  ];
  return [
    { key: "road", label: "Άσφαλτος" },
    { key: "treadmill", label: "Διάδρομος" },
    { key: "trail", label: "Χώμα / trail" },
    { key: "mixed", label: "Μικτή χρήση" }
  ];
}

function activityLabel(activity: SportActivity): string {
  return ACTIVITIES.find((item) => item.key === activity)?.title ?? activity;
}

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function ProductImage({ product }: { product: SportFitScoredProduct }) {
  const src = product.previewImageSrc || `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  return <img src={src} alt={product.mediaAlt ?? product.title} loading="lazy" decoding="async" referrerPolicy={src.startsWith("https://") ? "strict-origin-when-cross-origin" : undefined} />;
}

function MatchBar({ score }: { score: number }) {
  return <div className={styles.matchLine} aria-label={`Ταίριασμα ${score}%`}><span style={{ width: `${score}%` }} /><b>{score}%</b></div>;
}

function ProductResultCard({ product, featured = false }: { product: SportFitScoredProduct; featured?: boolean }) {
  return (
    <article className={featured ? styles.featuredProduct : styles.productCard}>
      <Link className={styles.productImage} href={productPublicPath(product)} prefetch={false}>
        <ProductImage product={product} />
        <span className={styles.matchBadge}>{product.score}% match</span>
      </Link>
      <div className={styles.productCopy}>
        <div className={styles.productMeta}>
          <span>{product.brand ?? product.categoryLabel ?? "Sport selection"}</span>
          {product.matchedSize ? <b>Μέγεθος {product.matchedSize}</b> : null}
        </div>
        <h3><Link href={productPublicPath(product)} prefetch={false}>{product.title}</Link></h3>
        <strong className={styles.price}>{euro(product.priceMinor)}</strong>
        <MatchBar score={product.score} />
        {product.reasons.length ? <ul>{product.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
        <Link className={styles.productLink} href={productPublicPath(product)} prefetch={false}>Δες το προϊόν <span>→</span></Link>
      </div>
    </article>
  );
}

export function SportFitStudioExperience({
  vendorId = "vendor_4d7b281c8b2541f685f1",
  vendorName = "ΚΕΡΑΣΙΩΤΗΣ"
}: {
  vendorId?: string;
  vendorName?: string;
}) {
  const [step, setStep] = useState<Step>("activity");
  const [activity, setActivity] = useState<SportActivity>("running");
  const [audience, setAudience] = useState<SportAudience>("men");
  const [size, setSize] = useState("");
  const [footLength, setFootLength] = useState("");
  const [budget, setBudget] = useState("");
  const [surface, setSurface] = useState<SportSurface>("road");
  const [frequency, setFrequency] = useState<SportFrequency>("regular");
  const [distance, setDistance] = useState<SportDistance>("medium");
  const [priority, setPriority] = useState<SportPriority>("comfort");
  const [response, setResponse] = useState<ApiResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const availableSurfaces = useMemo(() => surfacesFor(activity), [activity]);

  function chooseActivity(next: SportActivity) {
    setActivity(next);
    setSurface(next === "football" ? "grass" : next === "gym" ? "indoor" : "road");
    setStep("profile");
  }

  function goBack() {
    if (step === "profile") setStep("activity");
    else if (step === "details") setStep("profile");
    else if (step === "results") setStep("details");
  }

  async function recommend() {
    setLoading(true);
    setError("");
    try {
      const budgetEuros = Number(budget.replace(",", "."));
      const footLengthCm = Number(footLength.replace(",", "."));
      const result = await fetch("/api/sport-fit/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          answers: {
            activity,
            audience,
            size: size.trim() || undefined,
            footLengthMm: Number.isFinite(footLengthCm) && footLengthCm > 0 ? Math.round(footLengthCm * 10) : undefined,
            budgetMinor: Number.isFinite(budgetEuros) && budgetEuros > 0 ? Math.round(budgetEuros * 100) : undefined,
            surface,
            frequency,
            distance: activity === "running" || activity === "walking" ? distance : undefined,
            priority
          }
        })
      });
      const payload = await result.json() as ApiResponse;
      if (!result.ok) throw new Error(payload.error || "sport_fit_candidates_unavailable");
      setResponse(payload);
      setStep("results");
    } catch {
      setError("Δεν μπορέσαμε να ετοιμάσουμε το set αυτή τη στιγμή. Δοκίμασε ξανά.");
    } finally {
      setLoading(false);
    }
  }

  const primary = response?.recommendation.primary;
  const kit = response?.recommendation.kit ?? [];
  const alternatives = response?.recommendation.alternatives ?? [];

  return (
    <div className={styles.studio}>
      <header className={styles.header}>
        <button type="button" className={styles.brand} onClick={() => setStep("activity")}>
          <span>KONTA MOY</span>
          <strong>SPORT & FIT STUDIO</strong>
        </button>
        <div className={styles.vendor}>
          <span>LIVE CATALOGUE</span>
          <strong>{response?.vendorName || vendorName}</strong>
        </div>
        <div className={styles.headerActions}>
          {step !== "activity" ? <button type="button" onClick={goBack} aria-label="Πίσω">←</button> : null}
          <Link href={`/vendor/${encodeURIComponent(vendorId)}`} aria-label="Έξοδος από το Sport & Fit Studio">×</Link>
        </div>
      </header>

      {step !== "activity" ? (
        <div className={styles.progress}>
          <span style={{ width: step === "profile" ? "33%" : step === "details" ? "66%" : "100%" }} />
        </div>
      ) : null}

      <main className={styles.viewport}>
        {step === "activity" ? (
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <span className={styles.kicker}>ΟΔΗΓΟΣ ΑΘΛΗΣΗΣ · LIVE PRODUCTS</span>
              <h1>Τι θέλεις<br /><em>να κάνεις;</em></h1>
              <p>Δεν ξεκινάμε από φίλτρα. Ξεκινάμε από τη δραστηριότητά σου και βρίσκουμε προϊόντα, διαθέσιμο μέγεθος και ένα ολοκληρωμένο set.</p>
              <div className={styles.flow}><span>ΔΡΑΣΤΗΡΙΟΤΗΤΑ</span><i>→</i><span>ΕΦΑΡΜΟΓΗ</span><i>→</i><span>ΠΡΟΪΟΝΤΑ</span><i>→</i><span>SET</span></div>
              <small>Πρώτη έκδοση · προϊόντα {vendorName} · χωρίς εξωτερικό recommendation API</small>
            </div>
            <div className={styles.activityGrid}>
              {ACTIVITIES.map((item, index) => (
                <button type="button" key={item.key} className={styles.activityCard} onClick={() => chooseActivity(item.key)}>
                  <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                  <i aria-hidden="true">{item.icon}</i>
                  <div><h2>{item.title}</h2><p>{item.body}</p></div>
                  <b>ΞΕΚΙΝΑ <span>→</span></b>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === "profile" ? (
          <section className={styles.questionScreen}>
            <div className={styles.questionIntro}>
              <span className={styles.kicker}>{activityLabel(activity)} · 01</span>
              <h1>Πες μας τα βασικά.</h1>
              <p>Μπορείς να δώσεις γνωστό μέγεθος ή μήκος πέλματος. Το μήκος χρησιμοποιείται μόνο με τεκμηριωμένο brand size guide· σήμερα έχουμε ενσωματωμένο τον επίσημο οδηγό adidas.</p>
            </div>
            <div className={styles.formPanel}>
              <fieldset>
                <legend>Για ποιον ψάχνουμε;</legend>
                <div className={styles.pills}>{AUDIENCES.map((item) => <button type="button" className={audience === item.key ? styles.selected : ""} onClick={() => setAudience(item.key)} key={item.key}>{item.label}</button>)}</div>
              </fieldset>
              <div className={styles.inputs}>
                <label><span>Γνωστό μέγεθος EU</span><input value={size} onChange={(event) => setSize(event.target.value)} placeholder="π.χ. 42 ή 42 2/3" inputMode="decimal" /></label>
                <label>
                  <span>Μήκος πέλματος</span>
                  <div className={styles.unitInput}><input value={footLength} onChange={(event) => setFootLength(event.target.value)} placeholder="π.χ. 26,1" inputMode="decimal" /><b>cm</b></div>
                  <small className={styles.inputHelp}>Για adidas εφαρμόζεται ο επίσημος heel-to-toe πίνακας. Αν πέφτεις ανάμεσα σε δύο γραμμές, κρατάμε και τις δύο.</small>
                </label>
                <label><span>Μέγιστο budget</span><div className={styles.euroInput}><input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="π.χ. 100" inputMode="decimal" /><b>€</b></div></label>
              </div>
              <button type="button" className={styles.primaryAction} onClick={() => setStep("details")}>Συνέχεια <span>→</span></button>
            </div>
          </section>
        ) : null}

        {step === "details" ? (
          <section className={styles.questionScreen}>
            <div className={styles.questionIntro}>
              <span className={styles.kicker}>{activityLabel(activity)} · 02</span>
              <h1>Πώς το χρησιμοποιείς;</h1>
              <p>Οι απαντήσεις γίνονται διαφανή scoring signals. Δεν δημιουργούμε χαρακτηριστικά που δεν υπάρχουν στον κατάλογο.</p>
            </div>
            <div className={styles.formPanel}>
              <fieldset>
                <legend>{activity === "football" ? "Σε τι γήπεδο;" : activity === "gym" ? "Τι είδους προπόνηση;" : "Πού κινείσαι συνήθως;"}</legend>
                <div className={styles.choiceGrid}>{availableSurfaces.map((item) => <button type="button" key={item.key} className={surface === item.key ? styles.selectedCard : ""} onClick={() => setSurface(item.key)}>{item.label}</button>)}</div>
              </fieldset>

              <fieldset>
                <legend>Πόσο συχνά;</legend>
                <div className={styles.pills}>{FREQUENCIES.map((item) => <button type="button" key={item.key} className={frequency === item.key ? styles.selected : ""} onClick={() => setFrequency(item.key)}>{item.label}</button>)}</div>
              </fieldset>

              {(activity === "running" || activity === "walking") ? (
                <fieldset>
                  <legend>Τυπική απόσταση;</legend>
                  <div className={styles.pills}>{DISTANCES.map((item) => <button type="button" key={item.key} className={distance === item.key ? styles.selected : ""} onClick={() => setDistance(item.key)}>{item.label}</button>)}</div>
                </fieldset>
              ) : null}

              <fieldset>
                <legend>Τι θέλεις περισσότερο;</legend>
                <div className={styles.priorityGrid}>{PRIORITIES.map((item) => <button type="button" key={item.key} className={priority === item.key ? styles.selectedCard : ""} onClick={() => setPriority(item.key)}><strong>{item.label}</strong><small>{item.body}</small></button>)}</div>
              </fieldset>

              {error ? <p className={styles.error} role="alert">{error}</p> : null}
              <button type="button" className={styles.primaryAction} disabled={loading} onClick={recommend}>{loading ? "Βρίσκουμε το set…" : "Βρες το set μου"} <span>→</span></button>
            </div>
          </section>
        ) : null}

        {step === "results" ? (
          <section className={styles.results}>
            <div className={styles.resultsHead}>
              <div><span className={styles.kicker}>ΤΟ SPORT SET ΣΟΥ</span><h1>{primary ? "Η καλύτερη αντιστοίχιση από όσα είναι διαθέσιμα τώρα." : "Δεν βρήκαμε αρκετά συμβατά προϊόντα."}</h1></div>
              <div className={styles.resultFacts}><span>{response?.candidateCount ?? 0}<small>live candidates</small></span><span>{kit.length + (primary ? 1 : 0)}<small>στο set</small></span></div>
            </div>

            {response?.sizeGuide ? (
              <div className={styles.sizeGuideNote}>
                <strong>SIZE GUIDE · {response.sizeGuide.publisher}</strong>
                {response.sizeGuide.outOfRange ? (
                  <p>Η μέτρηση {(response.sizeGuide.measurementMm / 10).toLocaleString("el-GR")} cm είναι έξω από το εύρος του διαθέσιμου πίνακα. Δεν εφαρμόσαμε αυτόματη αντιστοίχιση μεγέθους.</p>
                ) : (
                  <p>
                    {(response.sizeGuide.measurementMm / 10).toLocaleString("el-GR")} cm → {response.sizeGuide.sizeSystem} {response.sizeGuide.sizeLabels.join(" ή ")}.
                    {" "}Αυτή η αντιστοίχιση επηρεάζει μόνο προϊόντα adidas, όχι άλλες μάρκες.
                  </p>
                )}
              </div>
            ) : null}

            {primary ? (
              <>
                <div className={styles.primarySection}>
                  <div className={styles.sectionLabel}><span>01</span><strong>ΚΥΡΙΑ ΕΠΙΛΟΓΗ</strong></div>
                  <ProductResultCard product={primary} featured />
                </div>

                {kit.length ? (
                  <div className={styles.kitSection}>
                    <div className={styles.sectionLabel}><span>02</span><strong>COMPLETE MY KIT</strong></div>
                    <div className={styles.kitHeading}><h2>Συμπλήρωσε το set.</h2><p>Τα παρακάτω επιλέγονται ανεξάρτητα από το παπούτσι, από προϊόντα που είναι διαθέσιμα τώρα.</p></div>
                    <div className={styles.productGrid}>{kit.map((item) => <ProductResultCard product={item} key={item.id} />)}</div>
                  </div>
                ) : null}

                {alternatives.length ? (
                  <div className={styles.altSection}>
                    <div className={styles.sectionLabel}><span>03</span><strong>ΕΝΑΛΛΑΚΤΙΚΕΣ</strong></div>
                    <div className={styles.productGrid}>{alternatives.map((item) => <ProductResultCard product={item} key={item.id} />)}</div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.empty}><p>Δοκίμασε διαφορετικό μέγεθος, μεγαλύτερο budget ή άλλη χρήση. Δεν θα εμφανίσουμε προϊόν ως «ταιριαστό» όταν τα διαθέσιμα στοιχεία δεν το στηρίζουν.</p></div>
            )}

            <div className={styles.resultActions}>
              <button type="button" onClick={() => setStep("activity")}>Νέα αναζήτηση</button>
              <Link href={`/vendor/${encodeURIComponent(vendorId)}`}>Όλα τα προϊόντα {vendorName} →</Link>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
