export type BazaarSource =
  | "supplier_preloved"
  | "supplier_preowned_defect"
  | "supplier_tester"
  | "supplier_sample"
  | "customer_return"
  | "open_box"
  | "display_stock"
  | "damaged_packaging"
  | "admin_curated";

export function bazaarSourceLabel(source: BazaarSource): string {
  switch (source) {
    case "supplier_preloved": return "Supplier Preloved";
    case "supplier_preowned_defect": return "Supplier Preowned / Defect";
    case "supplier_tester": return "Tester προμηθευτή";
    case "supplier_sample": return "Sample προμηθευτή";
    case "customer_return": return "Επιστροφή πελάτη";
    case "open_box": return "Open box";
    case "display_stock": return "Εκθεσιακό τεμάχιο";
    case "damaged_packaging": return "Φθαρμένη συσκευασία";
    case "admin_curated": return "Επιλογή BAZAAR";
  }
}
