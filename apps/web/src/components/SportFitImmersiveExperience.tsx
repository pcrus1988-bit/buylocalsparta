"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { productPublicPath } from "../lib/product-url";
import { SportFitWebGLUniverse } from "./SportFitWebGLUniverse";
import type {
  SportActivity,
  SportAudience,
  SportDistance,
  SportFitAnswers,
  SportFitPreference,
  SportFitRecommendation,
  SportFitScoredProduct,
  SportFrequency,
  SportGymTrainingType,
  SportPriority,
  SportRunnerNeed,
  SportSurface,
  SportUseCase
} from "../lib/sport-fit-engine";
import styles from "./SportFitImmersiveExperience.module.css";

type Step = "activity" | "profile" | "details" | "results";

type UniverseProduct = Readonly<{
  id: string;
  familyId?: string;
  slug: string;
  title: string;
  brand?: string;
  categoryLabel?: string;
  previewImageSrc?: string;
  priceMinor: number;
  score?: number;
  technicalScore?: number;
  technicalCoverage?: number;
  matchedSize?: string;
  role?: string;
  reasons?: readonly string[];
}>;

type UniverseResponse = Readonly<{
  vendorId: string;
  vendorName: string;
  candidateCount: number;
  survivingCount: number;
  universe: readonly UniverseProduct[];
  error?: string;
}>;

type ApiResponse = UniverseResponse & Readonly<{
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
}>;

const ACTIVITIES: readonly Readonly<{ key: SportActivity; icon: string; title: string; body: string }>[] = [
  { key: "running", icon: "↗", title: "Τρέξιμο", body: "Road, trail, διάδρομος, απόσταση και ανάγκες δρομέα." },
  { key: "walking", icon: "→", title: "Περπάτημα", body: "Άνεση, διάρκεια, εφαρμογή και καθημερινή χρήση." },
  { key: "gym", icon: "＋", title: "Γυμναστήριο", body: "Strength, functional, cardio ή διάδρομος." },
  { key: "football", icon: "◉", title: "Ποδόσφαιρο", body: "Σόλα και γήπεδο πριν από οτιδήποτε άλλο." },
  { key: "hiking", icon: "△", title: "Πεζοπορία", body: "Trail, πρόσφυση, προστασία και outdoor χρήση." },
  { key: "basketball", icon: "●", title: "Μπάσκετ", body: "Court χρήση, σταθερότητα και απόκριση." },
  { key: "tennis", icon: "⌁", title: "Τένις", body: "Hard, clay ή indoor court." },
  { key: "padel", icon: "◇", title: "Padel", body: "Court επιφάνεια, έλεγχος και πρόσφυση." },
  { key: "volleyball", icon: "○", title: "Βόλεϊ", body: "Indoor / outdoor court και σταθερή βάση." }
];

const AUDIENCES: readonly Readonly<{ key: SportAudience; label: string }>[] = [
  { key: "men", label: "Άνδρας" },
  { key: "women", label: "Γυναίκα" },
  { key: "kids", label: "Παιδί" }
];

const PRIORITIES: readonly Readonly<{ key: SportPriority; label: string; body: string }>[] = [
  { key: "comfort", label: "Άνεση", body: "Πιο ξεκούραστη αίσθηση." },
  { key: "cushioning", label: "Απορρόφηση", body: "Προτεραιότητα στο cushioning." },
  { key: "lightweight", label: "Ελαφριά αίσθηση", body: "Χαμηλότερο βάρος / speed signals." },
  { key: "stability", label: "Σταθερότητα", body: "Περισσότερος έλεγχος και support." },
  { key: "versatility", label: "Πολυχρηστικότητα", body: "Ισορροπημένη επιλογή." },
  { key: "traction", label: "Πρόσφυση", body: "Grip και traction όπου τεκμηριώνεται." },
  { key: "weather", label: "Καιρός", body: "Προστασία από νερό / καιρό όπου υπάρχει." }
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

const RUNNER_NEEDS: readonly Readonly<{ key: SportRunnerNeed; label: string }>[] = [
  { key: "neutral", label: "Neutral αίσθηση" },
  { key: "guided_support", label: "Περισσότερη στήριξη" },
  { key: "wide_fit", label: "Πιο φαρδιά εφαρμογή" },
  { key: "soft_ride", label: "Πιο μαλακή κύλιση" },
  { key: "speed", label: "Ταχύτητα / ελαφριά αίσθηση" },
  { key: "all_rounder", label: "Ένα παπούτσι για τα περισσότερα" }
];

const FIT_PREFERENCES: readonly Readonly<{ key: SportFitPreference; label: string }>[] = [
  { key: "standard", label: "Κανονική" },
  { key: "wide", label: "Φαρδιά" },
  { key: "narrow", label: "Στενότερη" }
];

const USE_CASES: Readonly<Record<SportActivity, readonly Readonly<{ key: SportUseCase; label: string }>[]>> = {
  running: [
    { key: "daily_training", label: "Καθημερινή προπόνηση" },
    { key: "easy_run", label: "Χαλαρό τρέξιμο" },
    { key: "recovery_run", label: "Recovery run" },
    { key: "long_run", label: "Μεγάλη απόσταση" },
    { key: "speed_training", label: "Tempo / speed training" },
    { key: "race_day", label: "Αγώνας" }
  ],
  walking: [
    { key: "daily_walking", label: "Καθημερινό περπάτημα" },
    { key: "all_day_standing", label: "Πολύωρη ορθοστασία" },
    { key: "travel_walking", label: "Πολύ περπάτημα / ταξίδι" }
  ],
  gym: [
    { key: "gym_strength", label: "Βάρη / strength" },
    { key: "gym_functional", label: "Functional / HIIT" },
    { key: "gym_cardio", label: "Cardio / διάδρομος" }
  ],
  football: [
    { key: "football_training", label: "Προπόνηση" },
    { key: "football_match", label: "Αγώνας" }
  ],
  hiking: [
    { key: "day_hike", label: "Ημερήσια πεζοπορία" },
    { key: "technical_hike", label: "Τεχνική / ορεινή διαδρομή" },
    { key: "urban_outdoor", label: "Outdoor + πόλη / ταξίδι" }
  ],
  basketball: [
    { key: "basketball_training", label: "Προπόνηση" },
    { key: "basketball_match", label: "Αγώνας" }
  ],
  tennis: [
    { key: "tennis_training", label: "Προπόνηση" },
    { key: "tennis_match", label: "Αγώνας" }
  ],
  padel: [
    { key: "padel_training", label: "Προπόνηση" },
    { key: "padel_match", label: "Αγώνας" }
  ],
  volleyball: [
    { key: "volleyball_training", label: "Προπόνηση" },
    { key: "volleyball_match", label: "Αγώνας" }
  ]
};

const GYM_TRAINING_TYPES: readonly Readonly<{ key: SportGymTrainingType; label: string; body: string }>[] = [
  { key: "strength", label: "Βάρη / strength", body: "Σταθερότητα και έλεγχος." },
  { key: "functional", label: "Functional / HIIT", body: "Ισορροπία σταθερότητας και απόκρισης." },
  { key: "cardio", label: "Cardio", body: "Άνεση και cushioning." },
  { key: "treadmill", label: "Διάδρομος", body: "Running-oriented λογική." },
  { key: "mixed", label: "Μικτή προπόνηση", body: "All-round training επιλογή." }
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
  if (activity === "basketball") return [
    { key: "court_indoor", label: "Indoor court" },
    { key: "court_outdoor", label: "Outdoor court" },
    { key: "court_hard", label: "Hard court" }
  ];
  if (activity === "tennis") return [
    { key: "court_hard", label: "Hard court" },
    { key: "court_clay", label: "Χώμα / clay" },
    { key: "court_indoor", label: "Indoor court" }
  ];
  if (activity === "padel") return [
    { key: "court_artificial", label: "Τεχνητός τάπητας" },
    { key: "court_outdoor", label: "Outdoor court" },
    { key: "court_indoor", label: "Indoor court" }
  ];
  if (activity === "volleyball") return [
    { key: "court_indoor", label: "Indoor court" },
    { key: "court_outdoor", label: "Outdoor court" },
    { key: "sand", label: "Άμμος / beach" }
  ];
  if (activity === "hiking") return [
    { key: "trail", label: "Μονοπάτι / trail" },
    { key: "mixed", label: "Μικτό έδαφος" },
    { key: "road", label: "Urban / εύκολο έδαφος" }
  ];
  return [
    { key: "road", label: "Άσφαλτος" },
    { key: "treadmill", label: "Διάδρομος" },
    { key: "trail", label: "Χώμα / trail" },
    { key: "mixed", label: "Μικτή χρήση" }
  ];
}

function prioritiesFor(activity: SportActivity): readonly Readonly<{ key: SportPriority; label: string; body: string }>[] {
  if (activity === "hiking") {
    return PRIORITIES.filter((item) => ["comfort", "cushioning", "stability", "traction", "weather", "versatility"].includes(item.key));
  }
  if (["basketball", "tennis", "padel", "volleyball", "football"].includes(activity)) {
    return PRIORITIES.filter((item) => ["comfort", "lightweight", "stability", "traction", "versatility"].includes(item.key));
  }
  return PRIORITIES.filter((item) => item.key !== "traction" && item.key !== "weather");
}

function activityLabel(activity: SportActivity): string {
  return ACTIVITIES.find((item) => item.key === activity)?.title ?? activity;
}

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function ProductImage({ product }: { product: SportFitScoredProduct }) {
  const src = product.previewImageSrc || `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  return (
    <img
      src={src}
      alt={product.mediaAlt ?? product.title}
      loading="lazy"
      decoding="async"
      referrerPolicy={src.startsWith("https://") ? "strict-origin-when-cross-origin" : undefined}
    />
  );
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

function ProductUniverse({
  products,
  leavingIds,
  initialCount,
  survivingCount,
  busy,
  unavailable,
  onProductCardOpenChange
}: {
  products: readonly UniverseProduct[];
  leavingIds: ReadonlySet<string>;
  initialCount: number;
  survivingCount: number;
  busy: boolean;
  unavailable: boolean;
  onProductCardOpenChange?: (open: boolean) => void;
}) {
  return (
    <div className={styles.universe}>
      <div className={styles.universeTopline}>
        <div>
          <span>LIVE PRODUCT UNIVERSE · TRUE 3D</span>
          <strong>{busy ? "Αναδιατάσσουμε το 3D πεδίο…" : `${survivingCount} προϊόντα παραμένουν`}</strong>
        </div>
        <div className={styles.universeCounter}>
          <b>{survivingCount}</b>
          <small>από {initialCount || "—"}</small>
        </div>
      </div>

      <div className={styles.scene} aria-label="Διαδραστικό τρισδιάστατο σύμπαν των προϊόντων που παραμένουν συμβατά">
        {products.length ? (
          <SportFitWebGLUniverse
            products={products}
            leavingIds={leavingIds}
            busy={busy}
            onProductCardOpenChange={onProductCardOpenChange}
          />
        ) : (
          <div className={styles.universeEmpty}>
            {unavailable ? "Ο live κατάλογος δεν είναι διαθέσιμος αυτή τη στιγμή." : busy ? "Φορτώνουμε το 3D σύμπαν…" : "Δεν μένει ακόμη συμβατό προϊόν με αυτές τις επιλογές."}
          </div>
        )}
      </div>

      <div className={styles.universeLegend}>
        <span><i className={styles.legendStrong} /> κοντά στο κέντρο = ισχυρότερο τεχνικό ταίριασμα</span>
        <span><i className={styles.legendPossible} /> έξω τροχιά = πιθανή επιλογή</span>
        <span>drag / touch για περιστροφή · pinch / wheel για zoom · tap για άνοιγμα κάρτας προϊόντος</span>
      </div>
    </div>
  );
}

export function SportFitImmersiveExperience({
  vendorId = "vendor_4d7b281c8b2541f685f1",
  vendorName = "ΚΕΡΑΣΙΩΤΗΣ"
}: {
  vendorId?: string;
  vendorName?: string;
}) {
  const [step, setStep] = useState<Step>("activity");
  const [activity, setActivity] = useState<SportActivity>("running");
  const [audience, setAudience] = useState<SportAudience | null>(null);
  const [size, setSize] = useState("");
  const [footLength, setFootLength] = useState("");
  const [budget, setBudget] = useState("");
  const [surface, setSurface] = useState<SportSurface>();
  const [frequency, setFrequency] = useState<SportFrequency>();
  const [distance, setDistance] = useState<SportDistance>();
  const [priority, setPriority] = useState<SportPriority>();
  const [runnerNeed, setRunnerNeed] = useState<SportRunnerNeed>();
  const [fitPreference, setFitPreference] = useState<SportFitPreference>();
  const [gymTrainingType, setGymTrainingType] = useState<SportGymTrainingType>();
  const [useCase, setUseCase] = useState<SportUseCase>();
  const [response, setResponse] = useState<ApiResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [universeBusy, setUniverseBusy] = useState(true);
  const [universeUnavailable, setUniverseUnavailable] = useState(false);
  const [universeProducts, setUniverseProducts] = useState<readonly UniverseProduct[]>([]);
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(new Set());
  const [initialCount, setInitialCount] = useState(0);
  const [survivingCount, setSurvivingCount] = useState(0);
  const [selectedFinalistId, setSelectedFinalistId] = useState("");
  const [productCardOpen, setProductCardOpen] = useState(false);

  const universeRef = useRef<readonly UniverseProduct[]>([]);
  const requestSequenceRef = useRef(0);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availableSurfaces = useMemo(() => surfacesFor(activity), [activity]);
  const availablePriorities = useMemo(() => prioritiesFor(activity), [activity]);
  const availableUseCases = USE_CASES[activity];

  useEffect(() => {
    const requestId = ++requestSequenceRef.current;
    setUniverseBusy(true);
    setUniverseUnavailable(false);

    void fetch(`/api/sport-fit/candidates?vendorId=${encodeURIComponent(vendorId)}`, { cache: "no-store" })
      .then(async (result) => {
        const payload = await result.json() as UniverseResponse;
        if (!result.ok) throw new Error(payload.error || "sport_fit_universe_unavailable");
        if (requestId !== requestSequenceRef.current) return;
        const next = payload.universe ?? [];
        universeRef.current = next;
        setUniverseProducts(next);
        setInitialCount(payload.candidateCount ?? next.length);
        setSurvivingCount(payload.survivingCount ?? payload.candidateCount ?? next.length);
        setUniverseBusy(false);
      })
      .catch(() => {
        if (requestId !== requestSequenceRef.current) return;
        setUniverseUnavailable(true);
        setUniverseBusy(false);
      });

    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, [vendorId]);

  function applyUniverse(nextProducts: readonly UniverseProduct[], nextCount: number) {
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);

    const previous = universeRef.current;
    const nextIds = new Set(nextProducts.map((product) => product.id));
    const leaving = previous.filter((product) => !nextIds.has(product.id)).slice(0, 22);

    universeRef.current = nextProducts;
    setSurvivingCount(nextCount);

    if (!previous.length || !leaving.length) {
      setLeavingIds(new Set());
      setUniverseProducts(nextProducts);
      return;
    }

    const leavingSet = new Set(leaving.map((product) => product.id));
    setLeavingIds(leavingSet);
    setUniverseProducts([...nextProducts, ...leaving]);

    transitionTimerRef.current = setTimeout(() => {
      setLeavingIds(new Set());
      setUniverseProducts(universeRef.current);
    }, 560);
  }

  function numericProfile() {
    const budgetEuros = Number(budget.replace(",", "."));
    const footLengthCm = Number(footLength.replace(",", "."));
    return {
      size: size.trim() || undefined,
      footLengthMm: Number.isFinite(footLengthCm) && footLengthCm > 0 ? Math.round(footLengthCm * 10) : undefined,
      budgetMinor: Number.isFinite(budgetEuros) && budgetEuros > 0 ? Math.round(budgetEuros * 100) : undefined
    };
  }

  function buildAnswers(
    overrides: Partial<SportFitAnswers> = {},
    audienceMode?: SportAudience | "all",
    resetDetails = false
  ): Record<string, unknown> {
    const nextActivity = overrides.activity ?? activity;
    const nextAudience = audienceMode ?? overrides.audience ?? audience ?? "men";
    const profile = numericProfile();

    const answer: Record<string, unknown> = {
      activity: nextActivity,
      audience: nextAudience,
      size: overrides.size ?? profile.size,
      footLengthMm: overrides.footLengthMm ?? profile.footLengthMm,
      budgetMinor: overrides.budgetMinor ?? profile.budgetMinor
    };

    if (resetDetails) return answer;

    const nextSurface = overrides.surface ?? surface;
    const nextFrequency = overrides.frequency ?? frequency;
    const nextDistance = overrides.distance ?? distance;
    const nextPriority = overrides.priority ?? priority;
    const nextRunnerNeed = overrides.runnerNeed ?? runnerNeed;
    const nextFit = overrides.fitPreference ?? fitPreference;
    const nextGymTraining = overrides.gymTrainingType ?? gymTrainingType;
    const nextUseCase = overrides.useCase ?? useCase;

    if (nextSurface) answer.surface = nextSurface;
    if (nextFrequency) answer.frequency = nextFrequency;
    if ((nextActivity === "running" || nextActivity === "walking") && nextDistance) answer.distance = nextDistance;
    if (nextPriority) answer.priority = nextPriority;
    if (nextActivity === "running" && nextRunnerNeed) answer.runnerNeed = nextRunnerNeed;
    if (nextFit) answer.fitPreference = nextFit;
    if (nextActivity === "gym" && nextGymTraining) answer.gymTrainingType = nextGymTraining;
    if (nextUseCase) answer.useCase = nextUseCase;

    return answer;
  }

  async function fetchCandidates(answers: Record<string, unknown>): Promise<ApiResponse> {
    const result = await fetch("/api/sport-fit/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId, answers })
    });
    const payload = await result.json() as ApiResponse;
    if (!result.ok) throw new Error(payload.error || "sport_fit_candidates_unavailable");
    return payload;
  }

  async function refreshUniverse(
    overrides: Partial<SportFitAnswers> = {},
    audienceMode?: SportAudience | "all",
    resetDetails = false
  ) {
    const requestId = ++requestSequenceRef.current;
    setUniverseBusy(true);
    setUniverseUnavailable(false);

    try {
      const payload = await fetchCandidates(buildAnswers(overrides, audienceMode, resetDetails));
      if (requestId !== requestSequenceRef.current) return;
      applyUniverse(payload.universe ?? [], payload.survivingCount ?? 0);
    } catch {
      if (requestId !== requestSequenceRef.current) return;
      setUniverseUnavailable(true);
    } finally {
      if (requestId === requestSequenceRef.current) setUniverseBusy(false);
    }
  }

  async function resetExperience() {
    const requestId = ++requestSequenceRef.current;
    setStep("activity");
    setAudience(null);
    setSize("");
    setFootLength("");
    setBudget("");
    setSurface(undefined);
    setFrequency(undefined);
    setDistance(undefined);
    setPriority(undefined);
    setRunnerNeed(undefined);
    setFitPreference(undefined);
    setGymTrainingType(undefined);
    setUseCase(undefined);
    setResponse(undefined);
    setSelectedFinalistId("");
    setProductCardOpen(false);
    setError("");
    setLeavingIds(new Set());
    setUniverseBusy(true);
    setUniverseUnavailable(false);

    try {
      const result = await fetch(`/api/sport-fit/candidates?vendorId=${encodeURIComponent(vendorId)}`, { cache: "no-store" });
      const payload = await result.json() as UniverseResponse;
      if (!result.ok) throw new Error(payload.error || "sport_fit_universe_unavailable");
      if (requestId !== requestSequenceRef.current) return;
      const next = payload.universe ?? [];
      universeRef.current = next;
      setUniverseProducts(next);
      setInitialCount(payload.candidateCount ?? next.length);
      setSurvivingCount(payload.survivingCount ?? payload.candidateCount ?? next.length);
    } catch {
      if (requestId !== requestSequenceRef.current) return;
      setUniverseUnavailable(true);
    } finally {
      if (requestId === requestSequenceRef.current) setUniverseBusy(false);
    }
  }

  function chooseActivity(next: SportActivity) {
    setActivity(next);
    setSurface(undefined);
    setFrequency(undefined);
    setDistance(undefined);
    setPriority(undefined);
    setRunnerNeed(undefined);
    setFitPreference(undefined);
    setGymTrainingType(undefined);
    setUseCase(undefined);
    setResponse(undefined);
    setSelectedFinalistId("");
    setError("");
    setStep("profile");
    void refreshUniverse({ activity: next }, "all", true);
  }

  function chooseGymTraining(next: SportGymTrainingType) {
    const derivedSurface: SportSurface = next === "treadmill" ? "treadmill" : next === "mixed" ? "mixed" : "indoor";
    const derivedUseCase: SportUseCase = next === "strength"
      ? "gym_strength"
      : next === "cardio" || next === "treadmill"
        ? "gym_cardio"
        : "gym_functional";
    setGymTrainingType(next);
    setSurface(derivedSurface);
    setUseCase(derivedUseCase);
    void refreshUniverse({ gymTrainingType: next, surface: derivedSurface, useCase: derivedUseCase });
  }

  function goBack() {
    if (step === "profile") setStep("activity");
    else if (step === "details") setStep("profile");
    else if (step === "results") setStep("details");
  }

  const detailsComplete = Boolean(
    audience
    && frequency
    && fitPreference
    && priority
    && useCase
    && (
      activity === "gym"
        ? gymTrainingType
        : surface
    )
    && (
      activity === "running" || activity === "walking"
        ? distance
        : true
    )
    && (
      activity === "running"
        ? runnerNeed
        : true
    )
  );

  async function recommend() {
    if (!audience || !detailsComplete) return;
    const requestId = ++requestSequenceRef.current;
    setLoading(true);
    setError("");
    setUniverseBusy(true);

    try {
      const payload = await fetchCandidates(buildAnswers({}, audience));
      if (requestId !== requestSequenceRef.current) return;
      setResponse(payload);
      applyUniverse(payload.universe ?? [], payload.survivingCount ?? 0);
      setSelectedFinalistId(payload.recommendation.primary?.id ?? "");
      setStep("results");
    } catch {
      if (requestId !== requestSequenceRef.current) return;
      setError("Δεν μπορέσαμε να ετοιμάσουμε τις τελικές αντιστοιχίσεις αυτή τη στιγμή. Δοκίμασε ξανά.");
    } finally {
      if (requestId === requestSequenceRef.current) {
        setLoading(false);
        setUniverseBusy(false);
      }
    }
  }

  const primary = response?.recommendation.primary;
  const kit = response?.recommendation.kit ?? [];
  const finalists = useMemo(() => {
    if (!response) return [] as SportFitScoredProduct[];
    return [
      response.recommendation.primary,
      ...response.recommendation.alternatives
    ].filter((product): product is SportFitScoredProduct => Boolean(product)).slice(0, 5);
  }, [response]);

  const selectedFinalist = finalists.find((product) => product.id === selectedFinalistId) ?? finalists[0];

  useEffect(() => {
    if (step === "results") return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [step]);

  return (
    <div className={`${styles.studio} ${step !== "results" ? styles.liveStudio : ""}`}>
      <header className={styles.header}>
        <button type="button" className={styles.brand} onClick={() => { void resetExperience(); }}>
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
          <span style={{ width: step === "profile" ? "34%" : step === "details" ? "68%" : "100%" }} />
        </div>
      ) : null}

      {step !== "results" ? (
        <main className={styles.immersive}>
          <div className={styles.universePane}>
            <ProductUniverse
              products={universeProducts}
              leavingIds={leavingIds}
              initialCount={initialCount}
              survivingCount={survivingCount}
              busy={universeBusy}
              unavailable={universeUnavailable}
              onProductCardOpenChange={setProductCardOpen}
            />
          </div>

          <div className={`${styles.guidePane} ${productCardOpen ? styles.guidePaneProductOpen : ""}`}>
            {step === "activity" ? (
              <section className={styles.guideCard}>
                <span className={styles.kicker}>01 · ΔΡΑΣΤΗΡΙΟΤΗΤΑ</span>
                <h1>Ξεκίνα μέσα από το <em>σύμπαν προϊόντων.</em></h1>
                <p>Όλα ξεκινούν ορατά. Διάλεξε τι θέλεις να κάνεις και τα άσχετα προϊόντα θα απομακρυνθούν.</p>
                <div className={styles.activityChoices}>
                  {ACTIVITIES.map((item) => (
                    <button type="button" key={item.key} onClick={() => chooseActivity(item.key)}>
                      <i aria-hidden="true">{item.icon}</i>
                      <span><strong>{item.title}</strong><small>{item.body}</small></span>
                      <b>→</b>
                    </button>
                  ))}
                </div>
                <small className={styles.disclosure}>Οπτικοποιούμε έως 96 αντιπροσωπευτικές οικογένειες προϊόντων ταυτόχρονα, ενώ ο μετρητής χρησιμοποιεί όλο το live sport catalogue.</small>
              </section>
            ) : null}

            {step === "profile" ? (
              <section className={styles.guideCard}>
                <span className={styles.kicker}>02 · {activityLabel(activity).toUpperCase()} · ΕΦΑΡΜΟΓΗ</span>
                <h1>Ποιος θα το φορέσει;</h1>
                <p>Η επιλογή audience αλλάζει αμέσως το live σύνολο. Μέγεθος, πέλμα και budget είναι προαιρετικά αλλά μπορούν να αφαιρέσουν αδύναμες επιλογές νωρίς.</p>

                <fieldset>
                  <legend>Για ποιον ψάχνουμε;</legend>
                  <div className={styles.pills}>
                    {AUDIENCES.map((item) => (
                      <button
                        type="button"
                        className={audience === item.key ? styles.selected : ""}
                        onClick={() => {
                          setAudience(item.key);
                          void refreshUniverse({ audience: item.key }, item.key);
                        }}
                        key={item.key}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className={styles.inputs}>
                  <label>
                    <span>Γνωστό μέγεθος EU</span>
                    <input value={size} onChange={(event) => setSize(event.target.value)} placeholder="π.χ. 42 ή 42 2/3" inputMode="decimal" />
                  </label>
                  <label>
                    <span>Μήκος πέλματος</span>
                    <div className={styles.unitInput}>
                      <input value={footLength} onChange={(event) => setFootLength(event.target.value)} placeholder="π.χ. 26,1" inputMode="decimal" />
                      <b>cm</b>
                    </div>
                    <small>Χρησιμοποιείται μόνο όταν υπάρχει αποθηκευμένος τεκμηριωμένος brand size guide.</small>
                  </label>
                  <label>
                    <span>Μέγιστο budget</span>
                    <div className={styles.unitInput}>
                      <input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="π.χ. 100" inputMode="decimal" />
                      <b>€</b>
                    </div>
                  </label>
                </div>

                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={!audience}
                  onClick={() => {
                    if (!audience) return;
                    void refreshUniverse({}, audience);
                    setStep("details");
                  }}
                >
                  Συνέχεια <span>→</span>
                </button>
              </section>
            ) : null}

            {step === "details" ? (
              <section className={styles.guideCard}>
                <span className={styles.kicker}>03 · {activityLabel(activity).toUpperCase()} · ΧΡΗΣΗ</span>
                <h1>Κάθε απάντηση <em>καθαρίζει τον χώρο.</em></h1>
                <p>Το 3D πεδίο δεν είναι animation-βιτρίνα: κάθε μετακίνηση προκύπτει από το ίδιο deterministic rules layer που θα δώσει τα τελικά matches.</p>

                {activity === "gym" ? (
                  <fieldset>
                    <legend>Τι είδους προπόνηση κάνεις περισσότερο;</legend>
                    <div className={styles.cardChoices}>
                      {GYM_TRAINING_TYPES.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={gymTrainingType === item.key ? styles.selectedCard : ""}
                          onClick={() => chooseGymTraining(item.key)}
                        >
                          <strong>{item.label}</strong>
                          <small>{item.body}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <fieldset>
                    <legend>{activity === "football" ? "Σε τι γήπεδο;" : "Σε ποια επιφάνεια;"}</legend>
                    <div className={styles.choiceGrid}>
                      {availableSurfaces.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={surface === item.key ? styles.selectedCard : ""}
                          onClick={() => {
                            setSurface(item.key);
                            void refreshUniverse({ surface: item.key });
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                {activity !== "gym" ? (
                  <fieldset>
                    <legend>{activity === "hiking" ? "Τι είδους εξόρμηση;" : activity === "walking" ? "Ποια είναι η βασική χρήση;" : "Τι κάνεις κυρίως;"}</legend>
                    <div className={styles.choiceGrid}>
                      {availableUseCases.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={useCase === item.key ? styles.selectedCard : ""}
                          onClick={() => {
                            setUseCase(item.key);
                            void refreshUniverse({ useCase: item.key });
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                <fieldset>
                  <legend>Πόσο συχνά;</legend>
                  <div className={styles.pills}>
                    {FREQUENCIES.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        className={frequency === item.key ? styles.selected : ""}
                        onClick={() => {
                          setFrequency(item.key);
                          void refreshUniverse({ frequency: item.key });
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {(activity === "running" || activity === "walking") ? (
                  <fieldset>
                    <legend>Τυπική απόσταση;</legend>
                    <div className={styles.pills}>
                      {DISTANCES.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={distance === item.key ? styles.selected : ""}
                          onClick={() => {
                            setDistance(item.key);
                            void refreshUniverse({ distance: item.key });
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                {activity === "running" ? (
                  <fieldset>
                    <legend>Ποια ανάγκη περιγράφει καλύτερα αυτό που ψάχνεις;</legend>
                    <div className={styles.choiceGrid}>
                      {RUNNER_NEEDS.map((item) => (
                        <button
                          type="button"
                          key={item.key}
                          className={runnerNeed === item.key ? styles.selectedCard : ""}
                          onClick={() => {
                            setRunnerNeed(item.key);
                            void refreshUniverse({ runnerNeed: item.key });
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                <fieldset>
                  <legend>Πώς θέλεις να εφαρμόζει το παπούτσι;</legend>
                  <div className={styles.pills}>
                    {FIT_PREFERENCES.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        className={fitPreference === item.key ? styles.selected : ""}
                        onClick={() => {
                          setFitPreference(item.key);
                          void refreshUniverse({ fitPreference: item.key });
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Τι θέλεις περισσότερο;</legend>
                  <div className={styles.cardChoices}>
                    {availablePriorities.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        className={priority === item.key ? styles.selectedCard : ""}
                        onClick={() => {
                          setPriority(item.key);
                          void refreshUniverse({ priority: item.key });
                        }}
                      >
                        <strong>{item.label}</strong>
                        <small>{item.body}</small>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {error ? <p className={styles.error} role="alert">{error}</p> : null}

                <button
                  type="button"
                  className={styles.primaryAction}
                  disabled={loading || !detailsComplete}
                  onClick={recommend}
                >
                  {loading ? "Αναδιπλώνουμε τους 5 καλύτερους…" : "Δείξε μου τους 5 καλύτερους"}
                  <span>→</span>
                </button>
                {!detailsComplete ? <small className={styles.completionHint}>Ολοκλήρωσε τις παραπάνω επιλογές για να κλειδώσουμε το τελικό Top 5.</small> : null}
              </section>
            ) : null}
          </div>
        </main>
      ) : null}

      {step === "results" ? (
        <main className={styles.results}>
          <section className={styles.finalHero}>
            <div>
              <span className={styles.resultKicker}>ΤΟ ΤΕΛΙΚΟ ΣΟΥ ΠΕΔΙΟ</span>
              <h1>{primary ? "Από το σύμπαν έμειναν οι 5 ισχυρότερες αντιστοιχίσεις." : "Δεν έμεινε αρκετά τεκμηριωμένη επιλογή."}</h1>
            </div>
            <div className={styles.resultFacts}>
              <span>{initialCount}<small>στην αρχή</small></span>
              <span>{response?.survivingCount ?? 0}<small>τεχνικά συμβατά</small></span>
              <span>{finalists.length}<small>finalists</small></span>
            </div>
          </section>

          {response?.sizeGuide ? (
            <div className={styles.sizeGuideNote}>
              <strong>SIZE GUIDE · {response.sizeGuide.publisher}</strong>
              {response.sizeGuide.outOfRange ? (
                <p>Η μέτρηση {(response.sizeGuide.measurementMm / 10).toLocaleString("el-GR")} cm είναι έξω από το εύρος του διαθέσιμου πίνακα. Δεν εφαρμόσαμε αυτόματη αντιστοίχιση μεγέθους.</p>
              ) : (
                <p>
                  {(response.sizeGuide.measurementMm / 10).toLocaleString("el-GR")} cm → {response.sizeGuide.sizeSystem} {response.sizeGuide.sizeLabels.join(" ή ")}.
                  {" "}Η αντιστοίχιση εφαρμόζεται μόνο στη μάρκα για την οποία υπάρχει ο συγκεκριμένος τεκμηριωμένος οδηγός.
                </p>
              )}
            </div>
          ) : null}

          {selectedFinalist ? (
            <>
              <section className={styles.finalistStage}>
                <div className={styles.sectionLabel}><span>01</span><strong>TOP 5 · ΠΑΤΗΣΕ ΕΝΑ ΠΡΟΪΟΝ ΓΙΑ ΝΑ ΞΕΔΙΠΛΩΘΕΙ</strong></div>
                <div className={styles.finalistWebgl}>
                  <SportFitWebGLUniverse
                    products={finalists}
                    mode="finalists"
                    selectedId={selectedFinalist.id}
                    onSelect={setSelectedFinalistId}
                  />
                </div>
                <div className={styles.finalistRail} aria-label="Οι πέντε καλύτερες αντιστοιχίσεις">
                  {finalists.map((product, index) => (
                    <button
                      type="button"
                      key={product.id}
                      className={selectedFinalist.id === product.id ? styles.finalistSelected : ""}
                      onClick={() => setSelectedFinalistId(product.id)}
                    >
                      <span>0{index + 1}</span>
                      <strong>{product.score}%</strong>
                      <small>{product.brand || "SPORT"}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.unfolded}>
                <div className={styles.sectionLabel}><span>02</span><strong>ΓΙΑΤΙ ΕΜΕΙΝΕ</strong></div>
                <ProductResultCard product={selectedFinalist} featured />
              </section>

              {kit.length ? (
                <section className={styles.kitSection}>
                  <div className={styles.sectionLabel}><span>03</span><strong>COMPLETE MY KIT</strong></div>
                  <div className={styles.kitHeading}>
                    <h2>Συμπλήρωσε το set.</h2>
                    <p>Το kit βαθμολογείται χωριστά από το παπούτσι, αλλά με τις ίδιες απαντήσεις και μόνο από live διαθέσιμο απόθεμα.</p>
                  </div>
                  <div className={styles.productGrid}>{kit.map((item) => <ProductResultCard product={item} key={item.id} />)}</div>
                </section>
              ) : null}
            </>
          ) : (
            <div className={styles.empty}>
              <p>Δεν θα ξεδιπλώσουμε προϊόν ως «ταιριαστό» όταν τα διαθέσιμα τεχνικά στοιχεία, η επιφάνεια, το fit ή το απόθεμα δεν το στηρίζουν.</p>
            </div>
          )}

          <div className={styles.resultActions}>
            <button
              type="button"
              onClick={() => { void resetExperience(); }}
            >
              Νέα αναζήτηση
            </button>
            <Link href={`/vendor/${encodeURIComponent(vendorId)}`}>Όλα τα προϊόντα {vendorName} →</Link>
          </div>
        </main>
      ) : null}
    </div>
  );
}
