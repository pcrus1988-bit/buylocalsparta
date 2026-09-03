import { normalizeSearchText, searchTextVariants } from "@buy-local-sparta/core";

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
  queryAliases: readonly string[];
}>;

export type StorefrontFacetKey = "subcategory" | "brand" | "color" | "size" | "fit";

export type StorefrontLeafIntent = Readonly<{
  key: string;
  categorySlug: string;
  label: string;
  aliases: readonly string[];
  preferredFacets: readonly StorefrontFacetKey[];
  attributeHints: readonly string[];
}>;

export type StorefrontTaxonomyIntent = Readonly<{
  category: StorefrontCategory;
  leaf?: StorefrontLeafIntent;
}>;

export type StorefrontSubcategoryOption = Readonly<{ value: string; label: string }>;

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
    aliases: ["home", "home-living", "home-lighting", "lighting", "furniture", "decor", "decoration", "housewares", "kitchen", "drinkware", "bottle", "thermos", "food-storage"],
    queryAliases: ["lamp", "lamps", "lighting", "φωτιστικό", "φωτιστικά", "φωτισμός", "fotistiko", "fotistika", "fwtistiko", "fwtistika", "decor", "decoration", "διακόσμηση", "diakosmisi", "furniture", "έπιπλα", "epipla", "kitchen", "κουζίνα", "kouzina", "housewares", "thermos"]
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
    aliases: ["fashion", "clothing", "apparel", "shoes", "footwear", "accessories", "jewellery", "jewelry", "bridal"],
    queryAliases: ["fashion", "μόδα", "clothing", "clothes", "ρούχα", "rouxa", "shoe", "shoes", "παπούτσι", "παπούτσια", "papoutsi", "papoutsia", "sneaker", "sneakers", "dress", "dresses", "φόρεμα", "φορέματα", "forema", "foremata", "bag", "bags", "τσάντα", "τσάντες", "tsanta", "tsantes", "school bag", "school bags", "school backpack", "school backpacks", "σχολική τσάντα", "σχολικές τσάντες", "sxoliki tsanta", "sxolikes tsantes", "scholiki tsanta", "scholikes tsantes", "jewelry", "jewellery", "κοσμήματα", "kosmimata"]
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
    aliases: ["beauty", "cosmetics", "personal-care", "hair", "fragrance", "wellness"],
    queryAliases: ["beauty", "ομορφιά", "cosmetic", "cosmetics", "καλλυντικά", "kallyntika", "kallintika", "skincare", "περιποίηση", "peripoiisi", "haircare", "μαλλιά", "mallia", "shampoo", "fragrance", "perfume", "άρωμα", "aroma"]
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
    aliases: ["kids", "kid", "children", "toys", "toy", "baby", "hobbies", "games"],
    queryAliases: ["kid", "kids", "child", "children", "παιδί", "παιδιά", "paidi", "paidia", "toy", "toys", "παιχνίδι", "παιχνίδια", "paixnidi", "paixnidia", "baby", "βρέφος", "vrefos", "game", "games", "hobby"]
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
    aliases: ["diy", "building", "construction", "hardware", "power-tools", "hand-tools", "tool", "tools", "paint", "sanitary", "plumbing", "welding", "safety", "door", "window", "measuring", "fastener", "compressor", "generator"],
    queryAliases: ["diy", "tool", "tools", "εργαλείο", "εργαλεία", "ergaleio", "ergaleia", "drill", "drills", "δράπανο", "δράπανα", "drapano", "drapana", "screwdriver", "κατσαβίδι", "katsavidi", "hardware", "welding", "compressor", "generator", "fastener", "paint", "plumbing"]
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
    aliases: ["agriculture", "agricultural", "garden", "outdoor", "camping", "hunting", "fishing", "pet", "animal", "beekeeping", "forestry", "lawn", "irrigation", "pool", "barbecue"],
    queryAliases: ["garden", "κήπος", "kipos", "outdoor", "outdoors", "camping", "agriculture", "agricultural", "γεωργικά", "georgika", "hunting", "fishing", "beekeeping", "irrigation", "barbecue", "lawn", "pool"]
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
    aliases: ["automotive", "vehicle", "car", "motor", "motorcycle", "bicycle", "cycling", "tyre", "wheel"],
    queryAliases: ["automotive", "vehicle", "car", "cars", "αυτοκίνητο", "αυτοκίνητα", "aftokinito", "aftokinita", "motorcycle", "μοτοσυκλέτα", "motosykleta", "tyre", "tyres", "tire", "tires", "wheel", "wheels", "cycling", "bicycle"]
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
    aliases: ["technology", "tech", "electronics", "electrical", "computers", "mobile", "audio"],
    queryAliases: ["technology", "τεχνολογία", "tech", "electronics", "smartphone", "smartphones", "mobile", "mobiles", "κινητό", "κινητά", "kinito", "kinita", "computer", "computers", "υπολογιστής", "υπολογιστές", "ypologistis", "ypologistes", "laptop", "laptops", "tablet", "tablets", "headphones", "ακουστικά", "akoustika", "television", "televisions", "tv", "tvs", "τηλεόραση", "τηλεοράσεις", "tileorasi", "tileoraseis", "printer", "εκτυπωτής", "ektipotis"]
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
    aliases: ["gifts", "gift", "stationery", "books", "book", "school", "office", "culture", "specialist", "packaging", "religious", "other"],
    queryAliases: ["gift", "gifts", "δώρο", "δώρα", "doro", "dora", "book", "books", "βιβλίο", "βιβλία", "vivlio", "vivlia", "stationery", "χαρτικά", "chartika", "school supplies", "school stationery", "σχολικά είδη", "sxolika eidi", "scholika eidi", "office", "packaging"]
  }
];

export const STOREFRONT_LEAF_INTENTS: readonly StorefrontLeafIntent[] = [
  { key: "lighting", categorySlug: "home-living", label: "Φωτισμός", aliases: ["lighting", "light", "lights", "lamp", "lamps", "φωτισμός", "φωτιστικό", "φωτιστικά", "fotismos", "fotistiko", "fotistika", "fwtistiko", "fwtistika"], preferredFacets: ["subcategory", "brand", "color"], attributeHints: ["τύπος φωτιστικού", "ντουί", "ισχύς", "LED", "dimmable", "εσωτερικού/εξωτερικού", "υλικό", "θερμοκρασία χρώματος"] },
  { key: "kitchen", categorySlug: "home-living", label: "Κουζίνα", aliases: ["kitchen", "κουζίνα", "kouzina", "cookware", "housewares"], preferredFacets: ["subcategory", "brand", "color", "size"], attributeHints: ["υλικό", "χωρητικότητα", "διαστάσεις"] },
  { key: "furniture", categorySlug: "home-living", label: "Έπιπλα", aliases: ["furniture", "έπιπλο", "έπιπλα", "epiplo", "epipla"], preferredFacets: ["subcategory", "brand", "color", "size"], attributeHints: ["υλικό", "διαστάσεις", "χώρος χρήσης"] },
  { key: "shoes", categorySlug: "fashion", label: "Παπούτσια", aliases: ["shoe", "shoes", "footwear", "sneaker", "sneakers", "παπούτσι", "παπούτσια", "papoutsi", "papoutsia"], preferredFacets: ["subcategory", "size", "brand", "color", "fit"], attributeHints: ["μέγεθος", "εφαρμογή", "υλικό", "φύλο/ηλικία"] },
  { key: "school-bags", categorySlug: "fashion", label: "Σχολικές τσάντες", aliases: ["school bag", "school bags", "school backpack", "school backpacks", "σχολική τσάντα", "σχολικές τσάντες", "sxoliki tsanta", "sxolikes tsantes", "scholiki tsanta", "scholikes tsantes"], preferredFacets: ["subcategory", "brand", "color", "size"], attributeHints: ["τύπος τσάντας", "ηλικιακή ομάδα", "φύλο", "υλικό", "χωρητικότητα", "διαστάσεις"] },
  { key: "bags", categorySlug: "fashion", label: "Τσάντες", aliases: ["bag", "bags", "τσάντα", "τσάντες", "tsanta", "tsantes", "backpack", "sakidio"], preferredFacets: ["subcategory", "brand", "color", "size"], attributeHints: ["τύπος", "υλικό", "χωρητικότητα", "διαστάσεις"] },
  { key: "dresses", categorySlug: "fashion", label: "Φορέματα", aliases: ["dress", "dresses", "φόρεμα", "φορέματα", "forema", "foremata"], preferredFacets: ["subcategory", "size", "brand", "color", "fit"], attributeHints: ["μέγεθος", "εφαρμογή", "σύνθεση"] },
  { key: "skincare", categorySlug: "beauty", label: "Περιποίηση προσώπου", aliases: ["skincare", "skin care", "περιποίηση", "peripoiisi"], preferredFacets: ["subcategory", "brand"], attributeHints: ["τύπος δέρματος", "δραστικά συστατικά", "όγκος"] },
  { key: "haircare", categorySlug: "beauty", label: "Περιποίηση μαλλιών", aliases: ["haircare", "hair care", "shampoo", "μαλλιά", "mallia"], preferredFacets: ["subcategory", "brand"], attributeHints: ["τύπος μαλλιών", "δράση", "όγκος"] },
  { key: "fragrance", categorySlug: "beauty", label: "Αρώματα", aliases: ["fragrance", "perfume", "άρωμα", "αρώματα", "aroma", "aromata"], preferredFacets: ["subcategory", "brand"], attributeHints: ["συγκέντρωση", "όγκος", "οικογένεια αρώματος"] },
  { key: "toys", categorySlug: "kids", label: "Παιχνίδια", aliases: ["toy", "toys", "παιχνίδι", "παιχνίδια", "paixnidi", "paixnidia", "game", "games"], preferredFacets: ["subcategory", "brand"], attributeHints: ["ηλικία", "τύπος παιχνιδιού", "αριθμός παικτών"] },
  { key: "baby", categorySlug: "kids", label: "Βρεφικά", aliases: ["baby", "infant", "βρέφος", "βρεφικά", "vrefos", "vrefika"], preferredFacets: ["subcategory", "brand", "size"], attributeHints: ["ηλικία", "μέγεθος", "υλικό"] },
  { key: "drills", categorySlug: "tools-diy", label: "Δράπανα", aliases: ["drill", "drills", "δράπανο", "δράπανα", "drapano", "drapana"], preferredFacets: ["subcategory", "brand"], attributeHints: ["ισχύς", "τάση", "τύπος τσοκ", "κρούση", "στροφές"] },
  { key: "screwdrivers", categorySlug: "tools-diy", label: "Κατσαβίδια", aliases: ["screwdriver", "screwdrivers", "κατσαβίδι", "κατσαβίδια", "katsavidi", "katsavidia"], preferredFacets: ["subcategory", "brand"], attributeHints: ["τύπος μύτης", "μέγεθος", "μονωμένο"] },
  { key: "garden-tools", categorySlug: "garden-outdoors", label: "Εργαλεία κήπου", aliases: ["garden tool", "garden tools", "εργαλείο κήπου", "εργαλεία κήπου", "ergaleia kipou"], preferredFacets: ["subcategory", "brand"], attributeHints: ["τύπος", "ισχύς", "πλάτος εργασίας"] },
  { key: "camping", categorySlug: "garden-outdoors", label: "Camping", aliases: ["camping", "κάμπινγκ", "kampink"], preferredFacets: ["subcategory", "brand", "size"], attributeHints: ["χωρητικότητα", "βάρος", "διαστάσεις"] },
  { key: "tyres", categorySlug: "automotive", label: "Ελαστικά", aliases: ["tyre", "tyres", "tire", "tires", "ελαστικό", "ελαστικά", "elastiko", "elastika"], preferredFacets: ["subcategory", "brand", "size"], attributeHints: ["διάσταση", "δείκτης φορτίου", "δείκτης ταχύτητας", "εποχή"] },
  { key: "car-accessories", categorySlug: "automotive", label: "Αξεσουάρ αυτοκινήτου", aliases: ["car accessory", "car accessories", "αξεσουάρ αυτοκινήτου", "aksesouar aftokinitou"], preferredFacets: ["subcategory", "brand", "color"], attributeHints: ["συμβατότητα", "μοντέλο οχήματος"] },
  { key: "smartphones", categorySlug: "technology", label: "Smartphones", aliases: ["smartphone", "smartphones", "mobile", "mobiles", "κινητό", "κινητά", "kinito", "kinita"], preferredFacets: ["subcategory", "brand", "color", "size"], attributeHints: ["αποθήκευση", "RAM", "οθόνη", "5G", "dual SIM"] },
  { key: "laptops", categorySlug: "technology", label: "Laptops", aliases: ["laptop", "laptops", "notebook", "notebooks", "φορητός υπολογιστής", "foritos ypologistis"], preferredFacets: ["subcategory", "brand", "size"], attributeHints: ["επεξεργαστής", "RAM", "αποθήκευση", "μέγεθος οθόνης"] },
  { key: "headphones", categorySlug: "technology", label: "Ακουστικά", aliases: ["headphone", "headphones", "earphone", "earphones", "earbuds", "ακουστικό", "ακουστικά", "akoustiko", "akoustika"], preferredFacets: ["subcategory", "brand", "color"], attributeHints: ["σύνδεση", "ANC", "μικρόφωνο", "αυτονομία"] },
  { key: "televisions", categorySlug: "technology", label: "Τηλεοράσεις", aliases: ["television", "televisions", "tv", "tvs", "τηλεόραση", "τηλεοράσεις", "tileorasi", "tileoraseis"], preferredFacets: ["subcategory", "brand", "size"], attributeHints: ["ίντσες", "ανάλυση", "τεχνολογία panel", "smart TV"] },
  { key: "printers", categorySlug: "technology", label: "Εκτυπωτές", aliases: ["printer", "printers", "εκτυπωτής", "εκτυπωτές", "ektipotis", "ektipotes"], preferredFacets: ["subcategory", "brand"], attributeHints: ["τεχνολογία εκτύπωσης", "χρώμα", "duplex", "συνδεσιμότητα"] },
  { key: "books", categorySlug: "gifts", label: "Βιβλία", aliases: ["book", "books", "βιβλίο", "βιβλία", "vivlio", "vivlia"], preferredFacets: ["subcategory"], attributeHints: ["συγγραφέας", "εκδότης", "ISBN", "γλώσσα"] },
  { key: "stationery", categorySlug: "gifts", label: "Χαρτικά", aliases: ["stationery", "χαρτικά", "chartika", "school supplies", "school stationery", "σχολικά είδη", "sxolika eidi", "scholika eidi"], preferredFacets: ["subcategory", "brand", "color"], attributeHints: ["τύπος", "μέγεθος", "χρώμα"] }
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
  aliases: [],
  queryAliases: []
};

export function storefrontCategoryBySlug(slug: string): StorefrontCategory | undefined {
  const normalized = normalize(slug);
  return STOREFRONT_CATEGORIES.find((category) => category.slug === normalized);
}

export function storefrontCategoryForCode(categoryCode?: string, departmentCode?: string): StorefrontCategory {
  if (!categoryCode?.trim() && !departmentCode?.trim()) return FALLBACK_CATEGORY;
  return STOREFRONT_CATEGORIES.find((category) => categoryCodeMatches(categoryCode, category.slug, departmentCode)) ?? FALLBACK_CATEGORY;
}

/**
 * Conservatively infer a primary storefront department from natural-language
 * product intent. Query aliases are deliberately separate from governed category
 * code aliases so user vocabulary can never change canonical taxonomy matching.
 * If two departments tie, no category is inferred and normal cross-catalog search
 * remains in control rather than risking an incorrect hard filter.
 */
export function inferStorefrontCategoryFromQuery(query: string): StorefrontCategory | undefined {
  const result = uniqueBestByAliases(query, STOREFRONT_CATEGORIES.map((category) => ({ value: category, aliases: category.queryAliases })));
  return result?.value;
}

export function inferStorefrontTaxonomyIntent(query: string): StorefrontTaxonomyIntent | undefined {
  const category = inferStorefrontCategoryFromQuery(query);
  if (!category) return undefined;
  const leaf = uniqueBestByAliases(
    query,
    STOREFRONT_LEAF_INTENTS
      .filter((candidate) => candidate.categorySlug === category.slug)
      .map((candidate) => ({ value: candidate, aliases: candidate.aliases }))
  )?.value;
  return { category, leaf };
}

/**
 * A leaf vocabulary is an interpretation hint, never canonical taxonomy. Resolve it
 * only against subcategories that are currently exposed by the public catalogue. If
 * multiple branches tie, leave the search broad instead of hard-filtering.
 */
export function resolveStorefrontSubcategoryIntent(
  leaf: StorefrontLeafIntent | undefined,
  options: readonly StorefrontSubcategoryOption[]
): StorefrontSubcategoryOption | undefined {
  if (!leaf || options.length === 0) return undefined;
  const aliases = [...new Set(leaf.aliases.flatMap(searchTextVariants).filter(Boolean))];
  let best: StorefrontSubcategoryOption | undefined;
  let bestScore = 0;
  let tied = false;
  for (const option of options) {
    const candidateVariants = searchTextVariants(`${option.value} ${option.label}`);
    let score = 0;
    for (const candidate of candidateVariants) {
      for (const alias of aliases) {
        if (!alias) continue;
        if (candidate === alias) score = Math.max(score, 6);
        else if (` ${candidate} `.includes(` ${alias} `)) score = Math.max(score, alias.includes(" ") ? 5 : 4);
        else if (alias.length >= 4 && candidate.includes(alias)) score = Math.max(score, 2);
      }
    }
    if (score > bestScore) {
      best = option;
      bestScore = score;
      tied = false;
    } else if (score > 0 && score === bestScore) {
      tied = true;
    }
  }
  return bestScore > 0 && !tied ? best : undefined;
}

export function storefrontFacetEnabled(leaf: StorefrontLeafIntent | undefined, facet: StorefrontFacetKey): boolean {
  return !leaf || leaf.preferredFacets.includes(facet);
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

function uniqueBestByAliases<T>(
  query: string,
  candidates: readonly Readonly<{ value: T; aliases: readonly string[] }>[]
): Readonly<{ value: T; score: number }> | undefined {
  const queryVariants = searchTextVariants(query);
  if (!queryVariants.length) return undefined;
  let best: T | undefined;
  let bestScore = 0;
  let tied = false;
  for (const candidate of candidates) {
    let score = 0;
    const aliasVariants = new Set(candidate.aliases.flatMap(searchTextVariants).filter(Boolean));
    for (const queryVariant of queryVariants) {
      const queryTokens = new Set(queryVariant.split(" ").filter(Boolean));
      for (const alias of aliasVariants) {
        if (alias.includes(" ")) {
          if (alias === queryVariant) score += 10;
          else if (` ${queryVariant} `.includes(` ${alias} `)) score += alias.split(" ").length + 2;
        } else if (queryTokens.has(alias)) {
          score += 3;
        } else if (alias.length >= 5) {
          for (const token of queryTokens) {
            if (token.length >= 4 && (alias.startsWith(token) || token.startsWith(alias))) score += 1;
          }
        }
      }
    }
    if (score > bestScore) {
      best = candidate.value;
      bestScore = score;
      tied = false;
    } else if (score > 0 && score === bestScore) {
      tied = true;
    }
  }
  return best !== undefined && bestScore > 0 && !tied ? { value: best, score: bestScore } : undefined;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "-");
}