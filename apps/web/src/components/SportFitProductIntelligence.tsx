"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SportFitProductIntelligence.module.css";

const PROFILE_STORAGE_KEY = "kontamou:sport-fit-profile:v1";

type Knowledge = Readonly<{
  status?: string;
  identityQuality?: string;
  queueStatus?: string;
  completenessScore?: number;
  evidenceScore?: number;
  activities?: readonly string[];
  surfaces?: readonly string[];
  useCases?: readonly string[];
  cushioningLevel?: string;
  supportLevel?: string;
  fitLengthProfile?: string;
  widthProfile?: string;
  dropMm?: number;
  weightG?: number;
  footballSurfaceCode?: string;
  weatherProtection?: readonly string[];
  breathabilityLevel?: string;
  reflectiveDetails?: boolean;
}>;

type IntelligenceResponse = Readonly<{
  eligible: boolean;
  role?: string;
  knowledge?: Knowledge;
  error?: string;
}>;

type PersonalMatch = Readonly<{
  score: number;
  technicalScore: number;
  technicalCoverage: number;
  reasons: readonly string[];
  matchedSize?: string;
}>;

type StoredProfile = Readonly<{
  answers?: Readonly<Record<string, unknown>>;
}>;

type Props = Readonly<{
  productId: string;
  vendorId?: string;
  title: string;
  brand?: string;
  imageSrc?: string;
  sizes?: readonly string[];
  availableToSell?: number;
}>;

const LABELS: Readonly<Record<string, string>> = {
  running: "Τρέξιμο",
  walking: "Περπάτημα",
  gym: "Γυμναστήριο",
  football: "Ποδόσφαιρο",
  hiking: "Πεζοπορία",
  basketball: "Μπάσκετ",
  tennis: "Τένις",
  padel: "Padel",
  volleyball: "Βόλεϊ",
  handball: "Χάντμπολ",
  badminton: "Μπάντμιντον",
  road: "Άσφαλτος",
  treadmill: "Διάδρομος",
  mixed: "Μικτή χρήση",
  trail: "Trail",
  indoor: "Indoor",
  grass: "Φυσικό χορτάρι",
  artificial: "Συνθετικό",
  court_hard: "Hard court",
  court_clay: "Clay",
  court_indoor: "Indoor court",
  court_outdoor: "Outdoor court",
  court_artificial: "Τεχνητό court",
  sand: "Άμμος",
  daily_training: "Καθημερινή προπόνηση",
  easy_run: "Easy run",
  recovery_run: "Recovery run",
  long_run: "Long run",
  speed_training: "Speed training",
  race_day: "Race day",
  daily_walking: "Καθημερινό περπάτημα",
  all_day_standing: "Πολύωρη ορθοστασία",
  travel_walking: "Περπάτημα / ταξίδι",
  gym_strength: "Strength",
  gym_cardio: "Cardio",
  gym_functional: "Functional / HIIT",
  football_training: "Προπόνηση ποδοσφαίρου",
  football_match: "Αγώνας ποδοσφαίρου",
  day_hike: "Ημερήσια πεζοπορία",
  technical_hike: "Τεχνική πεζοπορία",
  urban_outdoor: "Outdoor + πόλη",
  basketball_training: "Προπόνηση μπάσκετ",
  basketball_match: "Αγώνας μπάσκετ",
  tennis_training: "Προπόνηση τένις",
  tennis_match: "Αγώνας τένις",
  padel_training: "Προπόνηση padel",
  padel_match: "Αγώνας padel",
  volleyball_training: "Προπόνηση βόλεϊ",
  volleyball_match: "Αγώνας βόλεϊ",
  neutral: "Neutral",
  guided_support: "Guided support",
  wide: "Φαρδιά",
  narrow: "Στενή",
  standard: "Κανονική",
  low: "Χαμηλό",
  medium: "Μεσαίο",
  high: "Υψηλό"
};

function label(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return LABELS[value] ?? value.replaceAll("_", " ");
}

function percent(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function dedupeProducts(payload: any): readonly any[] {
  const products = [
    payload?.recommendation?.primary,
    ...(payload?.recommendation?.alternatives ?? []),
    ...(payload?.recommendation?.ranked ?? [])
  ].filter(Boolean);
  const byId = new Map<string, any>();
  for (const product of products) if (product?.id && !byId.has(product.id)) byId.set(product.id, product);
  return [...byId.values()];
}

export function SportFitProductIntelligence({
  productId,
  vendorId,
  title,
  brand,
  imageSrc,
  sizes = [],
  availableToSell = 0
}: Props) {
  const [intelligence, setIntelligence] = useState<IntelligenceResponse>();
  const [open, setOpen] = useState(false);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [personalMatch, setPersonalMatch] = useState<PersonalMatch>();
  const [hasProfile, setHasProfile] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const requestedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = () => {
      if (requestedRef.current) return;
      requestedRef.current = true;
      void fetch(`/api/sport-fit/product-intelligence?productId=${encodeURIComponent(productId)}`, {
        signal: controller.signal,
        cache: "force-cache"
      })
        .then(async (result) => {
          const payload = await result.json() as IntelligenceResponse;
          if (!cancelled && result.ok) setIntelligence(payload);
        })
        .catch(() => {
          if (!cancelled) setIntelligence({ eligible: false });
        });
    };

    const win = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(load, { timeout: 1200 });
      return () => {
        cancelled = true;
        controller.abort();
        win.cancelIdleCallback?.(id);
      };
    }
    const timer = window.setTimeout(load, 450);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [productId]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !vendorId || loadingMatch || personalMatch) return;
    let parsed: StoredProfile | undefined;
    try {
      parsed = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null") as StoredProfile | undefined;
    } catch {
      parsed = undefined;
    }
    const answers = parsed?.answers;
    const validProfile = Boolean(answers && typeof answers.activity === "string" && typeof answers.audience === "string");
    setHasProfile(validProfile);
    if (!validProfile) return;

    setLoadingMatch(true);
    void fetch("/api/sport-fit/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId, answers })
    })
      .then(async (result) => {
        if (!result.ok) return undefined;
        return result.json();
      })
      .then((payload) => {
        if (!payload) return;
        const current = dedupeProducts(payload).find((product) => product.id === productId);
        if (!current) return;
        setPersonalMatch({
          score: Number(current.score) || 0,
          technicalScore: Number(current.technicalScore) || 0,
          technicalCoverage: Number(current.technicalCoverage) || 0,
          reasons: Array.isArray(current.reasons) ? current.reasons : [],
          matchedSize: typeof current.matchedSize === "string" ? current.matchedSize : undefined
        });
      })
      .finally(() => setLoadingMatch(false));
  }, [loadingMatch, open, personalMatch, productId, vendorId]);

  const knowledge = intelligence?.knowledge;
  const completeness = percent(knowledge?.completenessScore);
  const evidence = percent(knowledge?.evidenceScore);
  const activities = knowledge?.activities ?? [];
  const surfaces = knowledge?.surfaces ?? [];
  const useCases = knowledge?.useCases ?? [];

  const technicalFacts = useMemo(() => [
    knowledge?.dropMm !== undefined ? { label: "Heel-to-toe drop", value: `${knowledge.dropMm} mm` } : undefined,
    knowledge?.weightG !== undefined ? { label: "Βάρος", value: `${Math.round(knowledge.weightG)} g` } : undefined,
    knowledge?.cushioningLevel ? { label: "Cushioning", value: label(knowledge.cushioningLevel)! } : undefined,
    knowledge?.supportLevel ? { label: "Support", value: label(knowledge.supportLevel)! } : undefined,
    knowledge?.fitLengthProfile ? { label: "Fit", value: label(knowledge.fitLengthProfile)! } : undefined,
    knowledge?.widthProfile ? { label: "Πλάτος", value: label(knowledge.widthProfile)! } : undefined,
    knowledge?.breathabilityLevel ? { label: "Αναπνοή", value: label(knowledge.breathabilityLevel)! } : undefined,
    knowledge?.footballSurfaceCode ? { label: "Σόλα / γήπεδο", value: knowledge.footballSurfaceCode.toUpperCase() } : undefined
  ].filter((item): item is { label: string; value: string } => Boolean(item)), [knowledge]);

  if (!intelligence?.eligible || !knowledge) return null;

  const confidenceLabel = knowledge.status === "verified"
    ? "Επαληθευμένη γνώση"
    : knowledge.status === "partial"
      ? "Μερικώς επαληθευμένη"
      : "Sport & Fit knowledge";

  return (
    <>
      <button type="button" className={styles.aiButton} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span className={styles.aiPulse} aria-hidden="true" />
        <span className={styles.aiIcon} aria-hidden="true">✦</span>
        <span className={styles.aiCopy}>
          <small>SPORT & FIT AI</small>
          <strong>Ανάλυση παπουτσιού</strong>
        </span>
        <span className={styles.aiArrow} aria-hidden="true">↗</span>
      </button>

      {open ? (
        <div className={styles.backdrop} role="presentation" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="sport-fit-intelligence-title">
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Κλείσιμο">×</button>

            <div className={styles.hero}>
              <div
                className={styles.visual}
                onPointerMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = ((event.clientX - rect.left) / rect.width - 0.5) * 12;
                  const y = ((event.clientY - rect.top) / rect.height - 0.5) * -10;
                  setTilt({ x, y });
                }}
                onPointerLeave={() => setTilt({ x: 0, y: 0 })}
              >
                <div className={styles.orbitOne} aria-hidden="true" />
                <div className={styles.orbitTwo} aria-hidden="true" />
                <div className={styles.gridGlow} aria-hidden="true" />
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={title}
                    className={styles.shoe}
                    style={{ transform: `translateZ(48px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)` }}
                  />
                ) : <div className={styles.shoeFallback}>SPORT<br />& FIT</div>}
                <div className={styles.scanLine} aria-hidden="true" />
                <div className={styles.heroMetric}>
                  <small>KNOWLEDGE</small>
                  <strong>{Math.max(completeness, evidence)}%</strong>
                </div>
              </div>

              <div className={styles.heroCopy}>
                <span className={styles.kicker}>KONTA MOY · SPORT & FIT INTELLIGENCE</span>
                <h2 id="sport-fit-intelligence-title">{title}</h2>
                {brand ? <p className={styles.brand}>{brand}</p> : null}
                <div className={styles.statusLine}>
                  <span className={styles.statusDot} />
                  <strong>{confidenceLabel}</strong>
                  {knowledge.identityQuality ? <small>identity: {knowledge.identityQuality}</small> : null}
                </div>

                <div className={styles.qualityGrid}>
                  <div className={styles.ring} style={{ "--value": completeness } as React.CSSProperties}>
                    <span>{completeness}%</span><small>κάλυψη</small>
                  </div>
                  <div className={styles.ring} style={{ "--value": evidence } as React.CSSProperties}>
                    <span>{evidence}%</span><small>evidence</small>
                  </div>
                  <div className={styles.stockStat}>
                    <span>{availableToSell > 0 ? availableToSell : "—"}</span>
                    <small>διαθέσιμα τώρα</small>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.body}>
              <section className={styles.matchPanel}>
                <div className={styles.sectionHead}>
                  <span>YOUR MATCH</span>
                  <small>{personalMatch ? "Με βάση το τελευταίο Sport & Fit προφίλ σου" : "Προσωπική αντιστοίχιση"}</small>
                </div>
                {loadingMatch ? (
                  <div className={styles.matchLoading}><span /> Υπολογίζουμε το προσωπικό σου match…</div>
                ) : personalMatch ? (
                  <div className={styles.matchContent}>
                    <div className={styles.matchScore} style={{ "--match": personalMatch.score } as React.CSSProperties}>
                      <strong>{personalMatch.score}%</strong>
                      <small>{personalMatch.score >= 80 ? "Ισχυρό match" : personalMatch.score >= 60 ? "Καλό match" : "Πιθανό match"}</small>
                    </div>
                    <div className={styles.matchReasons}>
                      <div className={styles.matchBars}>
                        <div><span>Technical fit</span><b>{personalMatch.technicalScore}%</b><i><em style={{ width: `${personalMatch.technicalScore}%` }} /></i></div>
                        <div><span>Technical coverage</span><b>{personalMatch.technicalCoverage}%</b><i><em style={{ width: `${personalMatch.technicalCoverage}%` }} /></i></div>
                      </div>
                      {personalMatch.matchedSize ? <p className={styles.sizeMatch}>Προτεινόμενο διαθέσιμο μέγεθος: <strong>{personalMatch.matchedSize}</strong></p> : null}
                      {personalMatch.reasons.length ? <ul>{personalMatch.reasons.slice(0, 5).map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
                    </div>
                  </div>
                ) : (
                  <div className={styles.noProfile}>
                    <div className={styles.lockOrb}>AI</div>
                    <div>
                      <strong>{hasProfile ? "Δεν υπάρχει ακόμη έγκυρο match για αυτό το παπούτσι." : "Ξεκλείδωσε το προσωπικό σου match."}</strong>
                      <p>Το Sport & Fit Studio θα συνδυάσει χρήση, επιφάνεια, απόσταση, fit και μέγεθος με τα δεδομένα αυτού του μοντέλου.</p>
                    </div>
                  </div>
                )}
              </section>

              {technicalFacts.length ? (
                <section className={styles.factsSection}>
                  <div className={styles.sectionHead}><span>TECHNICAL PROFILE</span><small>Μόνο γνωστά, τεκμηριωμένα πεδία</small></div>
                  <div className={styles.factGrid}>
                    {technicalFacts.map((fact) => <div key={fact.label}><small>{fact.label}</small><strong>{fact.value}</strong></div>)}
                  </div>
                </section>
              ) : null}

              <div className={styles.knowledgeColumns}>
                {activities.length ? <section><div className={styles.sectionHead}><span>SPORTS</span></div><div className={styles.chips}>{activities.map((item) => <span key={item}>{label(item)}</span>)}</div></section> : null}
                {surfaces.length ? <section><div className={styles.sectionHead}><span>SURFACES</span></div><div className={styles.chips}>{surfaces.map((item) => <span key={item}>{label(item)}</span>)}</div></section> : null}
                {useCases.length ? <section><div className={styles.sectionHead}><span>USE CASES</span></div><div className={styles.chips}>{useCases.map((item) => <span key={item}>{label(item)}</span>)}</div></section> : null}
              </div>

              {knowledge.weatherProtection?.length ? (
                <section className={styles.weather}>
                  <span>WEATHER</span>
                  <p>{knowledge.weatherProtection.map((item) => label(item)).join(" · ")}</p>
                </section>
              ) : null}

              <section className={styles.availability}>
                <div><span>SIZE & AVAILABILITY</span><strong>{sizes.length ? sizes.slice(0, 12).join(" · ") : "Δες τις διαθέσιμες παραλλαγές στη σελίδα προϊόντος"}</strong></div>
                <div className={availableToSell > 0 ? styles.available : styles.unavailable}>{availableToSell > 0 ? "LIVE STOCK" : "CHECK STOCK"}</div>
              </section>

              <div className={styles.actions}>
                <Link href="/sport-fit-studio" className={styles.primaryCta}>
                  <span>✦</span>
                  <div><small>SPORT & FIT STUDIO</small><strong>Βρες το σωστό παπούτσι για εσένα</strong></div>
                  <b>→</b>
                </Link>
                <button type="button" className={styles.secondaryCta} onClick={() => setOpen(false)}>Επιστροφή στο προϊόν</button>
              </div>

              <p className={styles.disclaimer}>Τα ποσοστά γνώσης αφορούν την πληρότητα και την τεκμηρίωση του knowledge graph. Προσωπικό match εμφανίζεται μόνο όταν υπάρχει αποθηκευμένο Sport & Fit προφίλ και το προϊόν συμμετέχει στην τρέχουσα αντιστοίχιση.</p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
