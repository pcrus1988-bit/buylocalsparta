"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SaveSearchButton({ query, availability, category }: { query: string; availability: string; category?: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const session = await fetch("/api/account/session", { cache: "no-store" });
      if (!session.ok) {
        router.push(`/login?next=${encodeURIComponent(`/shop?q=${query}&category=${category ?? ""}`)}`);
        return;
      }
      const account = await session.json() as { csrfToken: string };
      const response = await fetch("/api/account/saved-searches", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": account.csrfToken },
        body: JSON.stringify({ q: query, categoryCode: category || undefined, availability: availability === "available" ? "in_stock" : "any", name: query ? `Αναζήτηση: ${query}` : category ? `Κατηγορία: ${category}` : "Διαθέσιμα τοπικά" })
      });
      if (!response.ok) throw new Error("saved_search_failed");
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return <button className="save-search-button" type="button" onClick={save} disabled={busy || saved}>{saved ? "✓ Η αναζήτηση αποθηκεύτηκε" : busy ? "Αποθήκευση…" : "♡ Αποθήκευση αναζήτησης"}</button>;
}
