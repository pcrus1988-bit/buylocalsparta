"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type SessionPayload = { csrfToken?: string; savedProducts?: readonly { canonicalVariantId: string }[] };

export function ProductAccountActions({ productId }: { productId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [csrfToken, setCsrfToken] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/account/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as SessionPayload;
      if (!active) return;
      setCsrfToken(data.csrfToken);
      setSaved(Boolean(data.savedProducts?.some((item) => item.canonicalVariantId === productId)));
      if (data.csrfToken) {
        void fetch("/api/account/recent-view", { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": data.csrfToken }, body: JSON.stringify({ canonicalVariantId: productId }) });
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [productId]);

  async function toggle() {
    if (!csrfToken) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/account/saved-products/${encodeURIComponent(productId)}`, { method: saved ? "DELETE" : "POST", headers: { "x-csrf-token": csrfToken } });
      if (!response.ok) throw new Error("save_failed");
      setSaved(!saved);
    } finally {
      setBusy(false);
    }
  }

  return <button className="button button-secondary save-product-button" type="button" onClick={toggle} disabled={busy} aria-pressed={saved}>{busy ? "…" : saved ? "♥ Αποθηκευμένο" : "♡ Αποθήκευση"}</button>;
}
