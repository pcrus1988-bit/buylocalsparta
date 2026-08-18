export type PublicVendorSubcategory = Readonly<{
  slug: string;
  label: string;
  sourceName: string;
}>;

export type PublicVendorCategory = Readonly<{
  slug: string;
  label: string;
  sourceName: string;
  description: string;
  aliases: readonly string[];
  subcategories: readonly PublicVendorSubcategory[];
}>;

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function subcategory(sourceName: string, label: string): PublicVendorSubcategory {
  return { slug: slug(sourceName), label, sourceName };
}

export const PUBLIC_VENDOR_CATEGORIES: readonly PublicVendorCategory[] = [
  {
    slug: "agriculture-pets-outdoors",
    label: "Αγροτικά, κατοικίδια & ύπαιθρος",
    sourceName: "Agriculture, pets & outdoors",
    description: "Αγροτικά εφόδια, εξοπλισμός, κατοικίδια και είδη υπαίθρου.",
    aliases: ["agriculture", "agricultural", "pet", "pets", "animal", "outdoor", "hunting", "fishing", "beekeeping"],
    subcategories: [
      subcategory("Agricultural supplies & machinery", "Αγροτικά εφόδια & μηχανήματα"),
      subcategory("Beekeeping supplies", "Μελισσοκομικά είδη"),
      subcategory("Hunting, fishing & outdoor goods", "Κυνήγι, ψάρεμα & είδη υπαίθρου"),
      subcategory("Pet & animal supplies", "Κατοικίδια & ζωοτροφές")
    ]
  },
  {
    slug: "automotive-mobility",
    label: "Αυτοκίνητο & μετακίνηση",
    sourceName: "Automotive & mobility",
    description: "Οχήματα, μοτοσυκλέτες, ποδήλατα, ανταλλακτικά και εξοπλισμός μετακίνησης.",
    aliases: ["automotive", "auto", "car", "vehicle", "motorcycle", "bicycle", "tyre", "tire", "battery"],
    subcategories: [
      subcategory("Parts, batteries, tyres & accessories", "Ανταλλακτικά, μπαταρίες, ελαστικά & αξεσουάρ"),
      subcategory("Vehicles, motorcycles & bicycles", "Οχήματα, μοτοσυκλέτες & ποδήλατα")
    ]
  },
  {
    slug: "beauty-health",
    label: "Ομορφιά & υγεία",
    sourceName: "Beauty & health retail",
    description: "Καλλυντικά, αρώματα, φαρμακεία και εξειδικευμένα είδη υγείας.",
    aliases: ["beauty", "cosmetic", "cosmetics", "perfumery", "fragrance", "pharmacy", "health", "medical", "orthopaedic", "hearing", "personal-care"],
    subcategories: [
      subcategory("Cosmetics & perfumery", "Καλλυντικά & αρωματοποιία"),
      subcategory("Orthopaedic, medical & hearing goods", "Ορθοπεδικά, ιατρικά & ακουστικά είδη"),
      subcategory("Pharmacies", "Φαρμακεία"),
      subcategory("Beauty & personal care", "Ομορφιά & προσωπική φροντίδα")
    ]
  },
  {
    slug: "books-toys-culture",
    label: "Βιβλία, παιχνίδια & πολιτισμός",
    sourceName: "Books, toys & culture",
    description: "Βιβλία, χαρτικά, παιχνίδια, δώρα, hobby και πολιτιστικά είδη.",
    aliases: ["book", "books", "stationery", "toy", "toys", "hobby", "hobbies", "game", "games", "gift", "gifts", "culture", "publishing", "collectible"],
    subcategories: [
      subcategory("Books, stationery & office supplies", "Βιβλία, χαρτικά & είδη γραφείου"),
      subcategory("Gifts, souvenirs & seasonal", "Δώρα, αναμνηστικά & εποχικά"),
      subcategory("Music, photo & collectibles", "Μουσική, φωτογραφία & συλλεκτικά"),
      subcategory("Toys, hobbies & games", "Παιχνίδια, hobby & games"),
      subcategory("Books & publishing", "Βιβλία & εκδόσεις"),
      subcategory("Books, courses & digital products", "Βιβλία, μαθήματα & ψηφιακά προϊόντα"),
      subcategory("Gifts & home accessories", "Δώρα & αξεσουάρ σπιτιού"),
      subcategory("Toys, gifts & children's goods", "Παιχνίδια, δώρα & παιδικά είδη")
    ]
  },
  {
    slug: "diy-building-trade",
    label: "Μαστορέματα, οικοδομή & επαγγελματικά",
    sourceName: "DIY, building & trade",
    description: "Οικοδομικά υλικά, εργαλεία, χρώματα, υδραυλικά και επαγγελματικός εξοπλισμός.",
    aliases: ["diy", "building", "hardware", "tool", "tools", "paint", "plumbing", "sanitary", "timber", "tile", "tiles", "bathroom"],
    subcategories: [
      subcategory("Building materials & timber", "Οικοδομικά υλικά & ξυλεία"),
      subcategory("Doors, windows, aluminium & railings", "Πόρτες, παράθυρα, αλουμίνια & κάγκελα"),
      subcategory("Hardware, tools & paint", "Σιδηρικά, εργαλεία & χρώματα"),
      subcategory("Sanitary, plumbing & glazing goods", "Είδη υγιεινής, υδραυλικά & υαλοπίνακες"),
      subcategory("Tiles, bathroom & building materials", "Πλακάκια, μπάνιο & οικοδομικά υλικά")
    ]
  },
  {
    slug: "fashion-accessories",
    label: "Μόδα & αξεσουάρ",
    sourceName: "Fashion & personal accessories",
    description: "Ρούχα, παπούτσια, τσάντες, κοσμήματα, οπτικά και αθλητικά είδη.",
    aliases: ["fashion", "clothing", "apparel", "shoe", "shoes", "footwear", "accessory", "accessories", "bag", "bags", "jewellery", "jewelry", "watch", "watches", "optical", "sportswear", "bridal"],
    subcategories: [
      subcategory("Adult clothing", "Ενήλικη ένδυση"),
      subcategory("Bags, accessories & leather goods", "Τσάντες, αξεσουάρ & δερμάτινα"),
      subcategory("Children's & baby clothing", "Παιδική & βρεφική ένδυση"),
      subcategory("Footwear", "Υποδήματα"),
      subcategory("Jewellery & watches", "Κοσμήματα & ρολόγια"),
      subcategory("Optical retail", "Οπτικά"),
      subcategory("Sportswear & sporting goods", "Αθλητική ένδυση & αθλητικά είδη"),
      subcategory("Underwear & hosiery", "Εσώρουχα & καλσόν"),
      subcategory("Fashion & accessories", "Μόδα & αξεσουάρ"),
      subcategory("Jewellery & accessories", "Κοσμήματα & αξεσουάρ"),
      subcategory("Shoes & leather goods", "Παπούτσια & δερμάτινα")
    ]
  },
  {
    slug: "home-furniture-garden",
    label: "Σπίτι, έπιπλο & κήπος",
    sourceName: "Home, furniture & garden",
    description: "Έπιπλα, κουζίνες, λευκά είδη, διακόσμηση, θέρμανση και κήπος.",
    aliases: ["home", "furniture", "kitchen", "garden", "homeware", "household", "lighting", "decor", "decoration", "textile", "linen", "curtain", "carpet", "mattress", "heating", "fireplace"],
    subcategories: [
      subcategory("Beds & mattresses", "Κρεβάτια & στρώματα"),
      subcategory("Flowers, plants & garden", "Λουλούδια, φυτά & κήπος"),
      subcategory("Furniture & kitchens", "Έπιπλα & κουζίνες"),
      subcategory("Heating, cooling & fireplaces", "Θέρμανση, ψύξη & τζάκια"),
      subcategory("Homeware & household goods", "Οικιακά & είδη νοικοκυριού"),
      subcategory("Lighting & décor", "Φωτισμός & διακόσμηση"),
      subcategory("Textiles, linen, curtains & carpets", "Υφάσματα, λευκά είδη, κουρτίνες & χαλιά"),
      subcategory("Home, hardware & household", "Σπίτι, είδη οικιακής χρήσης & hardware"),
      subcategory("Lighting & electrical", "Φωτισμός & ηλεκτρολογικά")
    ]
  },
  {
    slug: "specialist-retail",
    label: "Εξειδικευμένο λιανεμπόριο",
    sourceName: "Specialist retail",
    description: "Εξειδικευμένες επιχειρήσεις με ιδιαίτερο εμπορικό αντικείμενο.",
    aliases: ["specialist", "ceremonial", "religious", "packaging", "shop-equipment", "office-equipment", "tobacco", "smoking"],
    subcategories: [
      subcategory("Packaging, shop & office equipment", "Συσκευασία, εξοπλισμός καταστήματος & γραφείου"),
      subcategory("Religious & ceremonial goods", "Θρησκευτικά & τελετουργικά είδη"),
      subcategory("Tobacco & smoking goods", "Καπνικά & είδη καπνιστή")
    ]
  },
  {
    slug: "technology-appliances",
    label: "Τεχνολογία & συσκευές",
    sourceName: "Technology & appliances",
    description: "Υπολογιστές, κινητά, ηλεκτρονικά, ηλεκτρικές συσκευές και επαγγελματικά συστήματα.",
    aliases: ["technology", "tech", "computer", "computers", "peripheral", "mobile", "telecom", "electronics", "electrical", "appliance", "appliances", "security", "office", "printing"],
    subcategories: [
      subcategory("Computers & peripherals", "Υπολογιστές & περιφερειακά"),
      subcategory("Electrical appliances", "Ηλεκτρικές συσκευές"),
      subcategory("Electrical, security & business equipment", "Ηλεκτρολογικός, security & επαγγελματικός εξοπλισμός"),
      subcategory("Mobile, telecom & electronics", "Κινητά, τηλεπικοινωνίες & ηλεκτρονικά"),
      subcategory("Office, printing & technology", "Γραφείο, εκτυπώσεις & τεχνολογία")
    ]
  }
] as const;

const BY_SOURCE = new Map(PUBLIC_VENDOR_CATEGORIES.map((category) => [category.sourceName.toLowerCase(), category]));
const BY_SLUG = new Map(PUBLIC_VENDOR_CATEGORIES.map((category) => [category.slug, category]));
const SUBCATEGORY_INDEX = new Map(
  PUBLIC_VENDOR_CATEGORIES.flatMap((category) => category.subcategories.map((sub) => [sub.sourceName.toLowerCase(), { category, sub }] as const))
);

export type PublicVendorTaxonomy = Readonly<{
  categorySlug: string;
  categoryLabel: string;
  categorySourceName: string;
  subcategorySlug?: string;
  subcategoryLabel?: string;
  subcategorySourceName?: string;
}>;

function taxonomy(category: PublicVendorCategory, sub?: PublicVendorSubcategory): PublicVendorTaxonomy {
  return {
    categorySlug: category.slug,
    categoryLabel: category.label,
    categorySourceName: category.sourceName,
    subcategorySlug: sub?.slug,
    subcategoryLabel: sub?.label,
    subcategorySourceName: sub?.sourceName
  };
}

export function publicVendorCategoryBySlug(categorySlug: string): PublicVendorCategory | undefined {
  return BY_SLUG.get(categorySlug.trim().toLowerCase());
}

export function publicVendorTaxonomyForResearch(majorBranch?: string, subBranch?: string): PublicVendorTaxonomy | undefined {
  const major = majorBranch?.trim().toLowerCase();
  const sub = subBranch?.trim().toLowerCase();
  const directCategory = major ? BY_SOURCE.get(major) : undefined;
  if (directCategory) {
    const directSub = sub ? directCategory.subcategories.find((entry) => entry.sourceName.toLowerCase() === sub) : undefined;
    return taxonomy(directCategory, directSub);
  }
  if (sub) {
    const indexed = SUBCATEGORY_INDEX.get(sub);
    if (indexed) return taxonomy(indexed.category, indexed.sub);
  }
  return undefined;
}

export function publicVendorTaxonomiesForCatalogCodes(categoryCodes: readonly string[]): readonly PublicVendorTaxonomy[] {
  const normalized = categoryCodes.map((code) => code.trim().toLowerCase().replaceAll("_", "-")).filter(Boolean);
  const matches = PUBLIC_VENDOR_CATEGORIES.filter((category) => category.aliases.some((alias) => normalized.some((code) => code === alias || code.startsWith(`${alias}-`) || code.includes(alias))));
  return matches.map((category) => taxonomy(category));
}

export function publicVendorTaxonomies(input: Readonly<{ majorBranch?: string; subBranch?: string; categoryCodes?: readonly string[] }>): readonly PublicVendorTaxonomy[] {
  const research = publicVendorTaxonomyForResearch(input.majorBranch, input.subBranch);
  if (research) return [research];
  const catalog = publicVendorTaxonomiesForCatalogCodes(input.categoryCodes ?? []);
  return catalog.length ? catalog : [];
}
