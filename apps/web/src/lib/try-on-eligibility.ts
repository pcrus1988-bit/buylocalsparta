export type TryOnProductIdentity = Readonly<{
  title: string;
  categoryCode?: string;
  departmentCode?: string;
  categoryLabel?: string;
}>;

const EXCLUDED_WEARABLES = /(?:shoe|footwear|sneaker|trainer|boot|sandal|heel|loafer|slipper|bag|backpack|handbag|luggage|jewel|jewelry|jewellery|watch|hat|cap|belt|sunglass|glasses|scarf|glove|sock|bra|underwear|lingerie|swimwear|παπουτσ|υποδημ|μπότ|πέδιλ|σανδάλ|τσάντ|σακίδι|κόσμη|κοσμημ|ρολόι|καπέλ|ζών|γυαλ|κασκόλ|γάντ|κάλτσ)/iu;
const GARMENT_SIGNALS = /(?:clothing|apparel|garment|dress|shirt|t-?shirt|blouse|top|sweater|cardigan|hoodie|jacket|coat|trouser|pants|jeans|skirt|shorts|leggings|blazer|suit|jumpsuit|gown|ρούχ|ένδυ|φόρεμ|μπλούζ|πουκάμισ|παντελ|τζιν|φούστ|σορτς|κολάν|σακάκ|μπουφάν|παλτό|ζακέτ|φούτερ|κοστούμ|ολόσωμ)/iu;

export function isTryOnGarmentCandidate(product: TryOnProductIdentity): boolean {
  const category = [product.categoryCode, product.categoryLabel]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC");
  const title = product.title.normalize("NFKC");
  const department = (product.departmentCode ?? "").normalize("NFKC");

  // Taxonomy is authoritative for unsupported wearable classes. Incidental words
  // such as "φόρεμα με ζώνη" must not hide an otherwise supported garment.
  if (category && EXCLUDED_WEARABLES.test(category)) return false;
  if (category && GARMENT_SIGNALS.test(category)) return true;
  if (GARMENT_SIGNALS.test(title)) return true;
  if (EXCLUDED_WEARABLES.test(title)) return false;
  return GARMENT_SIGNALS.test(department);
}
