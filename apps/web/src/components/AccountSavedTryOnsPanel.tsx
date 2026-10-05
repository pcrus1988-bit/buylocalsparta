"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./AccountSavedTryOnsPanel.module.css";

type SavedTryOn = Readonly<{
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  predictionId: string;
  modelName: string;
  imageUrl: string;
  byteSize: number;
  createdAt: string;
}>;

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function AccountSavedTryOnsPanel({ csrfToken }: { csrfToken: string }) {
  const [items, setItems] = useState<readonly SavedTryOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<readonly string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/try-on/saved", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { tryOns?: SavedTryOn[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Δεν ήταν δυνατή η φόρτωση των Try On looks.");
        setItems(payload.tryOns ?? []);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η φόρτωση των Try On looks.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function remove(id: string) {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`/api/account/try-on/saved/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken },
        cache: "no-store"
      });
      const payload = await response.json() as { removed?: boolean; error?: string };
      if (!response.ok || !payload.removed) throw new Error(payload.error || "Δεν ήταν δυνατή η διαγραφή.");
      setItems((current) => current.filter((item) => item.id !== id));
      setSelected((current) => current.filter((selectedId) => selectedId !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η διαγραφή.");
    } finally {
      setBusy("");
    }
  }

  const selectedItems = selected
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is SavedTryOn => Boolean(item));

  function toggleCompare(id: string) {
    setError("");
    setSelected((current) => {
      if (current.includes(id)) return current.filter((selectedId) => selectedId !== id);
      if (current.length >= 3) {
        setError("Μπορείς να συγκρίνεις έως 3 Try On looks ταυτόχρονα.");
        return current;
      }
      return [...current, id];
    });
  }

  return (
    <section className={`shell ${styles.section}`} aria-labelledby="saved-try-ons-title">
      <div className={styles.heading}>
        <div>
          <div className="eyebrow">Try On Me</div>
          <h2 id="saved-try-ons-title">Οι δοκιμές που κράτησα</h2>
          <p>Μόνο οι προεπισκοπήσεις που αποθήκευσες ρητά μένουν στον λογαριασμό σου για σύγκριση.</p>
        </div>
        <Link className="button button-secondary" href="/shop?category=fashion">Βρες άλλο look</Link>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading ? <div className={styles.empty}>Φόρτωση Try On looks…</div> : null}

      {!loading && selectedItems.length ? (
        <aside className={styles.compareTray} aria-label="Σύγκριση Try On looks">
          <div className={styles.compareHeader}>
            <div>
              <strong>{selectedItems.length === 1 ? "1 look επιλεγμένο" : `${selectedItems.length} looks επιλεγμένα`}</strong>
              <span>{selectedItems.length < 2 ? "Επίλεξε ακόμη ένα για σύγκριση." : "Σύγκρινε τα looks δίπλα-δίπλα πριν αποφασίσεις."}</span>
            </div>
            <button type="button" onClick={() => setSelected([])}>Καθαρισμός</button>
          </div>
          {selectedItems.length >= 2 ? (
            <div className={styles.compareGrid}>
              {selectedItems.map((item) => (
                <article className={styles.compareItem} key={item.id}>
                  <img src={item.imageUrl} alt={`Σύγκριση Try On · ${item.productTitle}`} />
                  <div>
                    <strong>{item.productTitle}</strong>
                    <Link href={`/product/${encodeURIComponent(item.productSlug)}`}>Προϊόν →</Link>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}

      {!loading && items.length ? (
        <div className={styles.grid}>
          {items.map((item) => {
            const isSelected = selected.includes(item.id);
            return (
            <article className={isSelected ? `${styles.card} ${styles.cardSelected}` : styles.card} key={item.id}>
              <Link href={`/product/${encodeURIComponent(item.productSlug)}`} className={styles.imageLink}>
                <img src={item.imageUrl} alt={`Try On Me · ${item.productTitle}`} loading="lazy" />
              </Link>
              <div className={styles.copy}>
                <small>{dateLabel(item.createdAt)}</small>
                <h3>{item.productTitle}</h3>
                <button
                  className={isSelected ? `${styles.compareButton} ${styles.compareButtonSelected}` : styles.compareButton}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleCompare(item.id)}
                >
                  {isSelected ? "✓ Στη σύγκριση" : "+ Σύγκριση"}
                </button>
                <div className={styles.actions}>
                  <Link href={`/product/${encodeURIComponent(item.productSlug)}`}>Άνοιξε το προϊόν →</Link>
                  <button type="button" disabled={Boolean(busy)} onClick={() => void remove(item.id)}>
                    {busy === item.id ? "Διαγραφή…" : "Διαγραφή"}
                  </button>
                </div>
              </div>
            </article>
          );
          })}
        </div>
      ) : null}

      {!loading && !items.length ? (
        <div className={styles.empty}>
          <strong>Δεν έχεις κρατήσει Try On look ακόμη.</strong>
          <span>Σε συμβατά ρούχα, πάτησε το αστέρι στην προεπισκόπηση για να το κρατήσεις εδώ.</span>
        </div>
      ) : null}
    </section>
  );
}
