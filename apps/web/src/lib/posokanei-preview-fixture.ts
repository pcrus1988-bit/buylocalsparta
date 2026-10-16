/**
 * ONLY invented labels, prices, and products. No upstream copyrighted dataset.
 * Private admin UX acceptance fixture — never use for public market claims.
 */
export const DEMO_SNAPSHOT_DATE = "2026-10-15";

export type DemoProduct = {
  source_product_id: string;
  snapshot_date: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  unit_quantity: number;
  groupId?: string;
};

export type DemoPrice = {
  source_product_id: string;
  snapshot_date: string;
  country: "GR";
  retailer_id: string;
  retailer_name: string;
  price_eur: number;
  source_price_updated_at: string;
};

export type DemoGroup = {
  id: string;
  status: "approved";
  basis: "kg" | "l" | "piece";
  memberIds: string[];
  label: string;
};

export const DEMO_RETAILERS = [
  { id: "demo-market-a", name: "Demo Market A" },
  { id: "demo-market-b", name: "Demo Market B" },
  { id: "demo-market-c", name: "Demo Market C" }
] as const;

export const DEMO_PRODUCTS: DemoProduct[] = [
  { source_product_id: "demo-tomato-a", snapshot_date: DEMO_SNAPSHOT_DATE, name: "Ντομάτα ψιλοκομμένη 400 g", brand: "Μάρκα Α (demo)", category: "Κονσέρβες", unit: "g", unit_quantity: 400, groupId: "demo-chopped-tomatoes" },
  { source_product_id: "demo-tomato-b", snapshot_date: DEMO_SNAPSHOT_DATE, name: "Ντομάτα ψιλοκομμένη 500 g", brand: "Μάρκα Β (demo)", category: "Κονσέρβες", unit: "g", unit_quantity: 500, groupId: "demo-chopped-tomatoes" },
  { source_product_id: "demo-tomato-c", snapshot_date: DEMO_SNAPSHOT_DATE, name: "Ντομάτα ψιλοκομμένη 400 g", brand: "Μάρκα Γ (demo)", category: "Κονσέρβες", unit: "g", unit_quantity: 400, groupId: "demo-chopped-tomatoes" },
  { source_product_id: "demo-passata", snapshot_date: DEMO_SNAPSHOT_DATE, name: "Χυμός ντομάτας passata 500 g", brand: "Μάρκα Δ (demo)", category: "Κονσέρβες", unit: "g", unit_quantity: 500 },
  { source_product_id: "demo-rice", snapshot_date: DEMO_SNAPSHOT_DATE, name: "Ρύζι 1 kg", brand: "Μάρκα Ε (demo)", category: "Ζυμαρικά & ρύζι", unit: "kg", unit_quantity: 1 },
  { source_product_id: "demo-milk", snapshot_date: DEMO_SNAPSHOT_DATE, name: "Γάλα 1 L", brand: "Μάρκα ΣΤ (demo)", category: "Γαλακτοκομικά", unit: "l", unit_quantity: 1 },
  { source_product_id: "demo-pasta", snapshot_date: DEMO_SNAPSHOT_DATE, name: "Μακαρόνια 500 g", brand: "Μάρκα Ζ (demo)", category: "Ζυμαρικά & ρύζι", unit: "g", unit_quantity: 500 }
];

export const DEMO_GROUPS: DemoGroup[] = [
  { id: "demo-chopped-tomatoes", label: "Ντομάτα ψιλοκομμένη", status: "approved", basis: "kg", memberIds: ["demo-tomato-a", "demo-tomato-b", "demo-tomato-c"] }
];

const observed = "2026-10-15T12:00:00+03:00";
function price(source_product_id: string, retailerIndex: 0 | 1 | 2, price_eur: number): DemoPrice {
  const retailer = DEMO_RETAILERS[retailerIndex];
  return { source_product_id, retailer_id: retailer.id, retailer_name: retailer.name, price_eur, country: "GR", snapshot_date: DEMO_SNAPSHOT_DATE, source_price_updated_at: observed };
}
export const DEMO_PRICES: DemoPrice[] = [
  price("demo-tomato-a",0,1.18),price("demo-tomato-a",1,0.96),price("demo-tomato-a",2,1.10),
  price("demo-tomato-b",0,1.00),price("demo-tomato-b",1,1.12),price("demo-tomato-b",2,0.99),
  price("demo-tomato-c",0,0.88),price("demo-tomato-c",1,1.20),
  price("demo-passata",0,0.55),price("demo-passata",1,0.49),
  price("demo-rice",0,2.40),price("demo-rice",1,1.80),price("demo-rice",2,2.10),
  price("demo-milk",0,1.00),price("demo-milk",1,1.60),price("demo-milk",2,1.25),
  price("demo-pasta",0,0.85),price("demo-pasta",1,0.79),price("demo-pasta",2,0.98)
];
