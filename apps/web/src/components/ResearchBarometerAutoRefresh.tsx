"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Re-fetch the secured server component; do not cache answers in the browser. */
export function ResearchBarometerAutoRefresh() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [enabled, router]);
  return <div className="workspace-action-bar" style={{ gap: 12, flexWrap: "wrap" }}>
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span aria-hidden="true" style={{
        width: 8, height: 8, background: enabled ? "#16a34a" : "#9ca3af", borderRadius: "50%"
      }} />
      <small>{enabled ? "Live · ανανέωση κάθε 60″ όταν είναι ανοικτή η καρτέλα" : "Αυτόματη ανανέωση σε παύση"}</small>
    </span>
    <button className="button button-secondary" type="button" onClick={() => router.refresh()}>Ανανέωση τώρα</button>
    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.currentTarget.checked)} />
      <small>Αυτόματη ανανέωση</small>
    </label>
  </div>;
}
