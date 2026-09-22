"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./BuildStudioProductChooser.module.css";

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
  manufacturerEligibilityStatus:
    | "eligible"
    | "eligible_with_preparation"
    | "requires_specific_primer"
    | "requires_system_component";
  manufacturerRuleKey: string;
  technicalVerificationStatus: "verified";
}>;

function ProductArtwork({ product }: { product: BuildStudioCandidate }) {
  const sources = [
    product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : undefined,
    product.imageUrl
  ].filter((value): value is string => Boolean(value));
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex];

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

export function BuildStudioProductChooser({
  terms,
  scenarioKey,
  facts = {},
  heading = "Επαληθευμένες επιλογές προϊόντος",
  selectedCatalogueId,
  onManufacturerProductChange,
  onSelectionChange
}: {
  terms: readonly string[];
  scenarioKey: string;
  facts?: Readonly<Record<string, unknown>>;
  heading?: string;
  selectedCatalogueId?: string;
  onManufacturerProductChange?: (manufacturerProductId: string | undefined) => void;
  onSelectionChange?: (candidate: BuildStudioCandidate | undefined) => void;
}) {
  const [products, setProducts] = useState<readonly BuildStudioCandidate[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "degraded">("loading");

  const queryKey = useMemo(
    () => [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 8).join("|"),
    [terms]
  );
  const factsJson = useMemo(() => JSON.stringify(facts), [facts]);

  useEffect(() => {
    onManufacturerProductChange?.(undefined);
    onSelectionChange?.(undefined);
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
        return response.json() as Promise<{
          products?: BuildStudioCandidate[];
          degraded?: boolean;
          technicalVerificationRequired?: boolean;
        }>;
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
  }, [factsJson, onManufacturerProductChange, onSelectionChange, queryKey, scenarioKey]);

  const selected = products.find((product) => product.id === selectedCatalogueId);

  function select(product: BuildStudioCandidate) {
    onManufacturerProductChange?.(product.manufacturerProductId);
    onSelectionChange?.(product);
  }

  function clearSelection() {
    onManufacturerProductChange?.(undefined);
    onSelectionChange?.(undefined);
  }

  return (
    <section className={styles.chooser} aria-labelledby="build-studio-products">
      <div className={styles.heading}>
        <div>
          <span>VERIFIED PROJECT PRODUCT</span>
          <h2 id="build-studio-products">{heading}</h2>
          <p>
            Εμφανίζονται μόνο προϊόντα που έχουν συνδεθεί με το συγκεκριμένο έργο μέσω επαληθευμένων
            οδηγιών κατασκευαστή. Η ομοιότητα τίτλου ή κατηγορίας από μόνη της δεν θεωρείται συμβατότητα.
          </p>
        </div>
        {selected ? (
          <div className={styles.selectedBadge}>
            <span>ΕΠΙΛΕΓΜΕΝΟ</span>
            <strong>{selected.brand || selected.categoryLabel || "KONTA MOY"}</strong>
          </div>
        ) : null}
      </div>

      {state === "loading" ? (
        <div className={styles.loadingState} role="status">
          <i />
          <strong>Ελέγχω διαθέσιμα προϊόντα με τεχνικά επαληθευμένη καταλληλότητα…</strong>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className={styles.grid}>
          {products.map((product, index) => {
            const active = selectedCatalogueId === product.id;
            return (
              <article className={active ? styles.cardSelected : styles.card} key={product.id}>
                <button
                  type="button"
                  className={styles.selectCard}
                  onClick={() => select(product)}
                  aria-pressed={active}
                >
                  <div className={styles.imageStage}>
                    <ProductArtwork product={product} />
                    <span className={styles.rank}>#{String(index + 1).padStart(2, "0")}</span>
                    {active ? <b>ΕΠΙΛΕΧΘΗΚΕ</b> : <b>ΕΠΙΛΟΓΗ</b>}
                  </div>
                  <div className={styles.copy}>
                    <small>{product.brand || product.categoryLabel || "KONTA MOY"}</small>
                    <strong>{product.title}</strong>
                    <div className={styles.meta}>
                      <span>{eligibilityLabel(product.manufacturerEligibilityStatus)}</span>
                      <em>{product.price}</em>
                    </div>
                  </div>
                </button>
                <a className={styles.detailLink} href={product.url}>Δες λεπτομέρειες ↗</a>
              </article>
            );
          })}
        </div>
      ) : null}

      {state === "empty" ? (
        <div className={styles.emptyState}>
          <strong>Δεν υπάρχουν ακόμη τεχνικά επαληθευμένες επιλογές προϊόντος για αυτό το έργο.</strong>
          <p>
            Το Studio δεν θα παρουσιάσει ένα προϊόν ως κατάλληλο μόνο επειδή ταιριάζει σε λέξεις-κλειδιά.
            Οι επιλογές θα εμφανιστούν όταν υπάρχει επαληθευμένο manufacturer profile, ακριβής σύνδεση
            με το προϊόν του καταλόγου και τεκμηριωμένος κανόνας καταλληλότητας για αυτό το σενάριο.
          </p>
        </div>
      ) : null}

      {state === "degraded" ? (
        <div className={styles.emptyState}>
          <strong>Ο τεχνικός έλεγχος των διαθέσιμων προϊόντων δεν είναι διαθέσιμος αυτή τη στιγμή.</strong>
          <p>Για ασφάλεια δεν εμφανίζουμε μη επαληθευμένες εναλλακτικές ως συμβατές.</p>
          <button type="button" onClick={() => window.location.reload()}>Ξαναφόρτωση Studio</button>
        </div>
      ) : null}

      {selected ? (
        <div className={styles.selectionBar}>
          <div>
            <span>ΣΤΟ ΕΡΓΟ ΣΟΥ · ΕΠΑΛΗΘΕΥΜΕΝΟ</span>
            <strong>{selected.title}</strong>
            <small>{selected.price}</small>
          </div>
          <button type="button" onClick={clearSelection}>Άλλαξε επιλογή</button>
        </div>
      ) : null}
    </section>
  );
}
