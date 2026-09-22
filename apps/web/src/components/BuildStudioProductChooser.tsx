"use client";

import { useEffect, useMemo, useState } from "react";
import {
  optimizeBuildStudioPacks,
  type BuildStudioPackPlan
} from "../lib/build-studio-pack-optimizer";
import styles from "./BuildStudioProductFlow.module.css";

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
  manufacturerProductName: string;
  manufacturerFamilyName?: string;
  packValue?: number;
  packUnit?: string;
  packLitres?: number;
  colourHint?: string;
  tintBaseHint?: string;
  finishHint?: string;
  selectionGroupKey: string;
  mediaId?: string;
  mediaAlt?: string;
  imageUrl?: string;
  vendorName?: string;
  score: number;
  matchedTerms: readonly string[];
  manufacturerProductId: string;
  manufacturerEligibilityStatus:
    | "eligible"
    | "eligible_with_preparation"
    | "requires_specific_primer"
    | "requires_system_component";
  manufacturerRuleKey: string;
  technicalVerificationStatus: "verified";
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

type GuideItem = Readonly<{
  key: string;
  textEl: string;
  requirement?: string;
}>;

type CustomerGuide = Readonly<{
  preparation: readonly GuideItem[];
  whatYouNeed: readonly GuideItem[];
  manufacturerInstructions: readonly GuideItem[];
  timings: readonly GuideItem[];
  avoid: readonly GuideItem[];
  warnings: readonly GuideItem[];
}>;

type GuidancePayload = Readonly<{
  customerGuide?: CustomerGuide;
  quantityEstimate?: QuantityEstimate;
  guidance?: Readonly<{
    manufacturer_guidance?: Readonly<{
      status?: string;
      application_profile?: Readonly<Record<string, unknown>>;
    }>;
  }>;
}>;

type CandidateFamily = Readonly<{
  id: string;
  title: string;
  brand: string;
  familyName?: string;
  variants: readonly BuildStudioCandidate[];
  fromPriceMinor: number;
  score: number;
}>;

export type BuildStudioProjectSelection = Readonly<{
  manufacturerProductId: string;
  familyTitle: string;
  selectionGroupKey: string;
  primaryCandidate: BuildStudioCandidate;
  lines: readonly Readonly<{
    candidate: BuildStudioCandidate;
    quantity: number;
  }>[];
  quantityEstimate?: QuantityEstimate;
  packPlan?: BuildStudioPackPlan;
  totalPriceMinor: number;
}>;

function money(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

function ProductArtwork({ product }: { product: BuildStudioCandidate }) {
  const sources = [
    product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : undefined,
    product.imageUrl
  ].filter((value): value is string => Boolean(value));
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex];

  useEffect(() => setSourceIndex(0), [product.id]);

  if (!source) {
    return <span className={styles.fallbackArtwork} aria-hidden="true">{product.title.slice(0, 1).toUpperCase()}</span>;
  }

  return (
    <img
      src={source}
      alt={product.mediaAlt || product.title}
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

function groupFamilies(products: readonly BuildStudioCandidate[]): readonly CandidateFamily[] {
  const grouped = new Map<string, BuildStudioCandidate[]>();
  for (const product of products) {
    const current = grouped.get(product.manufacturerProductId) ?? [];
    current.push(product);
    grouped.set(product.manufacturerProductId, current);
  }

  return [...grouped.entries()]
    .map(([id, variants]) => {
      const sorted = [...variants].sort((left, right) =>
        (left.packLitres ?? Number.MAX_SAFE_INTEGER) - (right.packLitres ?? Number.MAX_SAFE_INTEGER)
        || left.priceMinor - right.priceMinor
        || left.title.localeCompare(right.title, "el")
      );
      const first = sorted[0];
      return {
        id,
        title: first.manufacturerProductName || first.title,
        brand: first.brand || "VITEX",
        familyName: first.manufacturerFamilyName,
        variants: sorted,
        fromPriceMinor: Math.min(...sorted.map((variant) => variant.priceMinor)),
        score: Math.max(...sorted.map((variant) => variant.score))
      } satisfies CandidateFamily;
    })
    .sort((left, right) =>
      right.score - left.score
      || left.fromPriceMinor - right.fromPriceMinor
      || left.title.localeCompare(right.title, "el")
    );
}

function stripPack(value: string): string {
  return value
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|lt|ltr|λίτρα|λίτρο)\b/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupLabel(variants: readonly BuildStudioCandidate[]): string {
  const first = variants[0];
  const colour = first.colourHint?.toLocaleLowerCase("el-GR");
  if (colour === "white") return "Λευκό";
  if (first.colourHint) return first.colourHint;
  if (first.tintBaseHint) return first.tintBaseHint;
  return stripPack(first.title);
}

function profileNumber(profile: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = profile[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function rangeText(min: number | undefined, max: number | undefined, suffix: string): string | undefined {
  if (min == null && max == null) return undefined;
  if (min != null && max != null && min !== max) return `${min}–${max}${suffix}`;
  return `${min ?? max}${suffix}`;
}

function DetailList({ title, items }: { title: string; items: readonly GuideItem[] }) {
  if (!items.length) return null;
  return (
    <div className={styles.detailSection}>
      <span>VERIFIED</span>
      <h4>{title}</h4>
      <ul>{items.map((item) => <li key={item.key}>{item.textEl}</li>)}</ul>
    </div>
  );
}

export function BuildStudioProductChooser({
  terms,
  scenarioKey,
  facts = {},
  areaM2,
  heading = "Επαληθευμένες επιλογές προϊόντος",
  selectedCatalogueId,
  onManufacturerProductChange,
  onSelectionChange,
  onProjectSelectionChange
}: {
  terms: readonly string[];
  scenarioKey: string;
  facts?: Readonly<Record<string, unknown>>;
  areaM2: number;
  heading?: string;
  selectedCatalogueId?: string;
  onManufacturerProductChange?: (manufacturerProductId: string | undefined) => void;
  onSelectionChange?: (candidate: BuildStudioCandidate | undefined) => void;
  onProjectSelectionChange?: (selection: BuildStudioProjectSelection | undefined) => void;
}) {
  const [products, setProducts] = useState<readonly BuildStudioCandidate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "degraded">("loading");
  const [openFamilyId, setOpenFamilyId] = useState<string>();
  const [selectionGroupKey, setSelectionGroupKey] = useState<string>();
  const [manualVariantId, setManualVariantId] = useState<string>();
  const [detail, setDetail] = useState<GuidancePayload>();
  const [detailState, setDetailState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const queryKey = useMemo(
    () => [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 8).join("|"),
    [terms]
  );
  const factsJson = useMemo(() => JSON.stringify(facts), [facts]);
  const families = useMemo(() => groupFamilies(products), [products]);
  const openFamily = families.find((family) => family.id === openFamilyId);
  const selected = products.find((product) => product.id === selectedCatalogueId);

  const variantGroups = useMemo(() => {
    if (!openFamily) return [] as ReadonlyArray<readonly [string, readonly BuildStudioCandidate[]]>;
    const grouped = new Map<string, BuildStudioCandidate[]>();
    for (const variant of openFamily.variants) {
      const current = grouped.get(variant.selectionGroupKey) ?? [];
      current.push(variant);
      grouped.set(variant.selectionGroupKey, current);
    }
    return [...grouped.entries()].map(([key, variants]) => [key, variants] as const);
  }, [openFamily]);

  const activeGroupKey = selectionGroupKey && variantGroups.some(([key]) => key === selectionGroupKey)
    ? selectionGroupKey
    : variantGroups[0]?.[0];
  const activeVariants = variantGroups.find(([key]) => key === activeGroupKey)?.[1] ?? [];
  const quantityEstimate = detail?.quantityEstimate;
  const packPlan = useMemo(() => {
    if (quantityEstimate?.status !== "available" || quantityEstimate.max == null || !activeGroupKey) return undefined;
    return optimizeBuildStudioPacks(
      quantityEstimate.max,
      activeVariants.flatMap((variant) =>
        variant.packLitres
          ? [{
              id: variant.id,
              title: variant.title,
              priceMinor: variant.priceMinor,
              packLitres: variant.packLitres,
              selectionGroupKey: activeGroupKey
            }]
          : []
      )
    );
  }, [activeGroupKey, activeVariants, quantityEstimate]);

  const manualVariant = activeVariants.find((variant) => variant.id === manualVariantId) ?? activeVariants[0];

  useEffect(() => {
    onManufacturerProductChange?.(undefined);
    onSelectionChange?.(undefined);
    onProjectSelectionChange?.(undefined);
    if (!queryKey || !scenarioKey) {
      setProducts([]);
      setState("empty");
      return;
    }

    const controller = new AbortController();
    setState("loading");

    const params = new URLSearchParams();
    params.set("term", queryKey);
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
          ? payload.products.filter((product) =>
              product.technicalVerificationStatus === "verified"
              && typeof product.manufacturerProductId === "string"
              && product.manufacturerProductId.length > 0
            )
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
    // Callbacks deliberately do not participate in discovery identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factsJson, queryKey, scenarioKey]);

  useEffect(() => {
    if (!openFamily) {
      setDetail(undefined);
      setDetailState("idle");
      return;
    }

    const selectedVariant = openFamily.variants.find((variant) => variant.id === selectedCatalogueId);
    setSelectionGroupKey(selectedVariant?.selectionGroupKey ?? openFamily.variants[0]?.selectionGroupKey);
    setManualVariantId(selectedVariant?.id ?? openFamily.variants[0]?.id);

    const controller = new AbortController();
    setDetail(undefined);
    setDetailState("loading");
    void fetch("/api/build-studio/guidance", {
      method: "POST",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioKey,
        facts: JSON.parse(factsJson) as Record<string, unknown>,
        manufacturerProductId: openFamily.id,
        areaM2
      })
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`guidance: ${response.status}`);
        return response.json() as Promise<GuidancePayload>;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setDetail(payload);
        setDetailState("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setDetail(undefined);
        setDetailState("error");
      });
    return () => controller.abort();
  }, [areaM2, factsJson, openFamily, scenarioKey, selectedCatalogueId]);

  useEffect(() => {
    if (!openFamilyId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFamilyId(undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openFamilyId]);

  function clearSelection() {
    onManufacturerProductChange?.(undefined);
    onSelectionChange?.(undefined);
    onProjectSelectionChange?.(undefined);
  }

  function chooseForProject() {
    if (!openFamily || !activeGroupKey) return;

    const lines = packPlan
      ? packPlan.lines.flatMap((line) => {
          const candidate = activeVariants.find((variant) => variant.id === line.variantId);
          return candidate ? [{ candidate, quantity: line.quantity }] : [];
        })
      : manualVariant
        ? [{ candidate: manualVariant, quantity: 1 }]
        : [];

    if (!lines.length) return;
    const primaryCandidate = lines[0].candidate;
    const totalPriceMinor = lines.reduce((sum, line) => sum + line.candidate.priceMinor * line.quantity, 0);
    const selection: BuildStudioProjectSelection = {
      manufacturerProductId: openFamily.id,
      familyTitle: openFamily.title,
      selectionGroupKey: activeGroupKey,
      primaryCandidate,
      lines,
      quantityEstimate,
      packPlan,
      totalPriceMinor
    };

    onManufacturerProductChange?.(openFamily.id);
    onSelectionChange?.(primaryCandidate);
    onProjectSelectionChange?.(selection);
    setOpenFamilyId(undefined);
  }

  const profile = detail?.guidance?.manufacturer_guidance?.application_profile ?? {};
  const coverage = rangeText(
    profileNumber(profile, "coverage_m2_per_litre_min"),
    profileNumber(profile, "coverage_m2_per_litre_max"),
    " m²/L"
  );
  const coats = rangeText(
    profileNumber(profile, "number_of_coats_min"),
    profileNumber(profile, "number_of_coats_max"),
    " στρώσεις"
  );

  return (
    <section className={styles.chooser} aria-labelledby="build-studio-products">
      <div className={styles.heading}>
        <div>
          <span>VERIFIED PRODUCT FAMILIES</span>
          <h2 id="build-studio-products">{heading}</h2>
          <p>
            Κάθε οικογένεια εμφανίζεται μία φορά. Άνοιξέ την για να διαλέξεις την εμπορική παραλλαγή,
            να δεις τις επαληθευμένες οδηγίες και να υπολογιστούν τα κατάλληλα διαθέσιμα δοχεία.
          </p>
        </div>
      </div>

      {state === "loading" ? (
        <div className={styles.loadingState} role="status">
          <strong>Ελέγχω τις τεχνικά επαληθευμένες οικογένειες προϊόντων…</strong>
          <span>Η ομοιότητα τίτλου από μόνη της δεν αρκεί για να εμφανιστεί προϊόν.</span>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className={styles.familyGrid}>
          {families.map((family) => {
            const representative = family.variants.find((variant) => variant.id === selectedCatalogueId) ?? family.variants[0];
            const packCount = new Set(family.variants.map((variant) => variant.packLitres).filter(Boolean)).size;
            return (
              <article className={styles.familyCard} key={family.id}>
                <div className={styles.familyImage}>
                  <ProductArtwork product={representative} />
                  <span className={styles.verifiedBadge}>✓ VERIFIED</span>
                </div>
                <div className={styles.familyCopy}>
                  <small>{family.brand}</small>
                  <strong>{family.title}</strong>
                  <div className={styles.familyMeta}>
                    <span>Από {money(family.fromPriceMinor)}</span>
                    <span>{packCount || family.variants.length} μεγέθη</span>
                    <span>{family.variants.length} διαθέσιμες επιλογές</span>
                  </div>
                </div>
                <button type="button" className={styles.familyAction} onClick={() => setOpenFamilyId(family.id)}>
                  ΔΕΣ ΛΕΠΤΟΜΕΡΕΙΕΣ & ΥΠΟΛΟΓΙΣΜΟ →
                </button>
              </article>
            );
          })}
        </div>
      ) : null}

      {state === "empty" ? (
        <div className={styles.emptyState}>
          <strong>Δεν υπάρχουν ακόμη τεχνικά επαληθευμένες επιλογές για αυτό το έργο.</strong>
          <span>Το Studio δεν εμφανίζει προϊόν ως κατάλληλο χωρίς επαληθευμένο manufacturer profile και κανόνα καταλληλότητας.</span>
        </div>
      ) : null}

      {state === "degraded" ? (
        <div className={styles.emptyState}>
          <strong>Ο τεχνικός έλεγχος προϊόντων δεν είναι διαθέσιμος αυτή τη στιγμή.</strong>
          <span>Για ασφάλεια δεν εμφανίζονται μη επαληθευμένες εναλλακτικές.</span>
        </div>
      ) : null}

      {selected ? (
        <div className={styles.selectedBar}>
          <div>
            <span>ΕΠΙΛΕΓΜΕΝΟ ΓΙΑ ΤΟ ΕΡΓΟ</span>
            <strong>{selected.manufacturerProductName} · {selected.title}</strong>
          </div>
          <button type="button" onClick={clearSelection}>Αλλαγή</button>
        </div>
      ) : null}

      {openFamily ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Λεπτομέρειες ${openFamily.title}`}>
          <div className={styles.overlayShell}>
            <article className={styles.detailPanel}>
              <header className={styles.detailHeader}>
                <strong>KONTA MOY · PAINT & BUILD · PRODUCT DETAIL</strong>
                <button type="button" className={styles.closeButton} onClick={() => setOpenFamilyId(undefined)} aria-label="Κλείσιμο">×</button>
              </header>

              <div className={styles.detailBody}>
                <aside className={styles.productRail}>
                  <div className={styles.productHero}>
                    <div className={styles.productHeroImage}>
                      <ProductArtwork product={activeVariants[0] ?? openFamily.variants[0]} />
                    </div>
                    <div className={styles.productHeroCopy}>
                      <span className={styles.detailEyebrow}>{openFamily.brand}</span>
                      <h3>{openFamily.title}</h3>
                      <p>{eligibilityLabel(openFamily.variants[0].manufacturerEligibilityStatus)}</p>
                    </div>
                  </div>

                  <div className={styles.quantityCard}>
                    <small>ΤΟ ΕΡΓΟ ΣΟΥ</small>
                    <strong>{areaM2} m²</strong>
                    {quantityEstimate?.status === "available" && quantityEstimate.min != null && quantityEstimate.max != null ? (
                      <>
                        <p>
                          Υπολογισμένη απαίτηση: <b>{quantityEstimate.min === quantityEstimate.max
                            ? `${quantityEstimate.min} L`
                            : `${quantityEstimate.min}–${quantityEstimate.max} L`}</b>
                        </p>
                        {packPlan ? (
                          <div className={styles.packPlan}>
                            <p><b>Προτεινόμενη αγορά:</b> {packPlan.suppliedLitres} L · {money(packPlan.totalPriceMinor)}</p>
                            {packPlan.lines.map((line) => (
                              <div className={styles.packLine} key={line.variantId}>
                                <span>{line.quantity} × {line.packLitres} L</span>
                                <strong>{money(line.linePriceMinor)}</strong>
                              </div>
                            ))}
                            <p>Πλεόνασμα δοχείων: {packPlan.surplusLitres} L. Δεν προστίθεται αυθαίρετος συντελεστής απωλειών στην τεχνική κατανάλωση.</p>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p>
                        Η ακριβής ποσότητα θα εμφανιστεί μόνο όταν υπάρχουν πλήρη επαληθευμένα coverage + coats για το συγκεκριμένο προϊόν.
                      </p>
                    )}
                  </div>
                </aside>

                <div className={styles.detailContent}>
                  <div className={styles.variantSection}>
                    <span>ΠΑΡΑΛΛΑΓΗ / ΒΑΣΗ / ΧΡΩΜΑ</span>
                    <p>Διάλεξε πρώτα την εμπορική παραλλαγή. Τα δοχεία υπολογίζονται μόνο μέσα στην ίδια συμβατή ομάδα.</p>
                    <div className={styles.variantGroups}>
                      {variantGroups.map(([key, variants]) => (
                        <button
                          type="button"
                          key={key}
                          data-active={key === activeGroupKey}
                          onClick={() => {
                            setSelectionGroupKey(key);
                            setManualVariantId(variants[0]?.id);
                          }}
                        >
                          {groupLabel(variants)}
                        </button>
                      ))}
                    </div>
                    <div className={styles.packChoices}>
                      {activeVariants.map((variant) => (
                        <button
                          type="button"
                          key={variant.id}
                          data-active={!packPlan && manualVariant?.id === variant.id}
                          onClick={() => setManualVariantId(variant.id)}
                          disabled={Boolean(packPlan)}
                          title={packPlan ? "Η ποσότητα επιλέγεται αυτόματα από τον υπολογισμό έργου." : undefined}
                        >
                          {variant.packLitres ? `${variant.packLitres} L` : "Παραλλαγή"} · {variant.price}
                        </button>
                      ))}
                    </div>
                  </div>

                  {detailState === "loading" ? (
                    <div className={styles.detailSection}><p>Φορτώνω τις επαληθευμένες οδηγίες VITEX…</p></div>
                  ) : null}
                  {detailState === "error" ? (
                    <div className={styles.errorBox}>Οι επαληθευμένες οδηγίες δεν φορτώθηκαν. Η επιλογή έργου παραμένει κλειδωμένη μέχρι να είναι διαθέσιμες.</div>
                  ) : null}

                  {detailState === "ready" ? (
                    <>
                      <div className={styles.detailSection}>
                        <span>ΓΙΑΤΙ ΤΑΙΡΙΑΖΕΙ</span>
                        <h4>{eligibilityLabel(openFamily.variants[0].manufacturerEligibilityStatus)}</h4>
                        <p>
                          Η οικογένεια πέρασε τον τρέχοντα manufacturer rule για το συγκεκριμένο scenario.
                          {openFamily.variants[0].matchedTerms.length
                            ? ` Εμπορική αντιστοίχιση: ${openFamily.variants[0].matchedTerms.join(", ")}.`
                            : ""}
                        </p>
                        {coverage || coats ? (
                          <p>{coverage ? `Κάλυψη: ${coverage}.` : ""} {coats ? `Στρώσεις: ${coats}.` : ""}</p>
                        ) : null}
                      </div>
                      <DetailList title="Απαιτούμενη προετοιμασία" items={detail?.customerGuide?.preparation ?? []} />
                      <DetailList title="Επαληθευμένες οδηγίες VITEX" items={detail?.customerGuide?.manufacturerInstructions ?? []} />
                      <DetailList title="Χρόνοι στεγνώματος / επαναβαφής" items={detail?.customerGuide?.timings ?? []} />
                      <DetailList title="Απαιτήσεις συστήματος" items={detail?.customerGuide?.whatYouNeed ?? []} />
                      <DetailList title="Προειδοποιήσεις" items={[
                        ...(detail?.customerGuide?.warnings ?? []),
                        ...(detail?.customerGuide?.avoid ?? [])
                      ]} />
                    </>
                  ) : null}
                </div>
              </div>

              <footer className={styles.detailFooter}>
                <div className={styles.detailFooterSummary}>
                  <small>ΕΠΙΛΟΓΗ ΓΙΑ ΤΟ ΕΡΓΟ</small>
                  <strong>
                    {packPlan
                      ? `${packPlan.totalPacks} δοχείο/α · ${packPlan.suppliedLitres} L · ${money(packPlan.totalPriceMinor)}`
                      : manualVariant
                        ? `${manualVariant.title} · ${manualVariant.price}`
                        : "Διάλεξε παραλλαγή"}
                  </strong>
                </div>
                <button
                  type="button"
                  className={styles.chooseProjectButton}
                  disabled={detailState !== "ready" || (!packPlan && !manualVariant)}
                  onClick={chooseForProject}
                >
                  ΕΠΙΛΟΓΗ ΓΙΑ ΤΟ ΕΡΓΟ ΜΟΥ
                </button>
              </footer>
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}
