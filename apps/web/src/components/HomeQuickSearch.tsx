"use client";

import { useEffect, useState } from "react";
import styles from "../app/home-premium.module.css";

type SearchState = "idle" | "loading" | "found" | "empty" | "error";
type SearchSignal = Readonly<{ hasResults?: boolean | null }>;

export function HomeQuickSearch() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setState("idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(normalizedQuery)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error("Search signal unavailable");
        const payload = await response.json() as SearchSignal;
        if (typeof payload.hasResults !== "boolean") {
          setState("idle");
          return;
        }
        setState(payload.hasResults ? "found" : "empty");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState("error");
      }
    }, 260);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedQuery]);

  const shopHref = normalizedQuery ? `/shop?q=${encodeURIComponent(normalizedQuery)}` : "/shop";
  const askLocalHref = `/ask-local?need=${encodeURIComponent(normalizedQuery)}&source=${encodeURIComponent("/")}`;

  return (
    <div className={styles.quickSearch}>
      <form className={styles.quickSearchForm} action="/shop" method="get" role="search">
        <label className={styles.srOnly} htmlFor="home-search">Αναζήτηση προϊόντων</label>
        <span className={styles.searchIcon} aria-hidden="true">⌕</span>
        <input
          id="home-search"
          name="q"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="π.χ. σχολική τσάντα, φωτιστικό, ακουστικά…"
          maxLength={120}
          autoComplete="off"
        />
        <button type="submit">Αναζήτηση <span aria-hidden="true">→</span></button>
      </form>

      <div className={styles.searchFeedback} aria-live="polite">
        {state === "loading" ? <span className={styles.searchStatus}>Ψάχνουμε στην τοπική αγορά…</span> : null}
        {state === "found" ? <a className={styles.foundResult} href={shopHref}><span>Υπάρχουν σχετικά προϊόντα.</span><strong>Δες αποτελέσματα →</strong></a> : null}
        {state === "empty" ? (
          <div className={styles.zeroResult}>
            <div><span>0 αποτελέσματα για «{normalizedQuery}»</span><strong>Μην σταματήσεις εδώ — ρώτησε ένα κατάλληλο τοπικό κατάστημα.</strong></div>
            <a href={askLocalHref}>Ask Local <span aria-hidden="true">→</span></a>
          </div>
        ) : null}
        {state === "error" ? <span className={styles.searchStatus}>Πάτησε Αναζήτηση για να δεις τα διαθέσιμα αποτελέσματα.</span> : null}
      </div>
    </div>
  );
}
