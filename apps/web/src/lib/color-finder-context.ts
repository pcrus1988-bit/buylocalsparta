export type ColorFinderContextKey =
  | "nails"
  | "lips"
  | "eyes"
  | "makeup"
  | "hair"
  | "footwear"
  | "bags"
  | "fashion"
  | "home"
  | "generic";

export type ColorFinderContext = Readonly<{
  key: ColorFinderContextKey;
  categoryCode: string;
  categoryLabel: string;
  studioLabel: string;
  editionLabel: string;
  heroLead: string;
  heroEmphasis: string;
  heroBody: string;
  photoKicker: string;
  photoTitle: string;
  photoBody: string;
  resultsEyebrow: string;
  resultsTitle: string;
  resultsBody: string;
  productPlural: string;
  shopLabel: string;
  shortcutTitle: string;
  shortcutBody: string;
  showFinishFilter: boolean;
  showTypeFilter: boolean;
}>;

const clean = (value: string | undefined) => (value ?? "").trim();

function normalized(value: string | undefined): string {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR");
}

export function resolveColorFinderContext(
  rawCategoryCode?: string,
  rawCategoryLabel?: string
): ColorFinderContext {
  const categoryCode = clean(rawCategoryCode) || "nail-care-colour";
  const categoryLabel = clean(rawCategoryLabel) || categoryCode;
  const code = normalized(categoryCode);
  const label = normalized(categoryLabel);
  const signal = `${code} ${label}`;

  if (code === "nail-care-colour" || /nail|νυχι/.test(signal)) {
    return {
      key: "nails",
      categoryCode,
      categoryLabel: categoryLabel === categoryCode ? "Βερνίκια νυχιών" : categoryLabel,
      studioLabel: "NAIL STUDIO",
      editionLabel: "NAIL EDITION",
      heroLead: "Find the nail shade",
      heroEmphasis: "you imagined.",
      heroBody: "Διάλεξε ένα χρώμα ή πάρε το από φωτογραφία και ανακάλυψε τα βερνίκια που του ταιριάζουν περισσότερο. Θα βλέπεις και το όνομα της απόχρωσης για να διαλέγεις πιο εύκολα.",
      photoKicker: "PHOTO TO NAIL COLOR · PRIVATE",
      photoTitle: "Capture your next nail shade.",
      photoBody: "Τράβηξε ή ανέβασε μια φωτογραφία και πάτησε πάνω στο χρώμα που θέλεις να φορέσεις στα νύχια σου.",
      resultsEyebrow: "NAIL SHADES BY COLOR",
      resultsTitle: "Your closest nail matches",
      resultsBody: "Οι πιο ταιριαστές αποχρώσεις εμφανίζονται πρώτες.",
      productPlural: "βερνίκια",
      shopLabel: "NAIL SHOP",
      shortcutTitle: "Βρες βερνίκι από το χρώμα.",
      shortcutBody: "Διάλεξε την απόχρωση που θέλεις και δες ποια βερνίκια της ταιριάζουν περισσότερο.",
      showFinishFilter: true,
      showTypeFilter: true
    };
  }

  if (code === "lip-makeup" || /lip|χειλι/.test(signal)) {
    return {
      key: "lips", categoryCode, categoryLabel,
      studioLabel: "LIP STUDIO", editionLabel: "LIP COLOR EDITION",
      heroLead: "Find the lip color", heroEmphasis: "that feels right.",
      heroBody: "Ξεκίνα από την απόχρωση που θέλεις και ανακάλυψε κραγιόν και προϊόντα χειλιών που της ταιριάζουν περισσότερο.",
      photoKicker: "PHOTO TO LIP COLOR · PRIVATE", photoTitle: "Pick a lip color from real life.",
      photoBody: "Πάρε χρώμα από ρούχο, εικόνα ή αντικείμενο και βρες προϊόντα χειλιών που κινούνται στην ίδια απόχρωση.",
      resultsEyebrow: "LIP COLOR MATCHING", resultsTitle: "Your closest lip colors",
      resultsBody: "Οι πιο ταιριαστές αποχρώσεις για τα χείλη εμφανίζονται πρώτες.",
      productPlural: "προϊόντα χειλιών", shopLabel: "LIP SHOP",
      shortcutTitle: "Βρες το χρώμα χειλιών που ψάχνεις.",
      shortcutBody: "Διάλεξε χρώμα και δες ποια προϊόντα χειλιών του ταιριάζουν περισσότερο.",
      showFinishFilter: true, showTypeFilter: false
    };
  }

  if (code === "eye-makeup" || /eye-makeup|σκια|ματι/.test(signal)) {
    return {
      key: "eyes", categoryCode, categoryLabel,
      studioLabel: "EYE STUDIO", editionLabel: "EYE COLOR EDITION",
      heroLead: "Find the eye color", heroEmphasis: "you want to create.",
      heroBody: "Διάλεξε απόχρωση και ανακάλυψε σκιές και προϊόντα ματιών που ταιριάζουν στο χρώμα σου.",
      photoKicker: "PHOTO TO EYE COLOR · PRIVATE", photoTitle: "Turn inspiration into an eye color.",
      photoBody: "Πάρε μια απόχρωση από φωτογραφία και χρησιμοποίησέ την ως σημείο εκκίνησης για προϊόντα ματιών.",
      resultsEyebrow: "EYE COLOR MATCHING", resultsTitle: "Your closest eye-color matches",
      resultsBody: "Οι πιο ταιριαστές επιλογές για τα μάτια εμφανίζονται πρώτες.",
      productPlural: "προϊόντα ματιών", shopLabel: "EYE MAKEUP",
      shortcutTitle: "Ψάξε μακιγιάζ ματιών με χρώμα.",
      shortcutBody: "Διάλεξε την απόχρωση που θέλεις και δες τις πιο ταιριαστές επιλογές για τα μάτια.",
      showFinishFilter: true, showTypeFilter: false
    };
  }

  if (code === "face-makeup" || /face-makeup|makeup|μακιγιαζ/.test(signal)) {
    return {
      key: "makeup", categoryCode, categoryLabel,
      studioLabel: "MAKEUP STUDIO", editionLabel: "MAKEUP COLOR EDITION",
      heroLead: "Start with the color.", heroEmphasis: "Find the product after.",
      heroBody: "Διάλεξε ή φωτογράφισε μια απόχρωση και ανακάλυψε προϊόντα μακιγιάζ που της ταιριάζουν.",
      photoKicker: "PHOTO TO MAKEUP COLOR · PRIVATE", photoTitle: "Capture a makeup reference.",
      photoBody: "Πάρε ένα χρώμα από τη φωτογραφία σου και βρες προϊόντα που του ταιριάζουν.",
      resultsEyebrow: "MAKEUP BY COLOR", resultsTitle: "Your closest makeup colors",
      resultsBody: "Οι πιο ταιριαστές επιλογές μακιγιάζ εμφανίζονται πρώτες.",
      productPlural: "προϊόντα μακιγιάζ", shopLabel: "MAKEUP",
      shortcutTitle: "Ανακάλυψε μακιγιάζ από την απόχρωση.",
      shortcutBody: "Διάλεξε χρώμα και δες το μακιγιάζ που του ταιριάζει περισσότερο.",
      showFinishFilter: true, showTypeFilter: false
    };
  }

  if (/hair[- ]?(?:color|colour|dye)|haircolor|haircolour|βαφ.*μαλλ|μαλλ.*βαφ/.test(signal)) {
    return {
      key: "hair", categoryCode, categoryLabel,
      studioLabel: "HAIR COLOR STUDIO", editionLabel: "HAIR COLOR EDITION",
      heroLead: "Find the hair color", heroEmphasis: "before you commit.",
      heroBody: "Ξεκίνα από την απόχρωση που θέλεις και ανακάλυψε βαφές και προϊόντα μαλλιών που της ταιριάζουν.",
      photoKicker: "PHOTO TO HAIR COLOR · PRIVATE", photoTitle: "Capture the hair color you want.",
      photoBody: "Πάρε μια απόχρωση από φωτογραφία και δες ποια προϊόντα μαλλιών της ταιριάζουν.",
      resultsEyebrow: "HAIR COLOR MATCHING", resultsTitle: "Your closest hair-color matches",
      resultsBody: "Οι πιο ταιριαστές αποχρώσεις για τα μαλλιά εμφανίζονται πρώτες.",
      productPlural: "χρωματικά προϊόντα μαλλιών", shopLabel: "HAIR COLOR",
      shortcutTitle: "Βρες προϊόντα μαλλιών από την απόχρωση.",
      shortcutBody: "Διάλεξε το χρώμα που θέλεις και δες τις πιο ταιριαστές επιλογές για τα μαλλιά.",
      showFinishFilter: false, showTypeFilter: false
    };
  }

  if (/shoe|sneaker|boot|sandal|loafer|παπουτ|μποτ|σανδαλ/.test(signal)) {
    return {
      key: "footwear", categoryCode, categoryLabel,
      studioLabel: "SHOE STUDIO", editionLabel: "FOOTWEAR EDITION",
      heroLead: "Find shoes", heroEmphasis: "in your color.",
      heroBody: "Διάλεξε χρώμα και βρες παπούτσια που ταιριάζουν στο στιλ και την απόχρωσή σου.",
      photoKicker: "PHOTO TO SHOE COLOR · PRIVATE", photoTitle: "Match shoes to what you already love.",
      photoBody: "Πάρε χρώμα από ρούχο, τσάντα ή φωτογραφία και βρες παπούτσια που ταιριάζουν χρωματικά.",
      resultsEyebrow: "FOOTWEAR BY COLOR", resultsTitle: "Shoes closest to your color",
      resultsBody: "Τα παπούτσια που ταιριάζουν περισσότερο στο χρώμα σου εμφανίζονται πρώτα.",
      productPlural: "παπούτσια", shopLabel: "SHOE SHOP",
      shortcutTitle: "Βρες παπούτσια στο χρώμα σου.",
      shortcutBody: "Διάλεξε χρώμα και δες τα παπούτσια που του ταιριάζουν περισσότερο.",
      showFinishFilter: false, showTypeFilter: false
    };
  }

  if (/handbag|backpack|wallet|luggage|bag|τσαντ|σακιδ|πορτοφολ|αποσκευ/.test(signal)) {
    return {
      key: "bags", categoryCode, categoryLabel,
      studioLabel: "ACCESSORY STUDIO", editionLabel: "BAG & ACCESSORY EDITION",
      heroLead: "Find the accessory", heroEmphasis: "that completes the palette.",
      heroBody: "Διάλεξε χρώμα και ανακάλυψε τσάντες και αξεσουάρ που ταιριάζουν στην απόχρωσή σου.",
      photoKicker: "PHOTO TO ACCESSORY COLOR · PRIVATE", photoTitle: "Match an accessory to your look.",
      photoBody: "Πάρε χρώμα από ένα outfit ή αντικείμενο και βρες διαθέσιμα αξεσουάρ στην ίδια χρωματική κατεύθυνση.",
      resultsEyebrow: "ACCESSORIES BY COLOR", resultsTitle: "Your closest accessory colors",
      resultsBody: "Τα αξεσουάρ που ταιριάζουν περισσότερο εμφανίζονται πρώτα.",
      productPlural: "αξεσουάρ", shopLabel: "ACCESSORIES",
      shortcutTitle: "Βρες αξεσουάρ στο σωστό χρώμα.",
      shortcutBody: "Διάλεξε χρώμα και βρες το αξεσουάρ που ολοκληρώνει το look σου.",
      showFinishFilter: false, showTypeFilter: false
    };
  }

  if (/fashion|womens-|mens-|kids-|ρουχ|μοδα|αξεσουαρ/.test(signal)) {
    return {
      key: "fashion", categoryCode, categoryLabel,
      studioLabel: "FASHION STUDIO", editionLabel: "FASHION COLOR EDITION",
      heroLead: "Shop the color", heroEmphasis: "before the product.",
      heroBody: "Διάλεξε απόχρωση και ανακάλυψε ρούχα και προϊόντα μόδας που ταιριάζουν στο χρώμα σου.",
      photoKicker: "PHOTO TO FASHION COLOR · PRIVATE", photoTitle: "Build around a color you already have.",
      photoBody: "Χρησιμοποίησε χρώμα από outfit ή φωτογραφία και βρες προϊόντα μόδας που ταιριάζουν.",
      resultsEyebrow: "FASHION BY COLOR", resultsTitle: "Fashion closest to your color",
      resultsBody: "Προϊόντα μόδας ταξινομημένα από την πιο κοντινή χρωματική αντιστοιχία.",
      productPlural: "προϊόντα μόδας", shopLabel: "FASHION",
      shortcutTitle: "Ψάξε τη μόδα με χρώμα.",
      shortcutBody: "Διάλεξε χρώμα και χτίσε το look σου γύρω από αυτό.",
      showFinishFilter: false, showTypeFilter: false
    };
  }

  if (/tableware|glassware|home|decor|σπιτι|διακοσμ/.test(signal)) {
    return {
      key: "home", categoryCode, categoryLabel,
      studioLabel: "HOME COLOR STUDIO", editionLabel: "HOME COLOR EDITION",
      heroLead: "Match your space", heroEmphasis: "by color.",
      heroBody: "Διάλεξε μια απόχρωση από τον χώρο σου και βρες αντικείμενα που δένουν όμορφα μαζί της.",
      photoKicker: "PHOTO TO HOME COLOR · PRIVATE", photoTitle: "Capture a color from your space.",
      photoBody: "Πάρε χρώμα από τοίχο, ύφασμα ή αντικείμενο και χρησιμοποίησέ το ως αναφορά.",
      resultsEyebrow: "HOME BY COLOR", resultsTitle: "Objects closest to your color",
      resultsBody: "Τα αντικείμενα που ταιριάζουν περισσότερο εμφανίζονται πρώτα.",
      productPlural: "αντικείμενα", shopLabel: "HOME",
      shortcutTitle: "Ταίριαξε αντικείμενα με τον χώρο σου.",
      shortcutBody: "Διάλεξε χρώμα από τον χώρο σου και βρες αντικείμενα που του ταιριάζουν.",
      showFinishFilter: false, showTypeFilter: false
    };
  }

  return {
    key: "generic", categoryCode, categoryLabel,
    studioLabel: "COLOR STUDIO", editionLabel: "CATEGORY EDITION",
    heroLead: "Start with a color.", heroEmphasis: "Discover what matches.",
    heroBody: "Διάλεξε ένα χρώμα ή πάρε το από φωτογραφία και ανακάλυψε προϊόντα που του ταιριάζουν.",
    photoKicker: "PHOTO TO COLOR · PRIVATE", photoTitle: "Capture the color you want.",
    photoBody: "Πάτησε πάνω σε μια απόχρωση της φωτογραφίας και χρησιμοποίησέ την ως σημείο αναφοράς.",
    resultsEyebrow: "CATEGORY BY COLOR", resultsTitle: "Your closest color matches",
    resultsBody: "Οι πιο ταιριαστές επιλογές εμφανίζονται πρώτες.",
    productPlural: "προϊόντα", shopLabel: "SHOP",
    shortcutTitle: "Βρες προϊόντα από το χρώμα.",
    shortcutBody: "Διάλεξε χρώμα και δες τις επιλογές που του ταιριάζουν περισσότερο.",
    showFinishFilter: false, showTypeFilter: false
  };
}
