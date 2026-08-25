import { readFileSync } from "node:fs";
import { buildVendorTodayIntelligence } from "../apps/web/src/lib/vendor-today-intelligence.ts";

const now = Date.UTC(2026, 7, 25, 8, 0, 0);
const intelligence = buildVendorTodayIntelligence({
  now,
  products: [
    { offerId: "offer_zero", canonicalVariantId: "cv_zero", title: "Zero stock", onHand: 0, reserved: 0, blocked: 0, safetyStock: 1, availableToSell: 0, updatedAt: now - 80 * 60 * 60 * 1000 },
    { offerId: "offer_low", canonicalVariantId: "cv_low", title: "Low stock", onHand: 2, reserved: 0, blocked: 0, safetyStock: 2, availableToSell: 1, updatedAt: now - 2 * 60 * 60 * 1000 },
    { offerId: "offer_fresh", canonicalVariantId: "cv_fresh", title: "Fresh stock", onHand: 12, reserved: 1, blocked: 0, safetyStock: 2, availableToSell: 9, updatedAt: now - 60 * 60 * 1000 }
  ],
  fulfilments: [
    { id: "ful_today", status: "accepted", mode: "local_delivery", createdAt: now - 60 * 60 * 1000, lines: [{ quantity: 2 }, { quantity: 1 }] },
    { id: "ful_ready", status: "ready_for_handover", mode: "pickup", createdAt: now - 2 * 60 * 60 * 1000, lines: [{ quantity: 1 }] },
    { id: "ful_old", status: "accepted", mode: "pickup", createdAt: now - 25 * 60 * 60 * 1000, lines: [{ quantity: 4 }] },
    { id: "ful_cancelled", status: "cancelled", mode: "pickup", createdAt: now - 30 * 60 * 1000, lines: [{ quantity: 5 }] }
  ],
  askLocalOpen: 2,
  unacknowledgedOrders: 1,
  slaRequiringAction: 2,
  slaBreached: 1,
  slaEscalated: 0
});

if (intelligence.metrics.ordersToday !== 2) throw new Error(`Expected two Athens-day orders, got ${intelligence.metrics.ordersToday}`);
if (intelligence.metrics.orders24h !== 2) throw new Error(`Expected two active fulfilments in rolling 24h, got ${intelligence.metrics.orders24h}`);
if (intelligence.metrics.unitsToday !== 4) throw new Error(`Expected four units today, got ${intelligence.metrics.unitsToday}`);
if (intelligence.metrics.readyPickups !== 1) throw new Error("Ready pickup signal is missing");
if (intelligence.metrics.askLocalOpen !== 2) throw new Error("Ask Local signal is missing");
if (intelligence.metrics.outOfStock !== 1 || intelligence.metrics.staleStock !== 1) throw new Error("Stock risk signals are incorrect");
if (intelligence.metrics.stockFreshnessPercent !== 67) throw new Error(`Expected 67% stock freshness, got ${intelligence.metrics.stockFreshnessPercent}`);
if (intelligence.priorities[0]?.id !== "new-orders") throw new Error("Unacknowledged orders must rank first");
if (intelligence.priorities[1]?.id !== "sla") throw new Error("Breached SLA must rank immediately after new-order acknowledgement");
if (!intelligence.priorities.some((item) => item.id === "ask-local")) throw new Error("Ask Local priority is missing");

const source = readFileSync("apps/web/src/lib/vendor-today-intelligence.ts", "utf8");
const client = readFileSync("apps/web/src/components/VendorDailyHomeClient.tsx", "utf8");
const page = readFileSync("apps/web/src/app/daily/page.tsx", "utf8");
if (!source.includes('timeZone: "Europe/Athens"')) throw new Error("Today intelligence must use the Sparta/Athens calendar day");
if (!source.includes("72 * HOUR_MS")) throw new Error("Stock freshness must have an explicit 72-hour boundary");
if (!client.includes("Today · Sparta") || !client.includes("stockFreshnessPercent")) throw new Error("Daily home must expose the Today operating brief and stock freshness");
if (!client.includes("/daily/quickadd") || !client.includes("/daily/ask-local")) throw new Error("Today priorities must lead to existing operational workflows");
if (!page.includes("generatedAt={generatedAt}")) throw new Error("Daily page must provide a stable server-generated intelligence timestamp");
for (const forbidden of ["customerId", "customerEmail", "recipientName", "shipping_address", "phone"]) {
  if (source.includes(forbidden)) throw new Error(`Today intelligence must not project customer-level field ${forbidden}`);
}

console.log("Vendor Today intelligence contracts verified");
