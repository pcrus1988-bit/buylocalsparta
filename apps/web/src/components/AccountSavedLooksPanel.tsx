"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./AccountSavedLooksPanel.module.css";

type SavedLookItem = Readonly<{
  id: string;
  title: string;
  price?: string;
  imageSrc?: string;
}>;

type SavedLook = Readonly<{
  id: string;
  name: string;
  source?: "user" | "konta";
  composition: readonly SavedLookItem[];
  createdAt: string;
  updatedAt: string;
}>;

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("el-GR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function imageFor(product: SavedLookItem): string | undefined {
  return product.imageSrc;
}

export function AccountSavedLooksPanel({ csrfToken }: { csrfToken: string }) {
  const [looks, setLooks] = useState<readonly SavedLook[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/style-looks", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { looks?: SavedLook[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Δεν ήταν δυνατή η φόρτωση των looks.");
        setLooks(payload.looks ?? []);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η φόρτωση των looks.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function removeLook(id: string) {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`/api/account/style-looks/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken }
      });
      const payload = await response.json() as { removed?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Δεν ήταν δυνατή η διαγραφή.");
      setLooks((current) => current.filter((look) => look.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Δεν ήταν δυνατή η διαγραφή.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={`shell ${styles.section}`} aria-labelledby="saved-looks-title">
      <div className={styles.heading}>
        <div>
          <div className="eyebrow">Fitting Room</div>
          <h2 id="saved-looks-title">Τα looks μου</h2>
          <p>Οι συνθέσεις που κράτησες από το KONTA MOY Fitting Room. Άνοιξέ τες ξανά και άλλαξε οποιοδήποτε κομμάτι.</p>
        </div>
        <Link className="button" href="/fitting-room">Νέο look</Link>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading ? <div className={styles.empty}>Φόρτωση looks…</div> : null}

      {!loading && looks.length ? (
        <div className={styles.grid}>
          {looks.map((look) => {
            const products = look.composition ?? [];
            return (
              <article className={styles.card} key={look.id}>
                <div className={styles.preview}>
                  {products.slice(0, 4).map((product, index) => {
                    const src = imageFor(product);
                    return <div className={styles.previewCell} key={product.id || index}>
                      {src ? <img src={src} alt="" loading="lazy" /> : <span>{product.title?.slice(0, 1) || "K"}</span>}
                    </div>;
                  })}
                </div>
                <div className={styles.copy}>
                  <small>{dateLabel(look.updatedAt)} · {products.length} κομμάτια</small>
                  <h3>{look.name}</h3>
                  <p>{look.source === "konta" ? "KONTA MOY πρόταση" : "Το δικό σου look"}</p>
                  <div className={styles.actions}>
                    <Link href={`/fitting-room?saved=${encodeURIComponent(look.id)}`}>Άνοιξε το look →</Link>
                    <button type="button" disabled={Boolean(busy)} onClick={() => void removeLook(look.id)}>
                      {busy === look.id ? "Διαγραφή…" : "Διαγραφή"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!loading && !looks.length ? (
        <div className={styles.empty}>
          <strong>Δεν έχεις αποθηκεύσει look ακόμη.</strong>
          <span>Μπες στο fitting room και άφησε τον KONTA MOY Stylist να σου ετοιμάσει τις πρώτες προτάσεις.</span>
          <Link href="/fitting-room">Μπες στο Fitting Room →</Link>
        </div>
      ) : null}
    </section>
  );
}
