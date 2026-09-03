"use client";

import { useState } from "react";
import styles from "../app/home-premium.module.css";
import { SearchDiscoveryPanel, useSearchDiscovery } from "./SearchDiscovery";

export function HomeQuickSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const normalizedQuery = query.trim();
  const { items, hasResults, loading, error } = useSearchDiscovery(query, 12);
  const shouldShow = open && normalizedQuery.length >= 2 && (loading || items.length > 0);
  const shopHref = normalizedQuery ? `/shop?q=${encodeURIComponent(normalizedQuery)}` : "/shop";
  const askLocalHref = `/ask-local?need=${encodeURIComponent(normalizedQuery)}&source=${encodeURIComponent("/")}`;

  return (
    <div className={styles.quickSearch}>
      <form
        className={styles.quickSearchForm}
        action="/shop"
        method="get"
        role="search"
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      >
        <label className={styles.srOnly} htmlFor="home-search">Αναζήτηση προϊόντων</label>
        <span className={styles.searchIcon} aria-hidden="true">⌕</span>
        <input
          id="home-search"
          name="q"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder="π.χ. σχολική τσάντα, φωτιστικό, ακουστικά…"
          maxLength={120}
          autoComplete="off"
          aria-expanded={shouldShow}
          aria-controls="home-search-discovery"
        />
        <button type="submit">Αναζήτηση <span aria-hidden="true">→</span></button>
        <SearchDiscoveryPanel
          id="home-search-discovery"
          query={query}
          items={items}
          loading={loading}
          open={open}
          surface="home"
        />
      </form>

      <div className={styles.searchFeedback} aria-live="polite">
        {loading && normalizedQuery.length >= 2 ? <span className={styles.searchStatus}>Ψάχνουμε στην τοπική αγορά…</span> : null}
        {!loading && hasResults === true ? <a className={styles.foundResult} href={shopHref}><span>Υπάρχουν σχετικά προϊόντα.</span><strong>Δες όλα τα αποτελέσματα →</strong></a> : null}
        {!loading && hasResults === false ? (
          <div className={styles.zeroResult}>
            <div><span>0 αποτελέσματα για «{normalizedQuery}»</span><strong>Μην σταματήσεις εδώ — ρώτησε ένα κατάλληλο τοπικό κατάστημα.</strong></div>
            <a href={askLocalHref}>Ask Local <span aria-hidden="true">→</span></a>
          </div>
        ) : null}
        {!loading && error ? <span className={styles.searchStatus}>Πάτησε Αναζήτηση για να δεις τα διαθέσιμα αποτελέσματα.</span> : null}
      </div>
    </div>
  );
}
