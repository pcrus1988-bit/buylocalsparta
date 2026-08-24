export type StorefrontCategory = Readonly<{
  slug: string;
  label: string;
  name: string;
  mark: string;
  symbol: string;
  eyebrow: string;
  description: string;
  searchHint: string;
  artClass: string;
  aliases: readonly string[];
}>;

export const STOREFRONT_CATEGORIES: readonly StorefrontCategory[] = [
  {
    slug: "home-living",
    label: "Για το σπίτι",
    name: "Home & Living",
    mark: "01",
    symbol: "⌂",
    eyebrow: "Σπίτι · φωτισμός · διακόσμηση",
    description: "Αντικείμενα που κάνουν το σπίτι πιο λειτουργικό, πιο όμορφο και πιο προσωπικό — με συμβουλή από ανθρώπους της τοπικής αγοράς.",
    searchHint: "φωτισμός, διακόσμηση, κουζίνα, λευκά είδη",
    artClass: "art-home",
    aliases: ["home", "home-living", "home-lighting", "lighting", "furniture", "decor", "decoration", "housewares", "kitchen", "drinkware", "bottle", "thermos", "food-storage"]
  },
  {
    slug: "fashion",
    label: "Μόδα & αξεσουάρ",
    name: "Fashion",
    mark: "02",
    symbol: "◇",
    eyebrow: "Μόδα · παπούτσι · αξεσουάρ",
    description: "Τοπική επιλογή μόδας χωρίς απρόσωπη σύγκριση καταστημάτων. Βρες το προϊόν και, όταν χρειάζεται, μίλα με άνθρωπο που γνωρίζει εφαρμογή και στυλ.",
    searchHint: "ρούχα, παπούτσια, τσάντες, κοσμήματα",
    artClass: "art-fashion",
    aliases: ["fashion", "clothing", "apparel", "shoes", "footwear", "accessories", "jewellery", "jewelry", "bridal"]
  },
  {
    slug: "beauty",
    label: "Ομορφιά & φροντίδα",
    name: "Beauty",
    mark: "03",
    symbol: "✦",
    eyebrow: "Ομορφιά · περιποίηση · ευεξία",
    description: "Προϊόντα προσωπικής φροντίδας με έμφαση στην ανθρώπινη καθοδήγηση και στη σωστή επιλογή, όχι μόνο στην τιμή.",
    searchHint: "καλλυντικά, περιποίηση, μαλλιά, άρωμα",
    artClass: "art-beauty",
    aliases: ["beauty", "cosmetics", "personal-care", "hair", "fragrance", "wellness"]
  },
  {
    slug: "kids",
    label: "Παιδί & παιχνίδι",
    name: "Kids",
    mark: "04",
    symbol: "△",
    eyebrow: "Παιδί · παιχνίδι · δημιουργία",
    description: "Παιχνίδια, δημιουργικές ιδέες και δώρα για παιδιά, με τη δυνατότητα να ζητήσεις πραγματική πρόταση από τοπικό κατάστημα.",
    searchHint: "παιχνίδια, παιδικά, hobby, δημιουργικά δώρα",
    artClass: "art-kids",
    aliases: ["kids", "kid", "children", "toys", "toy", "baby", "hobbies", "games"]
  },
  {
    slug: "tools-diy",
    label: "Εργαλεία & DIY",
    name: "Tools & DIY",
    mark: "05",
    symbol: "⌁",
    eyebrow: "Εργαλεία · κατασκευές · επισκευές",
    description: "Εργαλεία, εξοπλισμός εργαστηρίου και λύσεις για κατασκευές ή επισκευές, με τοπική διαθεσιμότητα και συμβουλή για τη σωστή επιλογή.",
    searchHint: "εργαλεία, δράπανα, αναλώσιμα, είδη ασφαλείας",
    artClass: "art-tools",
    aliases: ["diy", "building", "construction", "hardware", "power-tools", "hand-tools", "tool", "tools", "paint", "sanitary", "plumbing", "welding", "safety", "door", "window", "measuring", "fastener", "compressor", "generator"]
  },
  {
    slug: "garden-outdoors",
    label: "Κήπος & ύπαιθρος",
    name: "Garden & Outdoors",
    mark: "06",
    symbol: "⌇",
    eyebrow: "Κήπος · γεωργία · εξωτερικός χώρος",
    description: "Εξοπλισμός κήπου, γεωργικά εργαλεία και είδη υπαίθρου από την τοπική αγορά της Σπάρτης, με χρήσιμα στοιχεία συμβατότητας και εφαρμογής.",
    searchHint: "κήπος, γεωργικά, camping, εξοπλισμός υπαίθρου",
    artClass: "art-outdoors",
    aliases: ["agriculture", "agricultural", "garden", "outdoor", "camping", "hunting", "fishing", "pet", "animal", "beekeeping", "forestry", "lawn", "irrigation", "pool", "barbecue"]
  },
  {
    slug: "automotive",
    label: "Αυτοκίνηση",
    name: "Automotive",
    mark: "07",
    symbol: "◉",
    eyebrow: "Αυτοκίνητο · μοτοσυκλέτα · μετακίνηση",
    description: "Αξεσουάρ, εργαλεία, αναλώσιμα και εξοπλισμός αυτοκίνησης με έμφαση στη συμβατότητα και στην καθοδήγηση από τοπικό κατάστημα.",
    searchHint: "αυτοκίνητο, μπαταρίες, αξεσουάρ, εργαλεία οχήματος",
    artClass: "art-automotive",
    aliases: ["automotive", "vehicle", "car", "motor", "motorcycle", "bicycle", "cycling", "tyre", "wheel"]
  },
  {
    slug: "technology",
    label: "Τεχνολογία",
    name: "Technology",
    mark: "08",
    symbol: "◎",
    eyebrow: "Τεχνολογία · ήχος · συσκευές",
    description: "Τεχνολογία με τοπική υποστήριξη. Ρώτησε για συμβατότητα, εγκατάσταση ή τη σωστή επιλογή πριν ολοκληρώσεις την αγορά.",
    searchHint: "κινητά, ήχος, υπολογιστές, αξεσουάρ",
    artClass: "art-technology",
    aliases: ["technology", "tech", "electronics", "electrical", "computers", "mobile", "audio"]
  },
  {
    slug: "gifts",
    label: "Δώρα & ιδιαίτερα",
    name: "Gifts & Finds",
    mark: "09",
    symbol: "✺",
    eyebrow: "Δώρα · βιβλίο · χαρτικά · ιδιαίτερα",
    description: "Ιδέες που αξίζει να ανακαλύψεις τοπικά — από χαρτικά και βιβλία μέχρι μικρά ιδιαίτερα δώρα και αντικείμενα με χαρακτήρα.",
    searchHint: "δώρα, βιβλία, χαρτικά, ιδιαίτερα αντικείμενα",
    artClass: "art-gifts",
    aliases: ["gifts", "gift", "stationery", "books", "book", "school", "office", "culture", "specialist", "packaging", "religious", "other"]
  }
];

const FALLBACK_CATEGORY: StorefrontCategory = {
  slug: "local-finds",
  label: "Τοπικές επιλογές",
  name: "Local Finds",
  mark: "BLS",
  symbol: "•",
  eyebrow: "Local selection",
  description: "Επιλεγμένα προϊόντα από την τοπική αγορά της Σπάρτης.",
  searchHint: "τοπικές επιλογές",
  artClass: "art-local",
  aliases: []
};

export function storefrontCategoryBySlug(slug: string): StorefrontCategory | undefined {
  const normalized = normalize(slug);
  return STOREFRONT_CATEGORIES.find((category) => category.slug === normalized);
}

export function storefrontCategoryForCode(categoryCode?: string, departmentCode?: string): StorefrontCategory {
  if (!categoryCode?.trim() && !departmentCode?.trim()) return FALLBACK_CATEGORY;
  return STOREFRONT_CATEGORIES.find((category) => categoryCodeMatches(categoryCode, category.slug, departmentCode)) ?? FALLBACK_CATEGORY;
}

export function categoryCodeMatches(
  categoryCode: string | undefined,
  categorySlugOrCode: string | undefined,
  departmentCode?: string
): boolean {
  const code = normalize(categoryCode ?? "");
  const department = normalize(departmentCode ?? "");
  const requested = normalize(categorySlugOrCode ?? "");
  if (!requested) return true;
  if (!code && !department) return false;
  const category = storefrontCategoryBySlug(requested);
  const candidates = [code, department].filter(Boolean);
  if (!category) return candidates.some((candidate) => candidate === requested || candidate.startsWith(`${requested}-`));
  return category.aliases.some((alias) => candidates.some((candidate) => candidate === alias || candidate.startsWith(`${alias}-`)));
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "-");
}
