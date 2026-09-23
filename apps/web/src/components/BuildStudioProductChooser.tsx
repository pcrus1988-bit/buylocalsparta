"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./BuildStudioProductChooser.module.css";
import { paintBuildFinishLabel, paintBuildPackageLabel, paintBuildTintBaseLabel } from "../lib/paint-build-greek-presentation";

export type BuildStudioCandidate = Readonly<{
  id: string;
  slug: string;
  url: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  categoryLabel?: string;
  brand?: string;
  mediaId?: string;
  mediaAlt?: string;
  imageUrl?: string;
  vendorName?: string;
  score: number;
  matchedTerms: readonly string[];
  manufacturerProductId: string;
  manufacturerProductName: string;
  manufacturerEligibilityStatus:
    | "eligible"
    | "eligible_with_preparation"
    | "requires_specific_primer"
    | "requires_system_component";
  manufacturerRuleKey: string;
  technicalVerificationStatus: "verified";
}>;

export type ProjectKitItem = Readonly<{
  canonicalVariantId: string;
  title: string;
  priceMinor: number;
  price: string;
  quantity: number;
  imageUrl?: string;
  selected: boolean;
  required: boolean;
  role: "required_system" | "recommended_working" | "optional_extra";
  sourceLayer: "MANUFACTURER_VITEX" | "KONTA_MOU_RULE";
  reasonEl: string;
  manufacturerProductId?: string;
}>;

type FamilyVariant = Readonly<{
  id: string;
  title: string;
  priceMinor: number;
  price: string;
  packValue: number;
  packUnit: string;
  colourHint?: string;
  tintBaseHint?: string;
  finishHint?: string;
  imageUrl?: string;
}>;

type QuantityEstimate = Readonly<{
  status: "available" | "missing_manufacturer_values" | "manufacturer_not_selected";
  areaM2: number;
  unit?: "L";
  min?: number;
  max?: number;
  coatsMin?: number;
  coatsMax?: number;
  basisEl: string;
}>;

type PackPlan = Readonly<{
  requiredLitres: number;
  totalLitres: number;
  surplusLitres: number;
  totalPriceMinor: number;
  packCount: number;
  lines: readonly Readonly<{
    variant: FamilyVariant;
    quantity: number;
    litresEach: number;
    totalLitres: number;
    totalPriceMinor: number;
  }>[];
}>;

type ProjectKitResponse = Readonly<{
  family: Readonly<{
    manufacturerProductId: string;
    title: string;
    brand: string;
    imageUrl?: string;
    variants: readonly FamilyVariant[];
  }>;
  technical: Readonly<{
    eligibility?: string;
    ruleKey?: string;
    whySuitable?: string;
    coverageM2PerLitre?: Readonly<{ min?: number; max?: number; conditions?: string | null }>;
    twoCoatCoverageM2PerLitre?: Readonly<{ min: number; max: number }>;
    coats?: Readonly<{ min?: number; max?: number }>;
    dryToTouchMinutes?: Readonly<{ min?: number | null; max?: number | null }>;
    recoatMinutes?: Readonly<{ min?: number | null; max?: number | null }>;
    primerRequired?: boolean | null;
    recommendedPrimers: readonly string[];
    requiredSystemComponents: readonly string[];
    applicationMethods: readonly string[];
    recommendedRoller?: string | null;
    recommendedBrush?: string | null;
    preparation: readonly string[];
    warnings: readonly string[];
  }>;
  quantityEstimate: QuantityEstimate;
  packPlan?: PackPlan;
  selectedVariantId?: string;
  customerGuide?: unknown;
  kit?: Readonly<{
    complete: boolean;
    completenessReasons: readonly string[];
    items: readonly ProjectKitItem[];
    unresolvedRequired: readonly Readonly<Record<string, unknown>>[];
    unavailableAccessorySlots: readonly Readonly<{
      ruleKey: string;
      label: string;
      categoryCode: string;
      role: "recommended_working" | "optional_extra";
    }>[];
  }>;
}>;

export type BuildStudioProjectKit = ProjectKitResponse;

type CompatibilityProfile = Readonly<{
  index: number;
  label: string;
  reason: string;
  condition: string;
}>;

type ProductFamily = Readonly<{
  manufacturerProductId: string;
  manufacturerProductName: string;
  products: readonly BuildStudioCandidate[];
  representative: BuildStudioCandidate;
  minPriceMinor: number;
  minPrice: string;
  compatibility: CompatibilityProfile;
}>;

function ProductArtwork({ product }: { product: BuildStudioCandidate | FamilyVariant }) {
  const mediaId = "mediaId" in product ? product.mediaId : undefined;
  const mediaAlt = "mediaAlt" in product ? product.mediaAlt : undefined;
  const sources = [
    mediaId ? `/api/media/${encodeURIComponent(mediaId)}` : undefined,
    product.imageUrl
  ].filter((value): value is string => Boolean(value));
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [product.id]);
  const source = sources[sourceIndex];

  if (!source) {
    return <span className={styles.fallbackArtwork} aria-hidden="true">{product.title.slice(0, 1).toUpperCase()}</span>;
  }

  return (
    <img
      src={source}
      alt={mediaAlt || product.title}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}

function eligibilityLabel(status: BuildStudioCandidate["manufacturerEligibilityStatus"]): string {
  if (status === "eligible_with_preparation") return "Επαληθευμένο · με προεργασία";
  if (status === "requires_specific_primer") return "Επαληθευμένο · απαιτεί αστάρι";
  if (status === "requires_system_component") return "Επαληθευμένο · μέρος συστήματος";
  return "Τεχνικά επαληθευμένο";
}

function compatibilityProfile(product: BuildStudioCandidate): CompatibilityProfile {
  const termBonus = Math.min(3, product.matchedTerms.length);
  if (product.manufacturerEligibilityStatus === "eligible_with_preparation") {
    const index = Math.min(99, 93 + termBonus);
    return {
      index,
      label: index >= 96 ? "Πολύ υψηλή" : "Υψηλή",
      reason: "Κατάλληλο για το έργο όταν προηγηθεί η επαληθευμένη προεργασία.",
      condition: "Με προεργασία"
    };
  }
  if (product.manufacturerEligibilityStatus === "requires_specific_primer") {
    const index = Math.min(99, 91 + termBonus);
    return {
      index,
      label: "Υψηλή",
      reason: "Κατάλληλο για το έργο με το αστάρι που απαιτεί η τεχνική οδηγία.",
      condition: "Με απαιτούμενο αστάρι"
    };
  }
  if (product.manufacturerEligibilityStatus === "requires_system_component") {
    const index = Math.min(99, 89 + termBonus);
    return {
      index,
      label: index >= 92 ? "Υψηλή" : "Ισχυρή",
      reason: "Κατάλληλο όταν χρησιμοποιηθεί ως μέρος του επαληθευμένου συστήματος.",
      condition: "Ως μέρος συστήματος"
    };
  }
  const index = Math.min(99, 96 + termBonus);
  return {
    index,
    label: "Πολύ υψηλή",
    reason: "Άμεση τεχνική αντιστοίχιση με τα στοιχεία που έχεις δηλώσει για το έργο.",
    condition: "Άμεση τεχνική αντιστοίχιση"
  };
}

function money(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function routeLabel(variant: FamilyVariant): string {
  const title = variant.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("el-GR");
  if (variant.colourHint?.toLocaleLowerCase("en") === "white" || /λευκ|white/.test(title)) return "Λευκό";
  if (/ανοιχτ|light/.test(title)) return "Ανοιχτές αποχρώσεις";
  if (/μεσαι|medium/.test(title)) return "Μεσαίες αποχρώσεις";
  if (/σκουρ|dark/.test(title)) return "Σκούρες αποχρώσεις";
  if (/καθετων επιφανειων|vertical/.test(title)) return "Κάθετες επιφάνειες";
  return paintBuildTintBaseLabel(variant.tintBaseHint || variant.colourHint) || paintBuildFinishLabel(variant.finishHint) || "Βασική έκδοση";
}

function routeKey(variant: FamilyVariant): string {
  return routeLabel(variant).toLocaleLowerCase("el-GR");
}

function rangeText(min?: number | null, max?: number | null, suffix = ""): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null && min !== max) return `${min}–${max}${suffix}`;
  return `${min ?? max}${suffix}`;
}

function FamilyOverlay({
  family,
  scenarioKey,
  facts,
  areaM2,
  onClose,
  onChoose
}: {
  family: ProductFamily;
  scenarioKey: string;
  facts: Readonly<Record<string, unknown>>;
  areaM2: number;
  onClose: () => void;
  onChoose: (kit: ProjectKitResponse, product: BuildStudioCandidate) => void;
}) {
  const [detail, setDetail] = useState<ProjectKitResponse>();
  const [preview, setPreview] = useState<ProjectKitResponse>();
  const [selectedVariantId, setSelectedVariantId] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setDetail(undefined);
    setPreview(undefined);
    setSelectedVariantId(undefined);
    void fetch("/api/build-studio/project-kit", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioKey,
        facts,
        manufacturerProductId: family.manufacturerProductId,
        areaM2
      })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`family detail: ${response.status}`);
        return response.json() as Promise<ProjectKitResponse>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setDetail(payload);
        const routes = new Map<string, FamilyVariant>();
        for (const variant of payload.family.variants) {
          const key = routeKey(variant);
          const current = routes.get(key);
          if (!current || variant.priceMinor < current.priceMinor) routes.set(key, variant);
        }
        const preferred = [...routes.values()].sort((a, b) => {
          const aWhite = routeLabel(a) === "Λευκό" ? 0 : 1;
          const bWhite = routeLabel(b) === "Λευκό" ? 0 : 1;
          return aWhite - bWhite || a.priceMinor - b.priceMinor;
        })[0];
        setSelectedVariantId(preferred?.id);
        setState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [areaM2, facts, family.manufacturerProductId, scenarioKey]);

  useEffect(() => {
    if (!selectedVariantId || !detail) return;
    const controller = new AbortController();
    setPreviewState("loading");
    void fetch("/api/build-studio/project-kit", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioKey,
        facts,
        manufacturerProductId: family.manufacturerProductId,
        selectedVariantId,
        areaM2
      })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`project kit preview: ${response.status}`);
        return response.json() as Promise<ProjectKitResponse>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setPreview(payload);
        setPreviewState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setPreviewState("error");
      });
    return () => controller.abort();
  }, [areaM2, detail, facts, family.manufacturerProductId, scenarioKey, selectedVariantId]);

  const routes = useMemo(() => {
    const map = new Map<string, FamilyVariant>();
    for (const variant of detail?.family.variants ?? []) {
      const key = routeKey(variant);
      const current = map.get(key);
      if (!current || variant.priceMinor < current.priceMinor) map.set(key, variant);
    }
    return [...map.values()];
  }, [detail]);

  const selected = detail?.family.variants.find((variant) => variant.id === selectedVariantId);
  const selectedRoute = selected ? routeKey(selected) : "";
  const routeVariants = (detail?.family.variants ?? []).filter((variant) => routeKey(variant) === selectedRoute);
  const quantity = preview?.quantityEstimate ?? detail?.quantityEstimate;
  const plan = preview?.packPlan;

  function choose() {
    if (!preview?.kit || !selectedVariantId) return;
    const exact = family.products.find((product) => product.id === selectedVariantId);
    const variant = detail?.family.variants.find((item) => item.id === selectedVariantId);
    const fallback = family.representative;
    const candidate: BuildStudioCandidate = exact ?? {
      ...fallback,
      id: selectedVariantId,
      title: variant?.title ?? fallback.title,
      price: variant?.price ?? fallback.price,
      priceMinor: variant?.priceMinor ?? fallback.priceMinor,
      imageUrl: variant?.imageUrl ?? fallback.imageUrl
    };
    onChoose(preview, candidate);
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`VITEX ${family.manufacturerProductName}`}>
      <div className={styles.overlayShell}>
        <button type="button" className={styles.overlayClose} onClick={onClose} aria-label="Κλείσιμο">×</button>
        {state === "loading" ? <div className={styles.overlayLoading}>Φορτώνω την επαληθευμένη τεχνική καρτέλα…</div> : null}
        {state === "error" ? <div className={styles.overlayError}>Η τεχνική καρτέλα δεν είναι διαθέσιμη αυτή τη στιγμή.</div> : null}
        {state === "ready" && detail ? (
          <>
            <div className={styles.overlayHero}>
              <div className={styles.overlayImage}><ProductArtwork product={selected ?? detail.family.variants[0] ?? family.representative} /></div>
              <div>
                <span>VITEX · ΕΠΑΛΗΘΕΥΜΕΝΗ ΟΙΚΟΓΕΝΕΙΑ ΠΡΟΪΟΝΤΟΣ</span>
                <h2>VITEX {detail.family.title}</h2>
                <p>{detail.technical.whySuitable || "Η οικογένεια προϊόντος έχει επαληθευμένη καταλληλότητα για το συγκεκριμένο σενάριο του έργου."}</p>
                <div className={styles.projectFact}><small>ΤΟ ΕΡΓΟ ΣΟΥ</small><strong>{areaM2} m²</strong></div>
              </div>
            </div>

            <div className={styles.overlaySection}>
              <h3>1. Διάλεξε έκδοση / χρωματική βάση</h3>
              <div className={styles.routeChoices}>
                {routes.map((variant) => {
                  const active = selectedRoute === routeKey(variant);
                  return <button type="button" key={routeKey(variant)} className={active ? styles.routeActive : styles.routeButton} onClick={() => setSelectedVariantId(variant.id)}>
                    <strong>{routeLabel(variant)}</strong>
                    <small>από {variant.price}</small>
                  </button>;
                })}
              </div>
              {selected ? <div className={styles.packSizes}><span>Διαθέσιμες συσκευασίες:</span>{routeVariants.map((variant) => <b key={variant.id}>{paintBuildPackageLabel(`${variant.packValue}${variant.packUnit}`)}</b>)}</div> : null}
            </div>

            <div className={styles.techGrid}>
              <div><small>Κάλυψη VITEX · 1 στρώση</small><strong>{rangeText(detail.technical.coverageM2PerLitre?.min, detail.technical.coverageM2PerLitre?.max, " m²/L")}</strong></div>
              {detail.technical.twoCoatCoverageM2PerLitre ? <div><small>Κάλυψη VITEX · 2 στρώσεις</small><strong>{rangeText(detail.technical.twoCoatCoverageM2PerLitre.min, detail.technical.twoCoatCoverageM2PerLitre.max, " m²/L")}</strong></div> : null}
              <div><small>Στρώσεις υπολογισμού</small><strong>{rangeText(detail.technical.coats?.min, detail.technical.coats?.max)}</strong></div>
              <div><small>Στέγνωμα αφής</small><strong>{rangeText(detail.technical.dryToTouchMinutes?.min, detail.technical.dryToTouchMinutes?.max, "′")}</strong></div>
              <div><small>Επαναβαφή</small><strong>{rangeText(detail.technical.recoatMinutes?.min, detail.technical.recoatMinutes?.max, "′")}</strong></div>
            </div>

            <div className={styles.overlayColumns}>
              <div>
                <h3>Προετοιμασία / αστάρι</h3>
                <ul>{detail.technical.preparation.map((item) => <li key={item}>{item}</li>)}</ul>
                {detail.technical.primerRequired ? <strong className={styles.requiredFlag}>ΑΠΑΙΤΕΙΤΑΙ ΑΣΤΑΡΙ</strong> : null}
                {detail.technical.recommendedPrimers.length ? <p>VITEX: {detail.technical.recommendedPrimers.join(", ")}</p> : null}
              </div>
              <div>
                <h3>Προειδοποιήσεις</h3>
                {detail.technical.warnings.length ? <ul>{detail.technical.warnings.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Δεν υπάρχουν πρόσθετες καταγεγραμμένες προειδοποιήσεις στην τρέχουσα επαληθευμένη καρτέλα.</p>}
              </div>
            </div>

            <div className={styles.calculationPanel}>
              <div>
                <small>ΥΠΟΛΟΓΙΣΜΟΣ ΓΙΑ {areaM2} m²</small>
                {quantity?.status === "available" ? (
                  <>
                    <strong>Απαίτηση: {quantity.min === quantity.max ? quantity.min : `${quantity.min}–${quantity.max}`} L</strong>
                    {plan ? <p>Προτεινόμενη αγορά: {plan.lines.map((line) => `${line.quantity} × ${paintBuildPackageLabel(`${line.variant.packValue}${line.variant.packUnit}`)}`).join(" + ")} · {money(plan.totalPriceMinor)}</p> : <p>Δεν υπάρχει ασφαλής συνδυασμός διαθέσιμων συσκευασιών.</p>}
                    <p>{quantity.basisEl}</p>
                  </>
                ) : (
                  <>
                    <strong>Δεν γίνεται ακόμη ασφαλής αυτόματος υπολογισμός.</strong>
                    <p>{quantity?.basisEl}</p>
                  </>
                )}
              </div>
              <button type="button" disabled={!preview?.kit || previewState === "loading"} onClick={choose}>
                {previewState === "loading" ? "ΥΠΟΛΟΓΙΣΜΟΣ ΕΡΓΟΥ…" : "ΕΠΙΛΟΓΗ ΓΙΑ ΤΟ ΕΡΓΟ ΜΟΥ"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function BuildStudioProductChooser({
  terms,
  scenarioKey,
  facts = {},
  areaM2,
  heading = "Επαληθευμένες επιλογές προϊόντος",
  onProjectKitReady
}: {
  terms: readonly string[];
  scenarioKey: string;
  facts?: Readonly<Record<string, unknown>>;
  areaM2: number;
  heading?: string;
  onProjectKitReady: (kit: BuildStudioProjectKit, product: BuildStudioCandidate) => void;
}) {
  const [products, setProducts] = useState<readonly BuildStudioCandidate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "degraded">("loading");
  const [openFamilyId, setOpenFamilyId] = useState<string>();

  const queryKey = useMemo(
    () => [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 8).join("|"),
    [terms]
  );
  const factsJson = useMemo(() => JSON.stringify(facts), [facts]);

  useEffect(() => {
    setOpenFamilyId(undefined);
    if (!scenarioKey) {
      setProducts([]);
      setState("empty");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    const params = new URLSearchParams();
    if (queryKey) params.set("term", queryKey);
    params.set("scenario", scenarioKey);
    if (factsJson !== "{}") params.set("facts", factsJson);

    void fetch(`/api/build-studio/candidates?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`build-studio candidates: ${response.status}`);
        return response.json() as Promise<{ products?: BuildStudioCandidate[]; degraded?: boolean }>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        const next = Array.isArray(payload.products)
          ? payload.products.filter((product) => product.technicalVerificationStatus === "verified" && product.manufacturerProductId)
          : [];
        setProducts(next);
        if (payload.degraded) setState("degraded");
        else setState(next.length ? "ready" : "empty");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setProducts([]);
        setState("degraded");
      });
    return () => controller.abort();
  }, [factsJson, queryKey, scenarioKey]);

  const families = useMemo<ProductFamily[]>(() => {
    const map = new Map<string, BuildStudioCandidate[]>();
    for (const product of products) {
      map.set(product.manufacturerProductId, [...(map.get(product.manufacturerProductId) ?? []), product]);
    }
    return [...map.entries()].map(([manufacturerProductId, familyProducts]) => {
      const sorted = [...familyProducts].sort((a, b) => b.score - a.score || a.priceMinor - b.priceMinor);
      const representative = sorted[0];
      const minPriceMinor = Math.min(...familyProducts.map((product) => product.priceMinor));
      return {
        manufacturerProductId,
        manufacturerProductName: representative.manufacturerProductName || representative.title,
        products: familyProducts,
        representative,
        minPriceMinor,
        minPrice: money(minPriceMinor),
        compatibility: compatibilityProfile(representative)
      };
    }).sort((a, b) =>
      b.compatibility.index - a.compatibility.index
      || b.representative.score - a.representative.score
      || a.minPriceMinor - b.minPriceMinor
      || a.manufacturerProductName.localeCompare(b.manufacturerProductName, "el")
    );
  }, [products]);

  const topCompatibility = families[0]?.compatibility.index;
  const openFamily = families.find((family) => family.manufacturerProductId === openFamilyId);

  return (
    <section className={styles.chooser} aria-labelledby="build-studio-products">
      <div className={styles.heading}>
        <div>
          <span>ΕΠΑΛΗΘΕΥΜΕΝΕΣ ΟΙΚΟΓΕΝΕΙΕΣ ΠΡΟΪΟΝΤΩΝ</span>
          <h2 id="build-studio-products">{heading}</h2>
          <p>Κάθε τεχνική οικογένεια εμφανίζεται μία φορά. Ο δείκτης δείχνει πόσο άμεσα αντιστοιχεί στο συγκεκριμένο έργο, με βάση την επαληθευμένη τεχνική επιλεξιμότητα και τα στοιχεία που επέλεξες — δεν είναι γενική βαθμολογία ποιότητας.</p>
        </div>
      </div>

      {state === "loading" ? <div className={styles.loadingState} role="status"><i /><strong>Ελέγχω διαθέσιμα προϊόντα με τεχνικά επαληθευμένη καταλληλότητα…</strong></div> : null}

      {state === "ready" ? (
        <div className={styles.grid}>
          {families.map((family, index) => {
            const highestMatch = family.compatibility.index === topCompatibility;
            return (
              <article className={highestMatch ? `${styles.card} ${styles.bestMatchCard}` : styles.card} key={family.manufacturerProductId}>
                <div className={styles.selectCard}>
                  <div className={styles.previewColumn}>
                    <div className={styles.imageStage}>
                      <ProductArtwork product={family.representative} />
                      <span className={styles.rank}>#{String(index + 1).padStart(2, "0")}</span>
                      <b>{family.products.length} ΕΚΔΟΣΕΙΣ</b>
                    </div>
                    <div className={styles.copy}>
                      <small>{family.representative.brand || "VITEX"}</small>
                      <strong>VITEX {family.manufacturerProductName}</strong>
                      <div className={styles.meta}>
                        <span>{eligibilityLabel(family.representative.manufacturerEligibilityStatus)}</span>
                        <em>από {family.minPrice}</em>
                      </div>
                    </div>
                  </div>

                  <div className={styles.compatibilityPanel}>
                    {highestMatch ? <span className={styles.bestMatchBadge}>ΥΨΗΛΟΤΕΡΗ ΑΝΤΙΣΤΟΙΧΙΣΗ</span> : null}
                    <div className={styles.compatibilityHeader}>
                      <span>ΚΑΤΑΛΛΗΛΟΤΗΤΑ ΓΙΑ ΤΟ ΕΡΓΟ</span>
                      <strong>{family.compatibility.index}<small>/100</small></strong>
                    </div>
                    <div className={styles.compatibilityScale} aria-label={`Δείκτης καταλληλότητας ${family.compatibility.index} από 100`}>
                      <i style={{ width: `${family.compatibility.index}%` }} />
                    </div>
                    <b className={styles.compatibilityLabel}>{family.compatibility.label} αντιστοίχιση</b>
                    <p className={styles.compatibilityReason}>{family.compatibility.reason}</p>
                    <div className={styles.highlights} aria-label="Κύρια σημεία">
                      <span>Τεχνικά επαληθευμένο</span>
                      <span>{family.compatibility.condition}</span>
                      <span>{family.products.length} εκδόσεις</span>
                    </div>
                    <button className={styles.detailLink} type="button" onClick={() => setOpenFamilyId(family.manufacturerProductId)}>Δες λεπτομέρειες →</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {state === "empty" ? (
        <div className={styles.emptyState}>
          <strong>Δεν υπάρχουν ακόμη τεχνικά επαληθευμένες επιλογές προϊόντος για αυτό το έργο.</strong>
          <p>Το Studio δεν παρουσιάζει προϊόν ως κατάλληλο μόνο επειδή ταιριάζει σε λέξεις-κλειδιά.</p>
        </div>
      ) : null}

      {state === "degraded" ? (
        <div className={styles.emptyState}>
          <strong>Ο τεχνικός έλεγχος των διαθέσιμων προϊόντων δεν είναι διαθέσιμος αυτή τη στιγμή.</strong>
          <p>Για ασφάλεια δεν εμφανίζουμε μη επαληθευμένες εναλλακτικές ως συμβατές.</p>
          <button type="button" onClick={() => window.location.reload()}>Ξαναφόρτωση Studio</button>
        </div>
      ) : null}

      {openFamily ? (
        <FamilyOverlay
          family={openFamily}
          scenarioKey={scenarioKey}
          facts={facts}
          areaM2={areaM2}
          onClose={() => setOpenFamilyId(undefined)}
          onChoose={(kit, product) => {
            setOpenFamilyId(undefined);
            onProjectKitReady(kit, product);
          }}
        />
      ) : null}
    </section>
  );
}
