"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { VendorVisibilityInteraction, VendorVisibilitySummary } from "../lib/vendor-visibility";

type Payload = Readonly<{ vendorId: string; research: boolean; summary: VendorVisibilitySummary }>;

function track(vendorId: string, event: VendorVisibilityInteraction): void {
  const body = JSON.stringify({ vendorId, event });
  try {
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/analytics/vendor-interaction", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/analytics/vendor-interaction", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true });
  } catch {
    // Analytics never blocks navigation.
  }
}

function classify(anchor: HTMLAnchorElement): VendorVisibilityInteraction | undefined {
  const href = anchor.getAttribute("href") ?? "";
  if (href.startsWith("tel:")) return "phone";
  if (href.startsWith("/shops/map")) return "directions";
  if (href.startsWith("/join")) return "claim";
  if (/^https?:\/\//i.test(href) && (anchor.textContent ?? "").toLocaleLowerCase("el").includes("website")) return "website";
  return undefined;
}

function format(value: number): string {
  return new Intl.NumberFormat("el-GR").format(Math.round(value));
}

export function VendorVisibilityPrompt() {
  const pathname = usePathname();
  const vendorId = useMemo(() => {
    const match = pathname.match(/^\/vendor\/([^/?#]+)/);
    if (!match?.[1]) return undefined;
    try { return decodeURIComponent(match[1]); } catch { return undefined; }
  }, [pathname]);
  const [payload, setPayload] = useState<Payload>();

  useEffect(() => {
    setPayload(undefined);
    if (!vendorId) return;
    const controller = new AbortController();
    void fetch(`/api/analytics/vendor-visibility?vendorId=${encodeURIComponent(vendorId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<Payload> : undefined)
      .then((value) => { if (value) setPayload(value); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    const handler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const interaction = classify(anchor);
      if (interaction) track(vendorId, interaction);
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [vendorId]);

  if (!payload?.research) return null;
  const { summary } = payload;
  const evidence = summary.impressions > 0
    ? `Η επιχείρησή σας εμφανίστηκε ${format(summary.impressions)} φορές στη Google μέσω ΚΟΝΤΑ ΜΟΥ τις τελευταίες 30 ημέρες${summary.clicks > 0 ? ` και έλαβε ${format(summary.clicks)} κλικ` : ""}.`
    : summary.pageViews > 0
      ? `Η σελίδα της επιχείρησής σας προβλήθηκε ${format(summary.pageViews)} φορές στο ΚΟΝΤΑ ΜΟΥ τις τελευταίες 30 ημέρες.`
      : "Η επιχείρησή σας έχει ήδη τη δική της δημόσια σελίδα στο ΚΟΝΤΑ ΜΟΥ.";

  return <aside aria-label="Διεκδίκηση επιχειρηματικής σελίδας" style={{ margin: "0 auto 28px", width: "min(1120px, calc(100% - 32px))", padding: "20px 22px", border: "1px solid rgba(0,0,0,.12)", borderRadius: 20, background: "var(--surface, #fff)", boxShadow: "0 16px 50px rgba(0,0,0,.08)" }}>
    <div className="eyebrow">Για την επιχείρηση</div>
    <strong style={{ display: "block", fontSize: "clamp(1.1rem,2vw,1.35rem)", marginTop: 6 }}>{evidence}</strong>
    <p style={{ margin: "8px 0 16px" }}>Διεκδικήστε τη σελίδα σας, διορθώστε τα στοιχεία της και μετατρέψτε αυτή την προβολή σε πελάτες.</p>
    <a className="button" href={`/join?vendor=${encodeURIComponent(payload.vendorId)}`}>Διεκδικήστε τη σελίδα σας</a>
  </aside>;
}
