"use client";

import { useState } from "react";
import styles from "./CatalogSearchInput.module.css";
import { SearchDiscoveryPanel, useSearchDiscovery } from "./SearchDiscovery";

export function CatalogSearchInput({ defaultValue = "", placeholder = "Τι ψάχνεις;" }: { defaultValue?: string; placeholder?: string }) {
  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const { items, loading } = useSearchDiscovery(query, 12);
  const normalizedQuery = query.trim();
  const shouldShow = open && normalizedQuery.length >= 2 && (loading || items.length > 0);

  return <div
    className={styles.root}
    onFocus={() => setOpen(true)}
    onBlur={() => window.setTimeout(() => setOpen(false), 120)}
  >
    <input
      id="q"
      name="q"
      type="search"
      value={query}
      onChange={(event) => {
        setQuery(event.target.value);
        setOpen(true);
      }}
      placeholder={placeholder}
      maxLength={120}
      autoComplete="off"
      className={styles.input}
      aria-expanded={shouldShow}
      aria-controls="catalog-search-discovery"
    />
    <SearchDiscoveryPanel
      id="catalog-search-discovery"
      query={query}
      items={items}
      loading={loading}
      open={open}
      surface="catalog"
    />
  </div>;
}
