"use client";

import { useState } from "react";

export function CheckoutDemo() {
  const [output, setOutput] = useState("The first interactive slice uses real domain logic and fictional demo merchants.");
  const [busy, setBusy] = useState(false);
  async function createOrder() {
    setBusy(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkoutKey: crypto.randomUUID(), visitorKey: "web-demo", postcode: "23100", fulfilmentMode: "pickup",
          items: [{ canonicalVariantId: "airpods", quantity: 1 }, { canonicalVariantId: "notebook", quantity: 1 }]
        })
      });
      setOutput(JSON.stringify(await response.json(), null, 2));
    } finally { setBusy(false); }
  }
  return <><button className="button" onClick={createOrder} disabled={busy}>{busy ? "Creating…" : "Create working two-vendor test order"}</button><pre className="result" aria-live="polite">{output}</pre></>;
}
