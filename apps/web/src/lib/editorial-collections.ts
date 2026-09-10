export type EditorialCollection = Readonly<{
  slug: string;
  eyebrow: string;
  title: string;
  lead: string;
  story: string;
  primaryCategory: string;
  query: string;
  fallbackCategories: readonly string[];
  moments: readonly string[];
  accent: "mountain" | "home" | "gift";
}>;

export const EDITORIAL_COLLECTIONS: readonly EditorialCollection[] = [
  {
    slug: "taygetos-weekend",
    eyebrow: "Απόδραση · Σπάρτη",
    title: "Σαββατοκύριακο στον Ταΰγετο",
    lead: "Μια μικρή απόδραση ξεκινά πριν φύγεις από την πόλη.",
    story: "Εξοπλισμός υπαίθρου, πρακτικά εργαλεία και μικρές επιλογές που κάνουν τη διαδρομή πιο άνετη — από πραγματικά τοπικά καταστήματα και με άνθρωπο διαθέσιμο να σε βοηθήσει όταν η επιλογή θέλει γνώση.",
    primaryCategory: "garden-outdoors",
    query: "camping outdoor",
    fallbackCategories: ["garden-outdoors", "tools-diy"],
    moments: ["Για τη διαδρομή", "Για τη στάση", "Για ό,τι δεν θέλεις να ξεχάσεις"],
    accent: "mountain"
  },
  {
    slug: "first-home",
    eyebrow: "Νέα αρχή",
    title: "Το πρώτο σου σπίτι",
    lead: "Δεν χρειάζεσαι τα πάντα. Χρειάζεσαι πρώτα τα σωστά.",
    story: "Από τα βασικά της καθημερινότητας μέχρι εκείνες τις λεπτομέρειες που κάνουν έναν χώρο δικό σου. Η συλλογή συνδυάζει σπίτι και χρήσιμα εργαλεία χωρίς να σε στέλνει σε δέκα διαφορετικά e-shops.",
    primaryCategory: "home-living",
    query: "σπίτι",
    fallbackCategories: ["home-living", "tools-diy", "technology"],
    moments: ["Τα απολύτως βασικά", "Μικρές αναβαθμίσεις", "Για να το κάνεις δικό σου"],
    accent: "home"
  },
  {
    slug: "gifts-with-personality",
    eyebrow: "Για κάποιον δικό σου",
    title: "Δώρα με προσωπικότητα",
    lead: "Καλό δώρο δεν είναι το πιο ακριβό. Είναι αυτό που μοιάζει να το διάλεξες πραγματικά.",
    story: "Ιδέες από διαφορετικές πλευρές της τοπικής αγοράς της Σπάρτης — για παιδί, φίλο, σύντροφο ή οικογένεια. Αν δεν είσαι σίγουρος, μπορείς να ρωτήσεις το κατάστημα πριν αποφασίσεις.",
    primaryCategory: "gifts",
    query: "δώρο",
    fallbackCategories: ["gifts", "kids", "fashion", "beauty"],
    moments: ["Μικρή κίνηση", "Κάτι πιο προσωπικό", "Όταν θέλεις βοήθεια να διαλέξεις"],
    accent: "gift"
  }
] as const;

export function editorialCollectionBySlug(slug: string): EditorialCollection | undefined {
  return EDITORIAL_COLLECTIONS.find((collection) => collection.slug === slug);
}
