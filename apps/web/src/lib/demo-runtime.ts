import { CommerceService, DevPaymentProvider, FairVendorExposureEngine, InventoryEngine, money, type SellableVariant, type SupplierOffer } from "@buy-local-sparta/core";

export const vendors = [
  { id: "demo-vendor-a", name: "Demo Sparta Tech", adviser: "Nikos" },
  { id: "demo-vendor-b", name: "Demo Lakonia Living", adviser: "Eleni" },
  { id: "demo-vendor-c", name: "Demo Paper House", adviser: "Maria" }
] as const;

export const variants: SellableVariant[] = [
  { id: "airpods", marketId: "sparta", title: "Apple AirPods Pro 2 USB‑C", platformPrice: money(12900), taxRateBps: 2400, categoryCode: "technology" },
  { id: "lamp", marketId: "sparta", title: "Brass Reading Lamp", platformPrice: money(5900), taxRateBps: 2400, categoryCode: "home-lighting" },
  { id: "notebook", marketId: "sparta", title: "Premium A5 Notebook", platformPrice: money(1490), taxRateBps: 2400, categoryCode: "stationery" }
];

function offer(offerId: string, vendorId: string, canonicalVariantId: string, cost: number): SupplierOffer {
  return {
    offerId, vendorId, locationId: `loc-${vendorId}`, canonicalVariantId, marketId: "sparta",
    approved: true, vendorActive: true, locationActive: true, productAllowed: true,
    availableToSell: 0, stockFresh: true, canServe: true, costWithinCeiling: true, capacityOpen: true,
    capacityWeight: 1, fulfilmentMode: "pickup", fulfilmentFit: 0, stockConfirmedAt: Date.now(), supplierUnitPrice: money(cost)
  };
}

export const offers: Record<string, SupplierOffer[]> = {
  airpods: [offer("air-a","demo-vendor-a","airpods",9600), offer("air-b","demo-vendor-b","airpods",9750), offer("air-c","demo-vendor-c","airpods",9650)],
  lamp: [offer("lamp-b","demo-vendor-b","lamp",3700)],
  notebook: [offer("note-c","demo-vendor-c","notebook",780)]
};

const globalKey = "__buyLocalSpartaDemoRuntime" as const;
type DemoRuntime = ReturnType<typeof createRuntime>;
const globals = globalThis as typeof globalThis & { [globalKey]?: DemoRuntime };

function createRuntime() {
  const inventory = new InventoryEngine();
  const fairness = new FairVendorExposureEngine();
  const payments = new DevPaymentProvider();
  const commerce = new CommerceService(inventory, fairness, payments);
  for (const variant of variants) {
    for (const item of offers[variant.id]) inventory.seed({ offerId:item.offerId, onHand:10, activeReservations:0, safetyStock:1, blocked:0, updatedAt:Date.now() });
    commerce.registerVariant(variant, offers[variant.id]);
  }
  return { inventory, fairness, payments, commerce };
}

export const runtime = globals[globalKey] ?? (globals[globalKey] = createRuntime());
