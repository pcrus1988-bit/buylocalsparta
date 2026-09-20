export type EditorialCollectionSearch = Readonly<{
  category: string;
  query?: string;
  limit: number;
}>;

export type EditorialCollection = Readonly<{
  slug: string;
  eyebrow: string;
  title: string;
  lead: string;
  story: string;
  searches: readonly EditorialCollectionSearch[];
  moments: readonly string[];
  accent: "mountain" | "home" | "gift";
}>;

/**
 * Homepage editorial collections are intentionally tied to catalogue areas that
 * have meaningful live depth. Keep these as real-life missions rather than
 * generic department links; each search targets an actually stocked leaf.
 */
export const EDITORIAL_COLLECTIONS: readonly EditorialCollection[] = [
  {
    slug: "self-care-reset",
    eyebrow: "Λίγος χρόνος για σένα",
    title: "Μια ώρα για σένα",
    lead: "Μια μικρή επανεκκίνηση, χωρίς να ψάχνεις σε δεκάδες κατηγορίες.",
    story: "Ό,τι χρειάζεσαι για μια μικρή στιγμή φροντίδας: καθαρισμός, ενυδάτωση, serum, σώμα και μαλλιά. Διάλεξε εύκολα ανάμεσα σε όσα μπορείς να βρεις τώρα στο ΚΟΝΤΑ ΜΟΥ.",
    searches: [
      { category: "serums-treatments", limit: 3 },
      { category: "face-moisturisers", limit: 2 },
      { category: "facial-cleansers", limit: 2 },
      { category: "bath-body-care", limit: 2 },
      { category: "hair-treatments", limit: 2 },
      { category: "shampoo-conditioner", limit: 1 }
    ],
    moments: ["Καθαρισμός & βάση", "Η φροντίδα που λείπει", "Μαλλιά & σώμα"],
    accent: "mountain"
  },
  {
    slug: "night-out-ready",
    eyebrow: "Απόψε",
    title: "Έξοδος απόψε",
    lead: "Οι τελευταίες λεπτομέρειες πριν κλείσεις την πόρτα.",
    story: "Άρωμα, χείλη, μάτια, νύχια και οι μικρές λεπτομέρειες που ολοκληρώνουν την εμφάνιση. Όλα συγκεντρωμένα εδώ, για να ετοιμαστείς χωρίς ατελείωτο ψάξιμο.",
    searches: [
      { category: "fragrance", limit: 3 },
      { category: "lip-makeup", limit: 2 },
      { category: "eye-makeup", limit: 2 },
      { category: "nail-care-colour", limit: 2 },
      { category: "hair-accessories", limit: 2 },
      { category: "grooming-care", limit: 1 }
    ],
    moments: ["Το άρωμα", "Χρώμα & λεπτομέρεια", "Το τελευταίο touch"],
    accent: "gift"
  },
  {
    slug: "gift-with-scent",
    eyebrow: "Όταν θες μια σίγουρη ιδέα",
    title: "Δώρο χωρίς άγχος",
    lead: "Άρωμα, κερί ή κάτι όμορφο για προσωπική φροντίδα.",
    story: "Αν δεν ξέρεις από πού να αρχίσεις, ξεκίνα εδώ: αρώματα, αρωματικά κεριά και όμορφες επιλογές προσωπικής φροντίδας για ένα δώρο που δείχνει ότι το σκέφτηκες.",
    searches: [
      { category: "fragrance", limit: 5 },
      { category: "candles-home-fragrance", limit: 4 },
      { category: "bath-body-care", limit: 3 }
    ],
    moments: ["Κλασική επιλογή", "Για το σπίτι", "Μικρή προσωπική πολυτέλεια"],
    accent: "home"
  }
] as const;

const LEGACY_COLLECTION_REDIRECTS: Readonly<Record<string, string>> = {
  "taygetos-weekend": "/shop",
  "first-home": "/shop",
  "gifts-with-personality": "/collections/gift-with-scent"
};

export function editorialCollectionBySlug(slug: string): EditorialCollection | undefined {
  return EDITORIAL_COLLECTIONS.find((collection) => collection.slug === slug);
}

export function legacyEditorialCollectionRedirect(slug: string): string | undefined {
  return LEGACY_COLLECTION_REDIRECTS[slug];
}
