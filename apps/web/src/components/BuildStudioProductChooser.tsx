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
  vendorName?: string;
  score: number;
  matchedTerms: readonly string[];
}>;

function ProductArtwork({ product }: { product: BuildStudioCandidate }) {
  const [failed, setFailed] = useState(false);
  if (!product.mediaId || failed) {
    return <span className={styles.fallbackArtwork} aria-hidden="true">{product.title.slice(0, 1).toUpperCase()}</span>;
  }
  return (
    <img
      src={`/api/media/${encodeURIComponent(product.mediaId)}`}
      alt={product.mediaAlt || product.title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function BuildStudioProductChooser({
  terms,
  heading = "Διάλεξε το προϊόν για το έργο σου"
}: {
  terms: readonly string[];
  heading?: string;
}) {
  const [products, setProducts] = useState<readonly BuildStudioCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [state, setState] = useState<"loading" | "ready" | "empty" | "degraded">("loading");

  const queryKey = useMemo(
    () => [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 8).join("|"),
    [terms]
  );

  useEffect(() => {
    if (!queryKey) {
      setProducts([]);
      setSelectedId(undefined);
      setState("empty");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    setSelectedId(undefined);

    const params = new URLSearchParams();
    params.set("term", queryKey);

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
        const next = Array.isArray(payload.products) ? payload.products : [];
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
  }, [queryKey]);

  const selected = products.find((product) => product.id === selectedId);

  return (
    <section className={styles.chooser} aria-labelledby="build-studio-products">
      <div className={styles.heading}>
        <div>
          <span>PROJECT PRODUCT</span>
          <h2 id="build-studio-products">{heading}</h2>
          <p>
            Οι επιλογές μένουν μέσα στο Studio. Διάλεξε αυτή που θέλεις και συνέχισε να χτίζεις το έργο σου.
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
          <strong>Βρίσκω τα διαθέσιμα προϊόντα που ταιριάζουν στο έργο…</strong>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className={styles.grid}>
          {products.map((product, index) => {
            const active = selectedId === product.id;
            return (
              <article className={active ? styles.cardSelected : styles.card} key={product.id}>
                <button
                  type="button"
                  className={styles.selectCard}
                  onClick={() => setSelectedId(product.id)}
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
                      <span>{product.matchedTerms.slice(0, 2).join(" · ") || "Συμβατή κατηγορία"}</span>
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
          <strong>Δεν υπάρχει ακόμη διαθέσιμο live προϊόν για αυτό το ακριβές σύστημα.</strong>
          <p>
            Η τεχνική πρόταση του Studio παραμένει αποθηκευμένη στην οθόνη. Καθώς εμπλουτίζεται ο κατάλογος,
            τα συμβατά προϊόντα θα εμφανίζονται εδώ αυτόματα.
          </p>
        </div>
      ) : null}

      {state === "degraded" ? (
        <div className={styles.emptyState}>
          <strong>Οι διαθέσιμες επιλογές δεν φόρτωσαν αυτή τη στιγμή.</strong>
          <p>Δεν σε στέλνω στο Shop. Μπορείς να παραμείνεις στο έργο και να ξαναδοκιμάσεις.</p>
          <button type="button" onClick={() => window.location.reload()}>Ξαναφόρτωση Studio</button>
        </div>
      ) : null}

      {selected ? (
        <div className={styles.selectionBar}>
          <div>
            <span>ΣΤΟ ΕΡΓΟ ΣΟΥ</span>
            <strong>{selected.title}</strong>
            <small>{selected.price}</small>
          </div>
          <button type="button" onClick={() => setSelectedId(undefined)}>Άλλαξε επιλογή</button>
        </div>
      ) : null}
    </section>
  );
}
