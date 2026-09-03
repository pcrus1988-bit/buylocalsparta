"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./SearchDiscovery.module.css";

export type SearchDiscoveryKind = "query" | "category" | "leaf" | "brand" | "product";
export type SearchDiscoveryItem = Readonly<{
  kind: SearchDiscoveryKind;
  label: string;
  href: string;
  subtitle?: string;
  count?: number;
  available?: boolean;
}>;

type SearchDiscoveryResponse = Readonly<{
  items?: readonly SearchDiscoveryItem[];
  hasResults?: boolean | null;
}>;

type SearchDiscoveryState = Readonly<{
  items: readonly SearchDiscoveryItem[];
  hasResults: boolean | null;
  loading: boolean;
  error: boolean;
}>;

type SearchDiscoveryPanelProps = Readonly<{
  id: string;
  query: string;
  items: readonly SearchDiscoveryItem[];
  loading: boolean;
  open: boolean;
  placement?: "below" | "above";
  surface?: "catalog" | "home" | "mobile";
  onNavigate?: () => void;
}>;

const GROUPS: readonly Readonly<{ kinds: readonly SearchDiscoveryKind[]; label: string }>[] = [
  { kinds: ["query"], label: "Προτεινόμενες αναζητήσεις" },
  { kinds: ["category", "leaf"], label: "Κατηγορίες" },
  { kinds: ["brand"], label: "Μάρκες" },
  { kinds: ["product"], label: "Προϊόντα" }
];

const MARKS: Readonly<Record<SearchDiscoveryKind, string>> = {
  query: "⌕",
  category: "↗",
  leaf: "›",
  brand: "◇",
  product: "•"
};

export function useSearchDiscovery(query: string, limit = 12): SearchDiscoveryState {
  const [items, setItems] = useState<readonly SearchDiscoveryItem[]>([]);
  const [hasResults, setHasResults] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const normalized = query.trim();

  useEffect(() => {
    if (normalized.length < 2) {
      setItems([]);
      setHasResults(null);
      setLoading(false);
      setError(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(false);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(normalized)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error("Search discovery unavailable");
        const payload = await response.json() as SearchDiscoveryResponse;
        setItems(dedupeSuggestions(payload.items ?? []).slice(0, Math.max(4, Math.min(20, limit))));
        setHasResults(typeof payload.hasResults === "boolean" ? payload.hasResults : null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setItems([]);
        setHasResults(null);
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [limit, normalized]);

  return { items, hasResults, loading, error };
}

export function SearchDiscoveryPanel({
  id,
  query,
  items,
  loading,
  open,
  placement = "below",
  surface = "catalog",
  onNavigate
}: SearchDiscoveryPanelProps) {
  const grouped = useMemo(() => GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.kinds.includes(item.kind))
  })).filter((group) => group.items.length > 0), [items]);

  if (!open || query.trim().length < 2 || (!loading && grouped.length === 0)) return null;

  const panelClass = [styles.panel, placement === "above" ? styles.above : styles.below, styles[surface]].filter(Boolean).join(" ");

  return <div id={id} className={panelClass} aria-label="Προτάσεις αναζήτησης">
    {loading && grouped.length === 0 ? <div className={styles.loading}>Αναζήτηση στην τοπική αγορά…</div> : null}
    {grouped.map((group) => <section className={styles.group} key={group.label}>
      <span className={styles.groupTitle}>{group.label}</span>
      {group.items.map((item) => <a
        className={styles.item}
        href={item.href}
        key={`${item.kind}:${item.href}:${item.label}`}
        onClick={onNavigate}
      >
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
  </div>;
}

function dedupeSuggestions(items: readonly SearchDiscoveryItem[]): readonly SearchDiscoveryItem[] {
  const seenDestinations = new Set<string>();
  const seenLabelsByKind = new Set<string>();
  return items.filter((item) => {
    const label = normalizeLabel(item.label);
    const destination = `${item.kind}:${item.href}`;
    const labelKey = `${item.kind}:${label}`;
    if (seenDestinations.has(destination) || seenLabelsByKind.has(labelKey)) return false;
    seenDestinations.add(destination);
    seenLabelsByKind.add(labelKey);
    return true;
  });
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
