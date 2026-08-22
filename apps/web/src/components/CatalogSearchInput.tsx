"use client";

import { useEffect, useState } from "react";

type SuggestionResponse = Readonly<{ suggestions?: readonly string[] }>;

export function CatalogSearchInput({ defaultValue = "", placeholder = "Τι ψάχνεις;" }: { defaultValue?: string; placeholder?: string }) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(normalized)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        if (!response.ok) return setSuggestions([]);
        const payload = await response.json() as SuggestionResponse;
        setSuggestions((payload.suggestions ?? []).slice(0, 8));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return <>
    <input
      id="q"
      name="q"
      type="search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder={placeholder}
      list="catalog-search-suggestions"
      maxLength={120}
      autoComplete="off"
    />
    <datalist id="catalog-search-suggestions">
      {suggestions.map((suggestion) => <option value={suggestion} key={suggestion} />)}
    </datalist>
  </>;
}
