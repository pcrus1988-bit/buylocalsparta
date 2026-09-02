"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./CatalogSearchInput.module.css";

type SuggestionKind = "query" | "category" | "leaf" | "brand" | "product";
type SuggestionItem = Readonly<{
  kind: SuggestionKind;
  label: string;
  href: string;
  subtitle?: string;
  count?: number;
  available?: boolean;
}>;
type SuggestionResponse = Readonly<{ items?: readonly SuggestionItem[] }>;

const GROUPS: readonly Readonly<{ kinds: readonly SuggestionKind[]; label: string }>[] = [
  { kinds: ["query"], label: "Προτεινόμενες αναζητήσεις" },
  { kinds: ["category", "leaf"], label: "Κατηγορίες" },
  { kinds: ["brand"], label: "Μάρκες" },
  { kinds: ["product"], label: "Προϊόντα" }
];

const MARKS: Readonly<Record<SuggestionKind, string>> = {
  query: "⌕",
  category: "↗",
  leaf: "›",
  brand: "◇",
  product: "•"
};

export function CatalogSearchInput({ defaultValue = "", placeholder = "Τι ψάχνεις;" }: { defaultValue?: string; placeholder?: string }) {
  const [query, setQuery] = useState(defaultValue);
  const [items, setItems] = useState<readonly SuggestionItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(normalized)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) {
          setItems([]);
          return;
        }
        const payload = await response.json() as SuggestionResponse;
        setItems((payload.items ?? []).slice(0, 12));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const grouped = useMemo(() => GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.kinds.includes(item.kind))
  })).filter((group) => group.items.length > 0), [items]);

  const shouldShow = open && query.trim().length >= 2 && (loading || grouped.length > 0);

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
    {shouldShow ? <div id="catalog-search-discovery" className={styles.panel} aria-label="Προτάσεις αναζήτησης">
      {loading && grouped.length === 0 ? <div className={styles.loading}>Αναζήτηση στην τοπική αγορά…</div> : null}
      {grouped.map((group) => <section className={styles.group} key={group.label}>
        <span className={styles.groupTitle}>{group.label}</span>
        {group.items.map((item) => <a className={styles.item} href={item.href} key={`${item.kind}:${item.href}:${item.label}`}>
          <span className={styles.mark} aria-hidden="true">{MARKS[item.kind]}</span>
          <span className={styles.copy}>
            <span className={styles.label}>{item.label}</span>
            {item.subtitle ? <span className={styles.subtitle}>{item.subtitle}</span> : null}
          </span>
          {item.kind === "product" && item.available !== undefined
            ? <span className={`${styles.meta} ${item.available ? styles.available : styles.unavailable}`}>
                {item.available ? "Διαθέσιμο" : "Μη διαθέσιμο"}
              </span>
            : item.count !== undefined
              ? <span className={styles.meta}>{item.count}</span>
              : null}
        </a>)}
      </section>)}
    </div> : null}
  </div>;
}
