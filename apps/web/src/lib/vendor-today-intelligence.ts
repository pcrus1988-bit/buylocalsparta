export type VendorTodayProduct = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  onHand: number;
  reserved: number;
  blocked: number;
  safetyStock: number;
  availableToSell: number;
  updatedAt: number;
}>;

export type VendorTodayFulfilment = Readonly<{
  id: string;
  status: string;
  mode: string;
  createdAt: number;
  lines: ReadonlyArray<Readonly<{ quantity: number }>>;
}>;

export type VendorTodayPriority = Readonly<{
  id: string;
  tone: "critical" | "attention" | "positive" | "neutral";
  title: string;
  detail: string;
  href: string;
  count: number;
}>;

export type VendorTodayIntelligence = Readonly<{
  metrics: Readonly<{
    ordersToday: number;
    orders24h: number;
    unitsToday: number;
    readyPickups: number;
    askLocalOpen: number;
    lowStock: number;
    outOfStock: number;
    staleStock: number;
    stockFreshnessPercent: number;
    slaRequiringAction: number;
    slaBreached: number;
  }>;
  priorities: ReadonlyArray<VendorTodayPriority>;
  lowStockItems: ReadonlyArray<VendorTodayProduct>;
  staleStockItems: ReadonlyArray<VendorTodayProduct>;
}>;

const HOUR_MS = 60 * 60 * 1000;
const STALE_STOCK_MS = 72 * HOUR_MS;
const CLOSED_STATUSES = new Set(["rejected", "cancelled", "failed"]);

function athensDayKey(value: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function lowStockThreshold(product: VendorTodayProduct): number {
  return Math.max(2, Math.ceil(product.safetyStock * 0.5));
}

export function buildVendorTodayIntelligence(input: Readonly<{
  now: number;
  products: ReadonlyArray<VendorTodayProduct>;
  fulfilments: ReadonlyArray<VendorTodayFulfilment>;
  askLocalOpen: number;
  unacknowledgedOrders: number;
  slaRequiringAction: number;
  slaBreached: number;
  slaEscalated: number;
}>): VendorTodayIntelligence {
  const todayKey = athensDayKey(input.now);
  const activeFulfilments = input.fulfilments.filter((item) => !CLOSED_STATUSES.has(item.status));
  const ordersToday = activeFulfilments.filter((item) => athensDayKey(item.createdAt) === todayKey);
  const orders24h = activeFulfilments.filter((item) => item.createdAt >= input.now - 24 * HOUR_MS);
  const readyPickups = activeFulfilments.filter((item) => item.mode === "pickup" && item.status === "ready_for_handover").length;
  const unitsToday = ordersToday.reduce((sum, item) => sum + item.lines.reduce((lineSum, line) => lineSum + Math.max(0, line.quantity), 0), 0);

  const lowStockItems = input.products
    .filter((product) => product.availableToSell <= lowStockThreshold(product))
    .sort((a, b) => a.availableToSell - b.availableToSell || a.updatedAt - b.updatedAt);
  const outOfStock = input.products.filter((product) => product.availableToSell === 0).length;
  const staleStockItems = input.products
    .filter((product) => product.updatedAt < input.now - STALE_STOCK_MS)
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const freshProducts = input.products.length - staleStockItems.length;
  const stockFreshnessPercent = input.products.length === 0 ? 100 : Math.round((freshProducts / input.products.length) * 100);

  const priorities: VendorTodayPriority[] = [];
  if (input.unacknowledgedOrders > 0) priorities.push({
    id: "new-orders",
    tone: "critical",
    title: "Επιβεβαίωσε τις νέες παραγγελίες",
    detail: "Οι νέες παραγγελίες πρέπει να αναγνωριστούν πριν μπουν κανονικά στη ροή προετοιμασίας.",
    href: "/daily/orders?category=new",
    count: input.unacknowledgedOrders
  });
  if (input.slaBreached > 0 || input.slaEscalated > 0) priorities.push({
    id: "sla",
    tone: "critical",
    title: "Υπάρχουν παραγγελίες σε καθυστέρηση",
    detail: `${input.slaBreached} SLA breach · ${input.slaEscalated} escalation`,
    href: "/daily/notifications",
    count: Math.max(input.slaBreached, input.slaEscalated)
  });
  if (readyPickups > 0) priorities.push({
    id: "pickups",
    tone: "positive",
    title: "Έτοιμες παραγγελίες για παραλαβή",
    detail: "Κράτησέ τες εύκολα προσβάσιμες και ολοκλήρωσε την παράδοση μόνο με το σωστό QR/κωδικό.",
    href: "/daily/orders?category=ready",
    count: readyPickups
  });
  if (input.askLocalOpen > 0) priorities.push({
    id: "ask-local",
    tone: "attention",
    title: "Πελάτες περιμένουν απάντηση στο Ask Local",
    detail: "Δες τα ιδιωτικά αιτήματα που έχουν ανατεθεί στο κατάστημά σου.",
    href: "/daily/ask-local",
    count: input.askLocalOpen
  });
  if (outOfStock > 0) priorities.push({
    id: "out-of-stock",
    tone: "attention",
    title: "Προϊόντα χωρίς διαθέσιμο stock",
    detail: "Έλεγξε ποσότητες ώστε η δημόσια διαθεσιμότητα να παραμένει αξιόπιστη.",
    href: "/daily/quickadd",
    count: outOfStock
  });
  if (staleStockItems.length > 0) priorities.push({
    id: "stale-stock",
    tone: "neutral",
    title: "Stock που χρειάζεται φρεσκάρισμα",
    detail: "Οι ποσότητες αυτές δεν έχουν ενημερωθεί τις τελευταίες 72 ώρες.",
    href: "/daily/quickadd",
    count: staleStockItems.length
  });
  if (priorities.length === 0) priorities.push({
    id: "clear",
    tone: "positive",
    title: "Η σημερινή λειτουργία είναι καθαρή",
    detail: "Δεν υπάρχει επείγουσα ενέργεια από παραγγελίες, Ask Local ή stock αυτή τη στιγμή.",
    href: "/daily/orders",
    count: 0
  });

  return {
    metrics: {
      ordersToday: ordersToday.length,
      orders24h: orders24h.length,
      unitsToday,
      readyPickups,
      askLocalOpen: input.askLocalOpen,
      lowStock: lowStockItems.length,
      outOfStock,
      staleStock: staleStockItems.length,
      stockFreshnessPercent,
      slaRequiringAction: input.slaRequiringAction,
      slaBreached: input.slaBreached
    },
    priorities,
    lowStockItems: lowStockItems.slice(0, 3),
    staleStockItems: staleStockItems.slice(0, 3)
  };
}
