"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { productPublicPath } from "../lib/product-url";
import { styleLookShareCodeFromToken } from "../lib/style-look-share-code";
import styles from "./FittingRoomExperience.module.css";

type Audience = "women" | "men";
type Occasion = "everyday" | "work" | "date" | "dinner" | "wedding" | "formal" | "party" | "travel";
type Step = 0 | 1 | 2 | 3 | 4 | 5;
type SlotKey = "main" | "bottom" | "layer" | "shoes" | "bag" | "accessory" | "beauty" | "lipstick" | "nails" | "fragrance";

type Product = Readonly<{
  id: string;
  slug: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  categoryLabel?: string;
  brand?: string;
  color?: string;
  sizes?: readonly string[];
  fit?: string;
  composition?: string;
  mediaId?: string;
  mediaAlt?: string;
  sourceImageAvailable?: boolean;
  available?: boolean;
  availableToSell?: number;
  vendorId?: string;
  vendorName?: string;
  imageSrc?: string;
}>;

type FacetOption = Readonly<{ value: string; label: string; count?: number }>;
type Facets = Readonly<{
  categories?: readonly FacetOption[];
  brands?: readonly FacetOption[];
  colors?: readonly FacetOption[];
  sizes?: readonly FacetOption[];
}>;

type Look = Readonly<{
  name: string;
  mood: string;
  note: string;
  slots: Partial<Record<SlotKey, Product>>;
}>;

type SizeProfile = Readonly<{
  top: string;
  shirt: string;
  jacket: string;
  waist: string;
  trouser: string;
  skirt: string;
  shoe: string;
  dress: string;
  bra: string;
  belt: string;
}>;

type SavedLookPayload = Readonly<{
  id: string;
  name: string;
  audience: Audience;
  source: "user" | "konta";
  shareEnabled?: boolean;
  shareToken?: string;
  profile?: Readonly<{
    sizes?: Partial<SizeProfile>;
    colours?: readonly string[];
    budgetMinor?: number;
    brands?: readonly string[];
    occasion?: Occasion;
  }>;
  composition: readonly (Product & Readonly<{ slot: string }>)[];
}>;

const SLOT_META: Readonly<Record<SlotKey, Readonly<{ label: string; short: string; optional?: boolean }>>> = {
  main: { label: "Κύριο κομμάτι", short: "LOOK" },
  bottom: { label: "Κάτω μέρος", short: "BOTTOM" },
  layer: { label: "Layer / πανωφόρι", short: "LAYER", optional: true },
  shoes: { label: "Παπούτσια", short: "SHOES" },
  bag: { label: "Τσάντα", short: "BAG", optional: true },
  accessory: { label: "Αξεσουάρ", short: "DETAIL", optional: true },
  beauty: { label: "Make-up / Beauty", short: "BEAUTY", optional: true },
  lipstick: { label: "Κραγιόν", short: "LIPSTICK", optional: true },
  nails: { label: "Βερνίκι νυχιών", short: "NAIL POLISH", optional: true },
  fragrance: { label: "Άρωμα", short: "FRAGRANCE", optional: true }
};

const WOMEN_SLOTS: readonly SlotKey[] = ["main", "bottom", "layer", "shoes", "bag", "accessory", "beauty", "lipstick", "nails", "fragrance"];
const MEN_SLOTS: readonly SlotKey[] = ["main", "bottom", "layer", "shoes", "bag", "accessory", "beauty", "fragrance"];

function slotsForAudience(audience: Audience): readonly SlotKey[] {
  return audience === "men" ? MEN_SLOTS : WOMEN_SLOTS;
}

function slotMeta(slot: SlotKey, audience: Audience): Readonly<{ label: string; short: string; optional?: boolean }> {
  if (slot === "beauty" && audience === "men") return { label: "Grooming", short: "GROOMING", optional: true };
  return SLOT_META[slot];
}

const COLOR_CHOICES = [
  { key: "black", label: "Black", hex: "#181818" },
  { key: "white", label: "White", hex: "#F0EDE7" },
  { key: "beige", label: "Beige", hex: "#C5AE91" },
  { key: "brown", label: "Brown", hex: "#755142" },
  { key: "navy", label: "Navy", hex: "#263651" },
  { key: "blue", label: "Blue", hex: "#526E95" },
  { key: "green", label: "Green", hex: "#52705D" },
  { key: "grey", label: "Grey", hex: "#898A88" },
  { key: "yellow", label: "Yellow", hex: "#D2AE4F" },
  { key: "orange", label: "Orange", hex: "#C9763E" },
  { key: "red", label: "Red", hex: "#A53335" },
  { key: "pink", label: "Pink", hex: "#D58B9E" },
  { key: "purple", label: "Purple", hex: "#755E8C" },
  { key: "gold", label: "Gold", hex: "#B69458" },
  { key: "silver", label: "Silver", hex: "#B9BBC0" }
] as const;

const COLOR_WORDS: Readonly<Record<string, readonly string[]>> = {
  black: ["black", "μαύρο", "μαυρο"],
  white: ["white", "λευκό", "λευκο", "ivory", "cream"],
  beige: ["beige", "μπεζ", "nude", "sand", "camel"],
  brown: ["brown", "καφέ", "καφε", "chocolate", "mocha", "tan"],
  navy: ["navy", "midnight", "μπλε σκούρο", "σκούρο μπλε"],
  blue: ["blue", "μπλε", "cobalt", "denim"],
  green: ["green", "πράσινο", "πρασινο", "olive", "emerald"],
  grey: ["grey", "gray", "γκρι", "anthracite"],
  yellow: ["yellow", "giallo", "κίτρινο", "κιτρινο", "lemon"],
  orange: ["orange", "arancio", "πορτοκαλί", "πορτοκαλι", "tangerine"],
  red: ["red", "κόκκινο", "κοκκινο", "burgundy", "bordeaux", "wine"],
  pink: ["pink", "ροζ", "rose", "blush", "fuchsia"],
  purple: ["purple", "μωβ", "violet", "plum", "lilac", "lavender"],
  gold: ["gold", "χρυσό", "χρυσο", "champagne"],
  silver: ["silver", "ασημί", "ασημι", "grey", "gray", "γκρι"]
};

const OCCASIONS: readonly Readonly<{ key: Occasion; icon: string; label: string; copy: string; guidance: string }>[] = [
  { key: "everyday", icon: "☀", label: "Καθημερινά", copy: "Άνετο αλλά προσεγμένο.", guidance: "Ισορροπεί άνεση και εμφάνιση χωρίς υπερβολή." },
  { key: "work", icon: "▣", label: "Δουλειά / γραφείο", copy: "Polished και κατάλληλο για επαγγελματικό περιβάλλον.", guidance: "Δίνει προτεραιότητα σε καθαρές γραμμές, tailoring και πιο διακριτικές επιλογές." },
  { key: "date", icon: "♥", label: "Ραντεβού", copy: "Περιποιημένο, προσωπικό και όχι υπερβολικό.", guidance: "Συνδυάζει πιο κομψά κομμάτια με μία-δύο πιο ιδιαίτερες λεπτομέρειες." },
  { key: "dinner", icon: "☾", label: "Δείπνο / έξοδος", copy: "Elevated βραδινό look.", guidance: "Προτιμά κομψές γραμμές, πιο refined παπούτσια και ολοκληρωμένο beauty/grooming." },
  { key: "wedding", icon: "✦", label: "Γάμος / τελετή", copy: "Επίσημο χωρίς να γίνεται υπερβολικά βαρύ.", guidance: "Αποφεύγει πολύ casual κομμάτια και δίνει βάρος σε formal παπούτσια, tailoring και κομψές λεπτομέρειες." },
  { key: "formal", icon: "◇", label: "Formal / gala", copy: "Η πιο αυστηρή dress-code επιλογή.", guidance: "Αποκλείει εμφανώς casual συνδυασμούς και χτίζει το look γύρω από formal γραμμές." },
  { key: "party", icon: "★", label: "Party / βραδινό", copy: "Πιο τολμηρό και statement.", guidance: "Επιτρέπει πιο έντονο χρώμα, λάμψη και beauty στοιχεία, διατηρώντας συνοχή." },
  { key: "travel", icon: "✈", label: "Ταξίδι / city day", copy: "Άνεση για πολλές ώρες, χωρίς να χάνεται το styling.", guidance: "Προτιμά πρακτικά layers, άνετα παπούτσια και λειτουργικά αξεσουάρ." }
];

function occasionDetails(occasion: Occasion) {
  return OCCASIONS.find((entry) => entry.key === occasion) ?? OCCASIONS[0];
}

const LOOK_PERSONALITIES = [
  {
    name: "Clean Edit",
    mood: "Καθαρό · σύγχρονο · εύκολο",
    note: "Ισορροπημένο look για να το φορέσεις ξανά και ξανά χωρίς να μοιάζει βαρετό."
  },
  {
    name: "City Edit",
    mood: "Πιο έντονο · polished · confident",
    note: "Λίγο περισσότερη παρουσία, χωρίς να χάνει την πρακτικότητα και την άνεση."
  },
  {
    name: "After Dark",
    mood: "Statement · βραδινό · πιο τολμηρό",
    note: "Η πιο παιχνιδιάρικη πρόταση του fitting room, με χώρο για χρώμα και λεπτομέρεια."
  }
] as const;

const LOADING_SLIDES = {
  fitting: "/fitting-room/loading/fitting-room.webp",
  curated: "/fitting-room/loading/curated-looks.webp",
  men: "/fitting-room/loading/male-styling.webp",
  women: "/fitting-room/loading/female-styling.webp",
  ready: "/fitting-room/loading/stylist-ready.webp"
} as const;

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productText(product: Product): string {
  return normalize([
    product.title,
    product.categoryCode,
    product.categoryLabel,
    product.brand,
    product.color,
    product.fit,
    product.composition
  ].filter(Boolean).join(" "));
}

const MAIN_CATEGORY_CODES = new Set([
  "fashion-womens-tops","fashion-womens-shirts","fashion-womens-knitwear","fashion-womens-dresses","fashion-womens-jumpsuits",
  "fashion-mens-tshirts-tops","fashion-mens-shirts","fashion-mens-knitwear","fashion-mens-suits-formal"
]);
const BOTTOM_CATEGORY_CODES = new Set([
  "fashion-womens-trousers-jeans","fashion-womens-skirts","fashion-womens-shorts",
  "fashion-mens-trousers-jeans","fashion-mens-shorts"
]);
const LAYER_CATEGORY_CODES = new Set(["fashion-womens-jackets-coats","fashion-mens-jackets-coats"]);
const SHOE_CATEGORY_CODES = new Set(["womens-sneakers","womens-formal-shoes","womens-boots","womens-sandals","mens-sneakers","mens-formal-shoes","mens-boots","mens-sandals"]);
const BAG_CATEGORY_CODES = new Set(["handbags","mens-bags","backpacks"]);
const ACCESSORY_CATEGORY_CODES = new Set(["sunglasses","belts","scarves-hats-gloves","necklaces","earrings","bracelets","rings","wallets-cardholders","ties-formal-accessories"]);

function explicitFashionSlot(product: Product): SlotKey | null {
  const text = normalize(product.title);
  if (/swimsuit|swimwear|bikini|tankini|monokini|bathing suit|beachwear|boardshort|swim short|costume da bagno|μαγι|μπικιν/.test(text)) return null;

  // Strong product nouns win over incidental words. This prevents a title such as
  // "Crystal Gold Belt Lace Sheath Gown Dress" from becoming an accessory merely
  // because it contains the word "belt".
  if (/shoe|sneaker|trainer|boot|loafer|moccas|sandal|heel|pump|stiletto|footwear|παπουτ|μποτ|σανδαλ|γοβ/.test(text)) return "shoes";
  if (/handbag|crossbody|shoulder bag|tote bag|clutch|backpack|purse|τσαντ|σακιδ/.test(text)) return "bag";
  if (/gown|jumpsuit|overall|cocktail dress|evening dress|sheath dress|midi dress|maxi dress|mini dress|(?:^|\s)dress(?:\s|$)|φορεμ|ολόσωμ|ολοσωμ|(?:^|\s)(?:suit|costume)(?:\s|$)|κοστουμ/.test(text)) return "main";
  if (/jacket|coat|blazer|cardigan|overshirt|parka|trench|μπουφαν|παλτο|σακακι|ζακετ/.test(text)) return "layer";
  if (/trouser|pants|jean|skirt|shorts|legging|chino|παντελον|τζιν|φουστ|σορτ/.test(text)) return "bottom";
  if (/necklace|earring|bracelet|ring|watch|sunglass|eyewear|belt|scarf|hat|jewel|wallet|tie|κολιε|σκουλαρ|βραχιολ|δαχτυλ|ρολογ|γυαλ|ζων|κασκολ|καπελ|κοσμη|πορτοφολ/.test(text)) return "accessory";
  if (/shirt|t shirt|t-shirt|top|blouse|sweater|knit|hoodie|polo|πουκαμισ|μπλουζ|πλεκ|φουτερ/.test(text)) return "main";
  return null;
}

function slotFor(product: Product): SlotKey | null {
  if (product.categoryCode === "lip-makeup") return "lipstick";
  if (product.categoryCode === "nail-care-colour") return "nails";
  if (product.categoryCode === "fragrance") return "fragrance";
  if (product.categoryCode === "face-makeup" || product.categoryCode === "eye-makeup" || product.categoryCode === "grooming-care" || product.categoryCode === "beauty-tools-accessories") return "beauty";

  const explicit = explicitFashionSlot(product);
  if (explicit) return explicit;

  // Fall back to the canonical taxonomy only after the title has had a chance to
  // correct a noisy supplier classification.
  if (MAIN_CATEGORY_CODES.has(product.categoryCode)) return "main";
  if (BOTTOM_CATEGORY_CODES.has(product.categoryCode)) return "bottom";
  if (LAYER_CATEGORY_CODES.has(product.categoryCode)) return "layer";
  if (SHOE_CATEGORY_CODES.has(product.categoryCode)) return "shoes";
  if (BAG_CATEGORY_CODES.has(product.categoryCode)) return "bag";
  if (ACCESSORY_CATEGORY_CODES.has(product.categoryCode)) return "accessory";
  return null;
}

function isOnePiece(product: Product | undefined): boolean {
  if (!product) return false;
  return /dress|jumpsuit|overall|φορεμ|ολόσωμ|ολοσωμ/.test(productText(product));
}

function isSuitLike(product: Product | undefined): boolean {
  if (!product) return false;
  return /(?:^|\s)(?:suit|costume)(?:\s|$)|κοστουμ/.test(productText(product));
}

function isStandaloneOutfit(product: Product | undefined): boolean {
  return isOnePiece(product) || isSuitLike(product);
}

function isBlazerLike(product: Product | undefined): boolean {
  if (!product) return false;
  return /blazer|tailor|suit jacket|σακακ/.test(productText(product));
}

const NON_OUTFIT_STYLE = /swimsuit|swimwear|bikini|tankini|monokini|bathing suit|beachwear|boardshort|swim short|costume da bagno|μαγι|μπικιν|pajama|pyjama|sleepwear|nightwear|nightgown|νυχτικ|πιτζαμ|lingerie|underwear|briefs?|boxers?|εσωρουχ/;
const ACTIVEWEAR_STYLE = /tracksuit|track pants|jogger|gym|activewear|sports bra|running|training|athletic|yoga|compression|κολαν|φόρμα|φορμα/;
const FORMAL_CASUAL_STYLE = /hoodie|sweatshirt|shorts|sneaker|trainer|jean|denim|legging|cargo|ripped|distressed|t shirt|t-shirt|tee shirt|crop top|tank top/;
const BEACH_SHOE_STYLE = /flip flop|flip-flop|pool slide|beach sandal|σαγιοναρ/;

const EVENING_ONLY_STYLE = /gown|evening dress|cocktail dress|prom dress|ball gown|bridal|bridesmaid|wedding dress|black tie|red carpet|crystal embellished|rhinestone|sequin/;
const CLEAN_EDIT_CONFLICT = /graphic|logo print|all over print|printed|patterned|novelty|musical|instrument|animal print|neon|sequin|glitter|rhinestone|crystal embellished/;

function isOccasionEligible(product: Product, slot: SlotKey, occasion: Occasion): boolean {
  const text = productText(product);
  const outfitSlot = slot === "main" || slot === "bottom" || slot === "layer" || slot === "shoes";

  if (outfitSlot && NON_OUTFIT_STYLE.test(text)) return false;

  if (slot === "shoes" && BEACH_SHOE_STYLE.test(text) && ["work", "date", "dinner", "wedding", "formal"].includes(occasion)) {
    return false;
  }

  if (occasion === "formal" || occasion === "wedding") {
    if (outfitSlot && ACTIVEWEAR_STYLE.test(text)) return false;
    if (outfitSlot && FORMAL_CASUAL_STYLE.test(text)) return false;
    if (slot === "layer" && /parka|puffer|track jacket|sports jacket/.test(text)) return false;
  }

  if (occasion === "work") {
    if (outfitSlot && ACTIVEWEAR_STYLE.test(text)) return false;
    if (outfitSlot && EVENING_ONLY_STYLE.test(text)) return false;
    if (slot === "main" && /crop top|bralette|tank top|hoodie|sweatshirt/.test(text)) return false;
    if (slot === "bottom" && /shorts|ripped|distressed|legging/.test(text)) return false;
    if (slot === "shoes" && /flip flop|pool slide|beach sandal/.test(text)) return false;
  }

  if ((occasion === "date" || occasion === "dinner") && outfitSlot && ACTIVEWEAR_STYLE.test(text)) return false;
  if (occasion === "dinner" && slot === "bottom" && /shorts/.test(text)) return false;

  if ((occasion === "everyday" || occasion === "travel") && outfitSlot && EVENING_ONLY_STYLE.test(text)) return false;
  if (occasion === "travel" && slot === "shoes" && /stiletto|high heel|pump|γόβ|γοβ/.test(text)) return false;

  return true;
}

const WOMEN_ONLY_BEAUTY = new Set(["lip-makeup", "face-makeup", "eye-makeup", "nail-care-colour"]);
const MEN_ONLY_BEAUTY = new Set(["grooming-care"]);

function hasWomenSignal(text: string): boolean {
  return /(?:^|\s)(?:women|woman|womens|female|lady|ladies|donna|femme|girl)(?:\s|$)|γυναικ/.test(text);
}

function hasMenSignal(text: string): boolean {
  return /(?:^|\s)(?:men|mens|man|male|uomo|homme|boy)(?:\s|$)|ανδρ/.test(text);
}

const WOMEN_CATEGORY_CODES = new Set([
  "fashion-womens-tops","fashion-womens-shirts","fashion-womens-knitwear","fashion-womens-dresses","fashion-womens-jumpsuits",
  "fashion-womens-trousers-jeans","fashion-womens-skirts","fashion-womens-shorts","fashion-womens-jackets-coats",
  "womens-sneakers","womens-formal-shoes","womens-boots","womens-sandals"
]);
const MEN_CATEGORY_CODES = new Set([
  "fashion-mens-tshirts-tops","fashion-mens-shirts","fashion-mens-knitwear","fashion-mens-trousers-jeans","fashion-mens-shorts",
  "fashion-mens-jackets-coats","fashion-mens-suits-formal","mens-sneakers","mens-formal-shoes","mens-boots","mens-sandals","mens-bags"
]);

function isAudienceCompatible(product: Product, audience: Audience): boolean {
  const category = normalize(product.categoryCode);
  if (audience === "men" && WOMEN_ONLY_BEAUTY.has(product.categoryCode)) return false;
  if (audience === "women" && MEN_ONLY_BEAUTY.has(product.categoryCode)) return false;
  if (audience === "men" && WOMEN_CATEGORY_CODES.has(product.categoryCode)) return false;
  if (audience === "women" && MEN_CATEGORY_CODES.has(product.categoryCode)) return false;
  if (audience === "men" && /(?:^|\s)(?:women|woman|womens|female)(?:\s|$)|γυναικ/.test(category)) return false;
  if (audience === "women" && /(?:^|\s)(?:men|mens|man|male)(?:\s|$)|ανδρ/.test(category)) return false;

  const text = productText(product);
  const women = hasWomenSignal(text);
  const men = hasMenSignal(text);
  if (audience === "men" && women && !men) return false;
  if (audience === "women" && men && !women) return false;

  if (product.categoryCode === "fragrance") {
    const feminine = /pour femme|for women|women s|donna|femme/.test(text);
    const masculine = /pour homme|for men|men s|uomo|homme|after shave|aftershave|(?:^|\s)tabac(?:\s+original)?(?:\s|$)/.test(text);
    if (audience === "women" && masculine && !feminine) return false;
    if (audience === "men" && feminine && !masculine) return false;
  }

  return true;
}

function audienceAffinity(text: string, audience: Audience): number {
  const explicitWomen = hasWomenSignal(text);
  const explicitMen = hasMenSignal(text);
  if ((audience === "women" && explicitWomen) || (audience === "men" && explicitMen)) return 16;
  return 0;
}

function audiencePenalty(product: Product, audience: Audience): number {
  if (!isAudienceCompatible(product, audience)) return -1000;
  return audienceAffinity(productText(product), audience);
}

function selectedSizeFor(product: Product, slot: SlotKey, sizes: SizeProfile): string {
  const text = productText(product);
  if (slot === "shoes") return sizes.shoe;
  if (slot === "layer") return sizes.jacket || sizes.top;
  if (slot === "bottom") {
    if (/skirt|φουστ/.test(text)) return sizes.skirt || sizes.trouser || sizes.waist;
    return sizes.trouser || sizes.waist;
  }
  if (slot === "main") {
    if (/dress|jumpsuit|overall|φορεμ|ολόσωμ|ολοσωμ/.test(text)) return sizes.dress || sizes.top;
    if (/shirt|πουκαμισ/.test(text)) return sizes.shirt || sizes.top;
    return sizes.top || sizes.shirt;
  }
  if (slot === "accessory" && /belt|ζων/.test(text)) return sizes.belt;
  return "";
}

function matchesSize(product: Product, slot: SlotKey, sizes: SizeProfile): number {
  const selected = normalize(selectedSizeFor(product, slot, sizes));
  const productSizes = (product.sizes ?? []).map(normalize).filter(Boolean);
  if (!selected || productSizes.length === 0) return 0;
  if (productSizes.some((value) => value === selected || value.includes(selected) || selected.includes(value))) return 30;
  return -28;
}

function colorAffinity(product: Product, selectedColors: readonly string[]): number {
  if (!selectedColors.length) return 0;
  const text = productText(product);
  return selectedColors.some((key) => (COLOR_WORDS[key] ?? [key]).some((word) => text.includes(normalize(word)))) ? 24 : 0;
}

function etiquetteScore(
  product: Product,
  slot: SlotKey,
  audience: Audience,
  occasion: Occasion,
  slots: Readonly<Partial<Record<SlotKey, Product>>>
): number {
  const text = productText(product);
  const main = slots.main;
  const mainText = productText(main ?? product);
  const shorts = /shorts|σορτ/.test(text);
  const hoodie = /hoodie|sweatshirt|φουτερ/.test(text);
  const sneaker = /sneaker|trainer/.test(text) || /(?:women|men)s sneakers/.test(text);
  const heel = /heel|pump|stiletto|γόβ|γοβ/.test(text);
  const formalShoe = heel || /formal shoes|loafer|oxford|derby|monk|moccas/.test(text);
  const blazer = /blazer|tailor|suit jacket|σακακ/.test(text);
  const dress = /dress|φορεμ/.test(text);
  const jumpsuit = /jumpsuit|overall|ολόσωμ|ολοσωμ/.test(text);
  const suit = /(?:^|\s)(?:suit|costume)(?:\s|$)|κοστουμ/.test(text);
  const shirt = /shirt|blouse|πουκαμισ/.test(text);
  const trousers = /trouser|pants|chino|παντελον/.test(text);
  const jeans = /jean|denim|τζιν/.test(text);
  const knit = /knit|sweater|cardigan|πλεκ|ζακετ/.test(text);
  const statement = /sequin|glitter|metallic|satin|velvet|statement|παγιετ|σατεν/.test(text);
  const backpack = /backpack|σακιδ/.test(text);

  if (slot === "bottom" && isStandaloneOutfit(main)) return -1000;
  if (slot === "layer" && isSuitLike(main) && blazer) return -1000;

  let score = 0;

  if (main && isOnePiece(main)) {
    if (slot === "shoes") {
      if (["date", "dinner", "wedding", "formal", "party"].includes(occasion) && (heel || formalShoe)) score += 34;
      if (["everyday", "travel"].includes(occasion) && sneaker) score += 24;
    }
    if (slot === "layer" && blazer) {
      score += ["work", "date", "dinner", "wedding", "formal"].includes(occasion) ? 32 : 14;
    }
  }

  if (occasion === "formal") {
    if (shorts || hoodie || sneaker) return -1000;
    if (slot === "main" && (dress || jumpsuit || suit || shirt)) score += 38;
    if (slot === "bottom" && trousers) score += 30;
    if (slot === "layer" && blazer) score += 34;
    if (slot === "shoes" && formalShoe) score += 38;
  } else if (occasion === "wedding") {
    if (shorts || hoodie) return -1000;
    if (audience === "men" && slot === "shoes" && sneaker) return -1000;
    if (slot === "main" && (dress || jumpsuit || suit || shirt)) score += 34;
    if (slot === "bottom" && trousers) score += 24;
    if (slot === "layer" && blazer) score += 30;
    if (slot === "shoes" && formalShoe) score += 34;
  } else if (occasion === "work") {
    if (shorts) score -= 80;
    if (hoodie) score -= 55;
    if (slot === "main" && (shirt || dress || suit || knit)) score += 26;
    if (slot === "bottom" && (trousers || /skirt|φουστ/.test(text))) score += 24;
    if (slot === "layer" && blazer) score += 32;
    if (slot === "shoes" && formalShoe) score += 24;
    if (slot === "shoes" && sneaker) score -= 18;
  } else if (occasion === "date") {
    if (slot === "main" && (dress || jumpsuit || shirt || knit)) score += 22;
    if (slot === "layer" && (blazer || /leather|δερμα/.test(text))) score += 18;
    if (slot === "shoes" && (heel || formalShoe)) score += 24;
    if (slot === "fragrance" || slot === "lipstick") score += 18;
  } else if (occasion === "dinner") {
    if (shorts) score -= 35;
    if (slot === "main" && (dress || jumpsuit || shirt || suit)) score += 26;
    if (slot === "layer" && blazer) score += 24;
    if (slot === "shoes" && formalShoe) score += 28;
    if (slot === "fragrance" || slot === "lipstick") score += 20;
  } else if (occasion === "party") {
    if (slot === "main" && (dress || jumpsuit || statement)) score += 28;
    if (slot === "shoes" && (heel || formalShoe)) score += 24;
    if (statement) score += 22;
    if (slot === "beauty" || slot === "lipstick" || slot === "nails" || slot === "fragrance") score += 18;
  } else if (occasion === "travel") {
    if (slot === "shoes" && sneaker) score += 34;
    if (slot === "shoes" && heel) score -= 55;
    if (slot === "main" && (knit || shirt)) score += 16;
    if (slot === "layer" && (knit || /jacket|coat|parka|trench|μπουφαν|παλτο/.test(text))) score += 24;
    if (slot === "bag" && backpack) score += 24;
  } else {
    if (slot === "main" && (jeans || knit || shirt || /top|t shirt|t-shirt|μπλουζ/.test(text))) score += 14;
    if (slot === "bottom" && (jeans || trousers || /skirt|φουστ/.test(text))) score += 14;
    if (slot === "shoes" && sneaker) score += 20;
  }

  if (isSuitLike(main)) {
    if (slot === "shoes" && formalShoe) score += 28;
    if (slot === "shoes" && sneaker && !["everyday", "travel"].includes(occasion)) score -= 60;
  }

  if (/dress|φορεμ/.test(mainText) && slot === "bottom") return -1000;
  return score;
}

function personalityScore(product: Product, personality: number): number {
  const text = productText(product);
  if (personality === 0) {
    if (CLEAN_EDIT_CONFLICT.test(text)) return -1000;
    return /black|white|beige|navy|cream|taupe|grey|gray|classic|basic|minimal|λευκ|μαυρ|μπεζ|γκρι/.test(text) ? 18 : 4;
  }
  if (personality === 1) {
    return /blazer|leather|denim|loafer|heel|watch|structured|tailor|σακακ|δερμα|τζιν/.test(text) ? 16 : 4;
  }
  return /red|pink|purple|gold|silver|metallic|sequin|glitter|statement|burgundy|velvet|satin|κοκκιν|ροζ|χρυσ|ασημ/.test(text) ? 20 : 4;
}

function colorFamily(product: Product | undefined): string {
  if (!product) return "";
  const text = normalize([product.color, product.title].filter(Boolean).join(" "));
  if (/black|μαυρ/.test(text)) return "black";
  if (/white|ivory|cream|λευκ|εκρου/.test(text)) return "white";
  if (/beige|taupe|camel|μπεζ/.test(text)) return "beige";
  if (/navy|blue|μπλε/.test(text)) return "blue";
  if (/grey|gray|γκρι/.test(text)) return "grey";
  if (/brown|tan|cognac|καφε/.test(text)) return "brown";
  if (/red|burgundy|wine|κοκκιν|μπορν/.test(text)) return "red";
  if (/pink|rose|ροζ/.test(text)) return "pink";
  if (/green|olive|khaki|πρασιν|χακι/.test(text)) return "green";
  if (/purple|lilac|violet|μοβ|λιλα/.test(text)) return "purple";
  if (/gold|silver|metallic|χρυσ|ασημ/.test(text)) return "metallic";
  return "";
}

function coherenceScore(
  product: Product,
  slot: SlotKey,
  occasion: Occasion,
  slots: Readonly<Partial<Record<SlotKey, Product>>>
): number {
  const main = slots.main;
  if (!main) return 0;

  const mainText = productText(main);
  const text = productText(product);
  let score = 0;

  const mainEvening = EVENING_ONLY_STYLE.test(mainText) || /satin|velvet|tuxedo|formal/.test(mainText);
  const productCasual = /hoodie|sweatshirt|sneaker|trainer|cargo|ripped|distressed|sport|athletic|backpack/.test(text);
  if (mainEvening && productCasual && ["layer","shoes","bag","accessory"].includes(slot)) return -1000;

  const mainPatterned = CLEAN_EDIT_CONFLICT.test(mainText);
  const productStatement = /sequin|glitter|rhinestone|crystal|animal print|neon|all over print|patterned/.test(text);
  if (mainPatterned && productStatement && ["layer","bag","accessory","shoes"].includes(slot)) score -= 55;

  if (occasion === "work") {
    if (slot === "bottom" && /trouser|pants|chino|skirt|παντελον|φουστ/.test(text)) score += 18;
    if (slot === "layer" && /blazer|tailor|cardigan|σακακ|ζακετ/.test(text)) score += 18;
    if (slot === "bag" && /briefcase|structured|tote|shoulder bag/.test(text)) score += 12;
    if (slot === "bag" && /backpack|sport/.test(text)) score -= 24;
  }

  if (isOnePiece(main)) {
    if (slot === "shoes" && /heel|pump|stiletto|loafer|formal|γοβ/.test(text)) score += 18;
    if (slot === "bag" && /clutch|shoulder bag|handbag/.test(text)) score += 12;
  }

  const mainColor = colorFamily(main);
  const itemColor = colorFamily(product);
  if (mainColor && itemColor) {
    const neutrals = new Set(["black","white","beige","grey","brown"]);
    if (mainColor === itemColor) score += 12;
    else if (neutrals.has(mainColor) || neutrals.has(itemColor)) score += 8;
  }

  if ((slot === "lipstick" || slot === "nails") && slots.lipstick && slots.nails) {
    const lip = colorFamily(slots.lipstick);
    const nails = colorFamily(slots.nails);
    if (lip && nails && lip === nails) score += 14;
  }

  return score;
}

function productScore(
  product: Product,
  slot: SlotKey,
  audience: Audience,
  sizes: SizeProfile,
  colors: readonly string[],
  brands: readonly string[],
  personality: number,
  occasion: Occasion,
  slots: Readonly<Partial<Record<SlotKey, Product>>>
): number {
  if (!isOccasionEligible(product, slot, occasion)) return -1000;
  let score = 50;
  score += audiencePenalty(product, audience);
  score += matchesSize(product, slot, sizes);
  score += colorAffinity(product, colors);
  score += personalityScore(product, personality);
  score += etiquetteScore(product, slot, audience, occasion, slots);
  score += coherenceScore(product, slot, occasion, slots);
  if (product.brand && brands.some((brand) => normalize(brand) === normalize(product.brand))) score += 34;
  if (product.available !== false && (product.availableToSell ?? 1) > 0) score += 8;
  return score;
}

function imageCandidates(product: Product): readonly string[] {
  return [...new Set([
    product.imageSrc,
    product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : undefined,
    product.sourceImageAvailable ? `/api/catalog-source-image/${encodeURIComponent(product.id)}` : undefined
  ].filter((value): value is string => Boolean(value)))];
}

function ProductArtwork({ product, alt }: { product: Product; alt: string }) {
  const [imageIndex, setImageIndex] = useState(0);
  const candidates = imageCandidates(product);
  useEffect(() => setImageIndex(0), [product.id, product.imageSrc, product.mediaId, product.sourceImageAvailable]);
  const src = candidates[imageIndex];
  if (!src) return <span>{product.title.slice(0, 1)}</span>;
  return <img
    src={src}
    alt={alt}
    loading="lazy"
    decoding="async"
    onError={() => setImageIndex((current) => current + 1)}
  />;
}

function imageFor(product: Product): string | undefined {
  return imageCandidates(product)[0];
}

function compactProduct(product: Product): Product {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    price: product.price,
    priceMinor: product.priceMinor,
    categoryCode: product.categoryCode,
    categoryLabel: product.categoryLabel,
    brand: product.brand,
    color: product.color,
    sizes: product.sizes ?? [],
    fit: product.fit,
    mediaId: product.mediaId,
    mediaAlt: product.mediaAlt,
    sourceImageAvailable: product.sourceImageAvailable,
    vendorId: product.vendorId,
    vendorName: product.vendorName,
    available: product.available,
    availableToSell: product.availableToSell,
    imageSrc: imageFor(product)
  };
}

function decodeShareLook(value: string): Look | undefined {
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { n?: string; m?: string; x?: string; s?: Partial<Record<SlotKey, Product>> };
    if (!parsed.s || typeof parsed.s !== "object") return undefined;
    return {
      name: parsed.n?.slice(0, 80) || "Shared Look",
      mood: parsed.m?.slice(0, 120) || "Shared from KONTA MOY",
      note: parsed.x?.slice(0, 240) || "Ένα look που δημιουργήθηκε στο KONTA MOY Fitting Room.",
      slots: parsed.s
    };
  } catch {
    return undefined;
  }
}

function euroBudget(value: string): number | undefined {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : undefined;
}

function totalMinor(look: Look): number {
  return Object.values(look.slots).reduce((sum, product) => sum + (product?.priceMinor ?? 0), 0);
}

function formatTotal(value: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value / 100);
}

function facetOptions(values: readonly string[]): readonly FacetOption[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const key = normalize(label);
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label, count: 1 });
  }
  return [...counts.entries()]
    .map(([value, entry]) => ({ value, label: entry.label, count: entry.count }))
    .sort((left, right) => (right.count ?? 0) - (left.count ?? 0) || left.label.localeCompare(right.label, "el"));
}

function facetsFromProducts(products: readonly Product[]): Facets {
  return {
    brands: facetOptions(products.flatMap((product) => product.brand ? [product.brand] : [])),
    colors: facetOptions(products.flatMap((product) => product.color ? [product.color] : [])),
    sizes: facetOptions(products.flatMap((product) => [...(product.sizes ?? [])]))
  };
}

export function FittingRoomExperience({
  vendorId,
  hubSlug,
  hubName,
  csrfToken,
  savedLookId
}: {
  vendorId?: string;
  hubSlug: string;
  hubName: string;
  csrfToken?: string;
  savedLookId?: string;
}) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [audience, setAudience] = useState<Audience>("women");
  const [occasion, setOccasion] = useState<Occasion>("everyday");
  const [sizes, setSizes] = useState<SizeProfile>({ top: "", shirt: "", jacket: "", waist: "", trouser: "", skirt: "", shoe: "", dress: "", bra: "", belt: "" });
  const [colors, setColors] = useState<readonly string[]>([]);
  const [budget, setBudget] = useState("");
  const [brands, setBrands] = useState<readonly string[]>([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [facets, setFacets] = useState<Facets>({});
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [looks, setLooks] = useState<readonly Look[]>([]);
  const [activeLook, setActiveLook] = useState(0);
  const [editingSlot, setEditingSlot] = useState<SlotKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [prefetching, setPrefetching] = useState(false);
  const [brandsLoaded, setBrandsLoaded] = useState(false);
  const [alternativeLoading, setAlternativeLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [persistedLook, setPersistedLook] = useState<Readonly<{ id: string; shareEnabled?: boolean; shareToken?: string }> | undefined>();
  const [loadedSavedLook, setLoadedSavedLook] = useState(false);
  const [immersive, setImmersive] = useState(false);

  const requestNativeFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) {
      void root.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const exitNativeFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const enterImmersive = useCallback(() => {
    setImmersive(true);
    requestNativeFullscreen();
  }, [requestNativeFullscreen]);

  const leaveImmersive = useCallback(() => {
    setImmersive(false);
    setEditingSlot(null);
    exitNativeFullscreen();
  }, [exitNativeFullscreen]);

  useEffect(() => {
    if (!immersive) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [immersive]);

  useEffect(() => {
    if (!savedLookId || loadedSavedLook) return;
    const controller = new AbortController();
    void fetch(`/api/account/style-looks/${encodeURIComponent(savedLookId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("saved-look");
        return response.json() as Promise<{ look?: SavedLookPayload }>;
      })
      .then((payload) => {
        const saved = payload.look;
        if (!saved?.composition?.length) return;
        const slots: Partial<Record<SlotKey, Product>> = {};
        for (const item of saved.composition) {
          if (!(item.slot in SLOT_META)) continue;
          const savedSlot = item.slot as SlotKey;
          const slot = savedSlot === "beauty" ? (slotFor(item) ?? savedSlot) : savedSlot;
          if (!slotsForAudience(saved.audience).includes(slot)) continue;
          if (!isAudienceCompatible(item, saved.audience)) continue;
          slots[slot] = item;
        }
        if (!Object.keys(slots).length) return;
        setAudience(saved.audience);
        setOccasion(saved.profile?.occasion ?? "everyday");
        setSizes((current) => ({ ...current, ...(saved.profile?.sizes ?? {}) }));
        setColors((saved.profile?.colours ?? []).slice(0, 3));
        setBrands((saved.profile?.brands ?? []).slice(0, 5));
        setBudget(saved.profile?.budgetMinor ? String(saved.profile.budgetMinor / 100) : "");
        setLooks([{
          name: saved.name || "Saved Look",
          mood: saved.source === "konta" ? "KONTA MOY edit · saved look" : "Το δικό σου saved look",
          note: "Άνοιξέ το και άλλαξε οποιοδήποτε κομμάτι θέλεις.",
          slots
        }]);
        setActiveLook(0);
        setPersistedLook({ id: saved.id, shareEnabled: saved.shareEnabled, shareToken: saved.shareToken });
        setStarted(true);
        setLoadedSavedLook(true);
      })
      .catch(() => setLoadedSavedLook(true));
    return () => controller.abort();
  }, [loadedSavedLook, savedLookId]);

  useEffect(() => {
    if (savedLookId || loadedSavedLook) return;
    const raw = new URLSearchParams(window.location.search).get("look");
    if (!raw) return;
    const shared = decodeShareLook(raw);
    if (!shared) return;
    setLooks([shared]);
    setActiveLook(0);
    setStarted(true);
    setLoadedSavedLook(true);
  }, [loadedSavedLook, savedLookId]);

  const brandOptions = useMemo(() => {
    const all = [...(facets.brands ?? [])]
      .sort((left, right) => (right.count ?? 0) - (left.count ?? 0) || left.label.localeCompare(right.label))
      .map((entry) => entry.label);
    const query = normalize(brandSearch);
    return (query ? all.filter((brand) => normalize(brand).includes(query)) : all).slice(0, 24);
  }, [brandSearch, facets.brands]);

  const currentLook = looks[activeLook];

  useEffect(() => {
    setProducts([]);
    setFacets({});
    setBrandsLoaded(false);
    setEditingSlot(null);
  }, [audience, hubSlug, vendorId]);

  useEffect(() => {
    if (!started || step !== 5 || prefetching || brandsLoaded) return;
    let active = true;
    setPrefetching(true);
    void loadBrandOptions()
      .then((brandOptions) => {
        if (!active) return;
        setFacets((current) => ({ ...current, brands: brandOptions }));
      })
      .catch(() => {
        // Brand preference is optional. A slow facet lookup must never block the
        // session or trigger a second full catalogue request when the user continues.
      })
      .finally(() => {
        if (!active) return;
        setBrandsLoaded(true);
        setPrefetching(false);
      });
    return () => {
      active = false;
    };
  }, [audience, brandsLoaded, hubSlug, started, step, vendorId]);

  useEffect(() => {
    if (!editingSlot || products.length || alternativeLoading) return;
    let active = true;
    setAlternativeLoading(true);
    void loadCandidateProducts()
      .then((candidateProducts) => {
        if (active) setProducts(candidateProducts);
      })
      .catch(() => {
        if (active) setLoadError("Δεν μπόρεσα να ανανεώσω τις διαθέσιμες εναλλακτικές αυτή τη στιγμή.");
      })
      .finally(() => {
        if (active) setAlternativeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editingSlot, products.length]);

  const alternatives = useMemo(() => {
    if (!editingSlot || !products.length) return [];
    const selected = currentLook?.slots[editingSlot]?.id;
    return products
      .filter((product) => isAudienceCompatible(product, audience) && slotFor(product) === editingSlot && product.id !== selected)
      .map((product) => ({
        product,
        score: productScore(product, editingSlot, audience, sizes, colors, brands, activeLook < 3 ? activeLook : 0, occasion, currentLook?.slots ?? {})
      }))
      .filter((entry) => entry.score > 20)
      .sort((left, right) => right.score - left.score || left.product.priceMinor - right.product.priceMinor)
      .slice(0, 12)
      .map((entry) => entry.product);
  }, [activeLook, audience, brands, colors, currentLook, editingSlot, occasion, products, sizes]);

  function toggleColor(key: string) {
    setColors((current) => current.includes(key)
      ? current.filter((value) => value !== key)
      : current.length < 3
        ? [...current, key]
        : current);
  }

  function toggleBrand(brand: string) {
    setBrands((current) => current.includes(brand)
      ? current.filter((value) => value !== brand)
      : current.length < 5
        ? [...current, brand]
        : current);
  }

  function nextStep() {
    if (step < 5) setStep((step + 1) as Step);
    else void createLooks();
  }

  async function loadBrandOptions(): Promise<readonly FacetOption[]> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch("/api/fitting-room/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          mode: "brands",
          vendorId,
          hubSlug,
          audience
        })
      });
      if (!response.ok) throw new Error("brands");
      const payload = await response.json() as { brands?: FacetOption[] };
      return (payload.brands ?? [])
        .filter((entry) => entry?.label?.trim())
        .slice(0, 80);
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function loadCandidateProducts(): Promise<readonly Product[]> {
    const body = JSON.stringify({
      vendorId,
      hubSlug,
      audience,
      brands,
      budgetMinor: euroBudget(budget) ?? 0
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch("/api/fitting-room/candidates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body
        });
        if (!response.ok) {
          if (response.status === 503 && attempt === 0) {
            const retryAfter = Number(response.headers.get("retry-after") ?? "1");
            await new Promise((resolve) => window.setTimeout(resolve, Math.max(500, Math.min(2000, retryAfter * 1000))));
            continue;
          }
          throw new Error("catalogue");
        }
        const payload = await response.json() as { products?: Product[] };
        return [...new Map((payload.products ?? []).map((product) => [product.id, product] as const)).values()]
          .filter((product) => product.priceMinor > 0 && slotFor(product) && isAudienceCompatible(product, audience));
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 700));
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("catalogue");
  }

  function buildLook(candidateProducts: readonly Product[], personality: number): Look {
    const meta = LOOK_PERSONALITIES[personality];
    const budgetMinor = euroBudget(budget);
    let remaining = budgetMinor ?? Number.POSITIVE_INFINITY;
    const slots: Partial<Record<SlotKey, Product>> = {};

    const ranked = (slot: SlotKey) => candidateProducts
      .filter((product) => isAudienceCompatible(product, audience) && slotFor(product) === slot)
      .map((product) => ({
        product,
        score: productScore(product, slot, audience, sizes, colors, brands, personality, occasion, slots)
      }))
      .filter((entry) => entry.score > 20)
      .sort((left, right) => right.score - left.score || left.product.priceMinor - right.product.priceMinor)
      .map((entry) => entry.product);

    const choose = (slot: SlotKey, seed: number, optional = false) => {
      const options = ranked(slot);
      const affordable = options.filter((product) => product.priceMinor <= remaining);
      if (!affordable.length) return;
      const pool = affordable.slice(0, 8);
      const selected = pool[Math.min(seed, pool.length - 1)] ?? pool[0];
      if (!selected) return;
      if (optional && budgetMinor && selected.priceMinor > Math.max(remaining * 0.72, budgetMinor * 0.28)) return;
      slots[slot] = selected;
      remaining -= selected.priceMinor;
    };

    choose("main", personality);
    if (!isStandaloneOutfit(slots.main)) choose("bottom", personality % 2);
    choose("shoes", personality);
    choose("layer", personality, true);
    choose("bag", personality, true);
    choose("accessory", personality + 1, true);
    choose("beauty", personality, true);
    if (audience === "women") {
      choose("lipstick", personality, true);
      choose("nails", personality + 1, true);
    }
    choose("fragrance", personality + 1, true);

    const occasionMeta = occasionDetails(occasion);
    return {
      ...meta,
      mood: `${meta.mood} · ${occasionMeta.label}`,
      note: `${meta.note} ${occasionMeta.guidance}`,
      slots
    };
  }

  async function createLooks() {
    setLoading(true);
    setLoadError("");
    setSaveStatus("");
    setShareStatus("");
    try {
      const candidateProducts = products.length ? products : await loadCandidateProducts();
      setProducts(candidateProducts);
      if (!candidateProducts.length) throw new Error("empty");
      const nextLooks = [0, 1, 2].map((personality) => buildLook(candidateProducts, personality));
      if (!nextLooks.some((look) => Object.keys(look.slots).length > 0)) throw new Error("empty");
      const ownLook: Look = {
        name: "My Edit",
        mood: "Το δικό σου look · από την αρχή",
        note: "Διάλεξε εσύ κάθε κομμάτι. Ο stylist κρατά τις επιλογές σου και σου δείχνει διαθέσιμες εναλλακτικές σε κάθε θέση.",
        slots: {}
      };
      setLooks([...nextLooks, ownLook]);
      setActiveLook(0);
      setEditingSlot(null);
    } catch {
      setLoadError("Το fitting room δεν μπόρεσε να φορτώσει αρκετές διαθέσιμες επιλογές αυτή τη στιγμή. Δοκίμασε ξανά.");
    } finally {
      setLoading(false);
    }
  }

  function replaceSlot(slot: SlotKey, product: Product) {
    setLooks((current) => current.map((look, index) => {
      if (index !== activeLook) return look;
      const next = { ...look.slots, [slot]: product };
      if (slot === "main" && isStandaloneOutfit(product)) delete next.bottom;
      if (slot === "main" && isSuitLike(product) && isBlazerLike(next.layer)) delete next.layer;
      return { ...look, slots: next };
    }));
    setEditingSlot(null);
    setSaveStatus("");
    setShareStatus("");
  }

  function removeSlot(slot: SlotKey) {
    setLooks((current) => current.map((look, index) => {
      if (index !== activeLook) return look;
      const next = { ...look.slots };
      delete next[slot];
      return { ...look, slots: next };
    }));
    setEditingSlot(null);
  }

  function currentLookPayload() {
    if (!currentLook) return undefined;
    const composition = Object.entries(currentLook.slots).flatMap(([slot, value]) =>
      value ? [{ ...compactProduct(value), slot }] : []
    );
    return {
      name: currentLook.name,
      audience,
      source: activeLook < 3 ? "konta" : "user",
      profile: {
        audience,
        sizes,
        colours: colors,
        budgetMinor: euroBudget(budget),
        brands,
        occasion
      },
      composition
    };
  }

  async function persistCurrentLook(): Promise<SavedLookPayload> {
    const body = currentLookPayload();
    if (!body) throw new Error("look");

    if (persistedLook?.id) {
      const response = await fetch(`/api/account/style-looks/${encodeURIComponent(persistedLook.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as { look?: SavedLookPayload; error?: string };
      if (!response.ok || !payload.look) throw new Error(payload.error || "save");
      setPersistedLook({ id: payload.look.id, shareEnabled: payload.look.shareEnabled, shareToken: payload.look.shareToken });
      return payload.look;
    }

    const response = await fetch("/api/account/style-looks", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken ?? "" },
      body: JSON.stringify(body)
    });
    const payload = await response.json() as { look?: SavedLookPayload; error?: string };
    if (!response.ok || !payload.look) throw new Error(payload.error || "save");
    setPersistedLook({ id: payload.look.id, shareEnabled: payload.look.shareEnabled, shareToken: payload.look.shareToken });
    return payload.look;
  }

  async function shareCurrentLook() {
    if (!currentLook) return;
    if (Object.keys(currentLook.slots).length === 0) {
      setShareStatus("Διάλεξε πρώτα τουλάχιστον ένα κομμάτι.");
      return;
    }
    if (!csrfToken) {
      setShareStatus("Συνδέσου για να δημιουργήσεις ένα σύντομο, μόνιμο share link.");
      return;
    }

    setShareStatus("Δημιουργία share link…");
    try {
      const saved = await persistCurrentLook();
      let shared = saved;
      if (!saved.shareEnabled || !saved.shareToken) {
        const response = await fetch(`/api/account/style-looks/${encodeURIComponent(saved.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ shareEnabled: true })
        });
        const payload = await response.json() as { look?: SavedLookPayload; error?: string };
        if (!response.ok || !payload.look) throw new Error(payload.error || "share");
        shared = payload.look;
        setPersistedLook({ id: shared.id, shareEnabled: shared.shareEnabled, shareToken: shared.shareToken });
      }

      const code = shared.shareToken ? styleLookShareCodeFromToken(shared.shareToken) : undefined;
      if (!code) throw new Error("share-code");
      const url = new URL(`/look/${code}`, window.location.origin).toString();

      if (navigator.share) {
        await navigator.share({
          title: `${currentLook.name} · KONTA MOY Style Builder`,
          text: "Δες το look που έφτιαξα στο KONTA MOY.",
          url
        });
        setShareStatus("Το look είναι έτοιμο να μοιραστεί.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("Το σύντομο link αντιγράφηκε.");
      }
    } catch {
      setShareStatus("Δεν μπόρεσε να δημιουργηθεί το share link. Δοκίμασε ξανά.");
    }
  }

  async function saveCurrentLook() {
    if (!currentLook) return;
    if (Object.keys(currentLook.slots).length === 0) {
      setSaveStatus("Διάλεξε πρώτα τουλάχιστον ένα κομμάτι.");
      return;
    }
    if (!csrfToken) {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    setSaveStatus("Αποθήκευση…");
    try {
      await persistCurrentLook();
      setSaveStatus("Αποθηκεύτηκε στο account σου.");
    } catch {
      setSaveStatus("Δεν μπόρεσε να αποθηκευτεί. Δοκίμασε ξανά.");
    }
  }

  if (!started && !currentLook) {
    return (
      <section className={styles.entry}>
        <div className={styles.curtainLeft} aria-hidden="true" />
        <div className={styles.curtainRight} aria-hidden="true" />
        <div className={styles.entryInner}>
          <div className={styles.consultantBadge}><span>K</span><div><strong>Ο προσωπικός σου stylist</strong><small>KONTA MOY Fitting Room</small></div></div>
          <p className={styles.eyebrow}>PRIVATE FITTING ROOM</p>
          <h1>Μπες. Πες μου τι σου αρέσει.<br /><em>Θα στήσουμε το look μαζί.</em></h1>
          <p className={styles.entryLead}>Περίσταση, μέγεθος, χρώμα, budget και brands. Μετά θα σου δείξω τρεις ολοκληρωμένες προτάσεις {vendorId ? "από το συγκεκριμένο κατάστημα" : `με διαθέσιμα προϊόντα από όλο το HUB ${hubName}`} που αλλάζουν κομμάτι-κομμάτι.</p>
          <button className={styles.primaryButton} type="button" onClick={() => { setStarted(true); enterImmersive(); }}>Μπες στο fitting room <span>→</span></button>
          <div className={styles.entryFoot}><span>3 έτοιμα looks</span><span>Αλλάζεις ό,τι θέλεις</span><span>Save & share</span></div>
        </div>
      </section>
    );
  }

  if (started && !looks.length && !immersive) {
    return (
      <section className={styles.entry}>
        <div className={styles.curtainLeft} aria-hidden="true" />
        <div className={styles.curtainRight} aria-hidden="true" />
        <div className={styles.entryInner}>
          <div className={styles.consultantBadge}><span>K</span><div><strong>Ο προσωπικός σου stylist</strong><small>KONTA MOY Fitting Room</small></div></div>
          <p className={styles.eyebrow}>STYLE SESSION IN PROGRESS</p>
          <h1>Η συνεδρία σου είναι εδώ.<br /><em>Συνέχισε από εκεί που σταμάτησες.</em></h1>
          <p className={styles.entryLead}>Οι επιλογές σου παραμένουν όπως τις άφησες. Το Fitting Room θα ανοίξει ξανά σε πλήρη οθόνη.</p>
          <button className={styles.primaryButton} type="button" onClick={enterImmersive}>Συνέχισε σε full screen <span>→</span></button>
        </div>
      </section>
    );
  }

  if (started && !looks.length) {
    if (loading) {
      const loadingSlides = [
        LOADING_SLIDES.fitting,
        audience === "men" ? LOADING_SLIDES.men : LOADING_SLIDES.women,
        LOADING_SLIDES.curated,
        LOADING_SLIDES.ready
      ];

      return (
        <div className={styles.fullscreenTakeover} role="dialog" aria-modal="true" aria-label="KONTA MOY Fitting Room">
          <section className={styles.loadingRoom}>
            <div className={styles.loadingSlides} aria-hidden="true">
              {loadingSlides.map((src, index) => (
                <div
                  className={styles.loadingSlide}
                  key={src}
                  style={{ animationDelay: `${index * 2}s` }}
                >
                  <img className={styles.loadingBackdrop} src={src} alt="" loading="eager" decoding="async" />
                  <img className={styles.loadingArtwork} src={src} alt="" loading="eager" decoding="async" />
                </div>
              ))}
            </div>

            <button className={styles.loadingExit} type="button" onClick={leaveImmersive} aria-label="Έξοδος από το fitting room">×</button>

            <div className={styles.loadingStatus} role="status" aria-live="polite">
              <span className={styles.loadingEyebrow}>KONTA MOY · FITTING ROOM</span>
              <strong>Ο stylist χτίζει το look σου…</strong>
              <p>Λίγο ακόμη — διαλέγουμε τα κομμάτια που ταιριάζουν σε σένα.</p>
              <div className={styles.loadingBar} aria-hidden="true"><i /></div>
            </div>
          </section>
        </div>
      );
    }

    const questions = [
      {
        title: "Για ποιο styling ψάχνουμε;",
        copy: "Ξεκινάμε από εδώ για να σου δείξω τις σωστές γραμμές, εφαρμογές και κατηγορίες.",
        content: (
          <div className={styles.choiceGrid}>
            <button className={audience === "women" ? styles.choiceActive : styles.choice} onClick={() => setAudience("women")} type="button"><span>♀</span><strong>Female styling</strong><small>Fashion · beauty · nails · accessories</small></button>
            <button className={audience === "men" ? styles.choiceActive : styles.choice} onClick={() => setAudience("men")} type="button"><span>♂</span><strong>Male styling</strong><small>Fashion · grooming · shoes · accessories</small></button>
          </div>
        )
      },
      {
        title: "Πού θα φορέσεις το look;",
        copy: "Η περίσταση αλλάζει τα πάντα: τι θεωρείται σωστό, πόσο formal πρέπει να είναι το look και ποια κομμάτια ταιριάζουν πραγματικά μεταξύ τους.",
        content: (
          <div className={styles.choiceGrid}>
            {OCCASIONS.map((entry) => {
              const active = occasion === entry.key;
              return <button className={active ? styles.choiceActive : styles.choice} onClick={() => setOccasion(entry.key)} type="button" key={entry.key}>
                <span>{entry.icon}</span><strong>{entry.label}</strong><small>{entry.copy}</small>
              </button>;
            })}
          </div>
        )
      },
      {
        title: "Πες μου τα μεγέθη σου.",
        copy: "Συμπλήρωσε μόνο όσα γνωρίζεις. Δεν χρειάζεται να έχεις όλες τις μετρήσεις για να συνεχίσουμε.",
        content: (
          <div className={styles.sizeGrid}>
            <label><span>Tops / T-shirts</span><input value={sizes.top} onChange={(event) => setSizes({ ...sizes, top: event.target.value })} placeholder="π.χ. M / 40" /></label>
            <label><span>Shirts</span><input value={sizes.shirt} onChange={(event) => setSizes({ ...sizes, shirt: event.target.value })} placeholder="π.χ. M / 39" /></label>
            <label><span>Jackets / coats</span><input value={sizes.jacket} onChange={(event) => setSizes({ ...sizes, jacket: event.target.value })} placeholder="π.χ. M / 48" /></label>
            <label><span>Waist</span><input value={sizes.waist} onChange={(event) => setSizes({ ...sizes, waist: event.target.value })} placeholder="π.χ. W32 / 82 cm" /></label>
            <label><span>Trousers</span><input value={sizes.trouser} onChange={(event) => setSizes({ ...sizes, trouser: event.target.value })} placeholder="π.χ. 42 / W32" /></label>
            <label><span>Shoes</span><input value={sizes.shoe} onChange={(event) => setSizes({ ...sizes, shoe: event.target.value })} placeholder="π.χ. EU 42" /></label>
            {audience === "women" ? <label><span>Skirts</span><input value={sizes.skirt} onChange={(event) => setSizes({ ...sizes, skirt: event.target.value })} placeholder="π.χ. S / 38" /></label> : null}
            {audience === "women" ? <label><span>Dresses</span><input value={sizes.dress} onChange={(event) => setSizes({ ...sizes, dress: event.target.value })} placeholder="π.χ. S / 38" /></label> : null}
            {audience === "women" ? <label><span>Bra</span><input value={sizes.bra} onChange={(event) => setSizes({ ...sizes, bra: event.target.value })} placeholder="π.χ. 75C" /></label> : null}
            <label><span>Belts</span><input value={sizes.belt} onChange={(event) => setSizes({ ...sizes, belt: event.target.value })} placeholder="π.χ. 90 cm" /></label>
          </div>
        )
      },
      {
        title: "Ποια χρώματα είναι «εσύ»;",
        copy: "Διάλεξε μέχρι τρία. Δεν θα σε κλειδώσουν — απλώς θα δώσουν κατεύθυνση στο fitting room.",
        content: (
          <div className={styles.colorGrid}>
            {COLOR_CHOICES.map((color) => {
              const active = colors.includes(color.key);
              return <button key={color.key} type="button" className={active ? styles.colorActive : styles.colorChoice} onClick={() => toggleColor(color.key)} aria-pressed={active}>
                <span className={styles.swatch} style={{ background: color.hex }} />
                <strong>{color.label}</strong>
              </button>;
            })}
          </div>
        )
      },
      {
        title: "Θέλεις να κρατήσουμε κάποιο budget;",
        copy: "Προαιρετικό. Αν βάλεις όριο, θα προσπαθήσω να κρατήσω ολόκληρη τη σύνθεση μέσα σε αυτό.",
        content: (
          <div className={styles.budgetPanel}>
            <div className={styles.budgetQuick}>
              {["75", "120", "200", "300", "500"].map((value) => <button type="button" key={value} onClick={() => setBudget(value)} className={budget === value ? styles.budgetActive : undefined}>€{value}</button>)}
              <button type="button" onClick={() => setBudget("")} className={!budget ? styles.budgetActive : undefined}>Χωρίς όριο</button>
            </div>
            <label className={styles.customBudget}><span>Ή δώσε δικό σου όριο</span><div><b>€</b><input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^0-9.,]/g, "").slice(0, 8))} placeholder="π.χ. 180" /></div></label>
          </div>
        )
      },
      {
        title: "Υπάρχουν brands που αγαπάς;",
        copy: "Κι αυτό είναι προαιρετικό. Μπορείς να διαλέξεις μέχρι πέντε ή να αφήσεις τον stylist ελεύθερο.",
        content: (
          <div className={styles.brandPanel}>
            <input className={styles.brandSearch} value={brandSearch} onChange={(event) => setBrandSearch(event.target.value)} placeholder="Αναζήτησε brand…" />
            {brands.length ? <div className={styles.selectedBrands}>{brands.map((brand) => <button key={brand} type="button" onClick={() => toggleBrand(brand)}>{brand} ×</button>)}</div> : null}
            <div className={styles.brandGrid}>{brandOptions.map((brand) => {
              const active = brands.includes(brand);
              return <button type="button" key={brand} className={active ? styles.brandActive : undefined} onClick={() => toggleBrand(brand)}>{brand}</button>;
            })}</div>
            {prefetching ? <p className={styles.muted}>{vendorId ? "Βρίσκω τα διαθέσιμα brands του καταστήματος…" : `Βρίσκω διαθέσιμα brands από όλο το HUB ${hubName}…`}</p> : brandsLoaded && !brandOptions.length ? <p className={styles.muted}>Δεν χρειάζεται να επιλέξεις brand για να συνεχίσουμε.</p> : null}
          </div>
        )
      }
    ] as const;

    const question = questions[step];

    return (
      <div className={styles.fullscreenTakeover} role="dialog" aria-modal="true" aria-label="KONTA MOY Fitting Room">
      <section className={styles.room}>
        <div className={styles.roomHeader}>
          <button type="button" className={styles.exit} onClick={leaveImmersive}>× Έξοδος</button>
          <div className={styles.roomWordmark}><strong>FITTING ROOM</strong><span>by KONTA MOY</span></div>
          <span className={styles.stepCount}>{step + 1} / 6</span>
        </div>
        <div className={styles.roomBody}>
          <aside className={styles.consultant}>
            <div className={styles.consultantPortrait}><span>K</span></div>
            <div><small>YOUR CONSULTANT</small><strong>KONTA MOY Stylist</strong><p>{question.copy}</p></div>
          </aside>
          <div className={styles.questionCard}>
            <div className={styles.progress}><i style={{ width: `${((step + 1) / 6) * 100}%` }} /></div>
            <p className={styles.questionEyebrow}>STYLE SESSION · STEP {String(step + 1).padStart(2, "0")}</p>
            <h2>{question.title}</h2>
            {question.content}
            {loadError ? <p className={styles.error} role="alert">{loadError}</p> : null}
            <div className={styles.questionActions}>
              {step > 0 ? <button type="button" className={styles.secondaryButton} onClick={() => setStep((step - 1) as Step)}>← Πίσω</button> : <span />}
              <button type="button" className={styles.primaryButton} disabled={loading} onClick={nextStep}>{loading ? "Ο stylist ετοιμάζει τα looks…" : step === 5 ? "Δείξε μου τα looks →" : "Συνέχεια →"}</button>
            </div>
          </div>
        </div>
      </section>
      </div>
    );
  }

  if (!currentLook) return null;

  if (!immersive) {
    return (
      <section className={styles.entry}>
        <div className={styles.curtainLeft} aria-hidden="true" />
        <div className={styles.curtainRight} aria-hidden="true" />
        <div className={styles.entryInner}>
          <div className={styles.consultantBadge}><span>K</span><div><strong>Το look σου σε περιμένει</strong><small>KONTA MOY Fitting Room</small></div></div>
          <p className={styles.eyebrow}>YOUR FITTING ROOM</p>
          <h1>{currentLook.name}<br /><em>Συνέχισε σε πλήρη οθόνη.</em></h1>
          <p className={styles.entryLead}>Το look και οι αλλαγές σου έχουν μείνει ακριβώς όπως ήταν.</p>
          <button className={styles.primaryButton} type="button" onClick={enterImmersive}>Άνοιξε το fitting room <span>→</span></button>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.fullscreenTakeover} role="dialog" aria-modal="true" aria-label="KONTA MOY Fitting Room">
    <section className={styles.lookRoom}>
      <div className={styles.lookTopBar}>
        <div>
          <span>KONTA MOY</span>
          <strong>FITTING ROOM</strong>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={styles.exitGameButton} onClick={leaveImmersive} aria-label="Έξοδος από την πλήρη οθόνη">×</button>
          <button type="button" onClick={() => { setLooks([]); setProducts([]); setStep(0); setStarted(true); setEditingSlot(null); }}>Νέα συνεδρία</button>
          <button type="button" onClick={() => void shareCurrentLook()}>Share</button>
          <button type="button" className={styles.saveButton} onClick={() => void saveCurrentLook()}>Save look</button>
        </div>
      </div>

      <div className={styles.lookLayout}>
        <aside className={styles.lookConsultant}>
          <div className={styles.consultantPortrait}><span>K</span></div>
          <small>YOUR CONSULTANT</small>
          <h2>{currentLook.name}</h2>
          <strong>{currentLook.mood}</strong>
          <p>{currentLook.note}</p>
          <div className={styles.consultantTip}>Πάτησε πάνω σε οποιοδήποτε κομμάτι για να το αλλάξουμε χωρίς να χαλάσουμε το υπόλοιπο look.</div>
          <div className={styles.lookTotal}><span>Σύνολο look</span><strong>{formatTotal(totalMinor(currentLook))}</strong>{budget ? <small>Budget που έδωσες: €{budget}</small> : null}</div>
          {saveStatus ? <p className={styles.status}>{saveStatus}</p> : null}
          {shareStatus ? <p className={styles.status}>{shareStatus}</p> : null}
          <Link className={styles.accountLink} href="/account/saved">Τα αποθηκευμένα μου looks →</Link>
        </aside>

        <div className={styles.lookStage}>
          {looks.length > 1 ? <div className={styles.lookTabs}>{looks.map((look, index) => <button key={look.name} type="button" className={activeLook === index ? styles.lookTabActive : undefined} onClick={() => { setActiveLook(index); setEditingSlot(null); }}><span>{index < 3 ? `0${index + 1}` : "YOU"}</span><strong>{look.name}</strong></button>)}</div> : null}

          <div className={styles.composition}>
            {slotsForAudience(audience).filter((slot) => !(slot === "bottom" && isStandaloneOutfit(currentLook.slots.main))).map((slot) => {
              const meta = slotMeta(slot, audience);
              const product = currentLook.slots[slot];
              if (!product) return <button type="button" className={styles.emptySlot} key={slot} onClick={() => setEditingSlot(slot)}>
                <span>{meta.short}</span><strong>+ {meta.label}</strong>
                <small>{activeLook === 3 ? "Διάλεξε το κομμάτι που θέλεις." : "Πρόσθεσε ή άλλαξε αυτό το σημείο του look."}</small>
              </button>;
              return <article className={styles.productSlot} key={slot}>
                <button type="button" className={styles.productButton} onClick={() => setEditingSlot(slot)}>
                  <div className={styles.productImage}><ProductArtwork product={product} alt={product.mediaAlt || product.title} /><b>Αλλαγή</b></div>
                  <div className={styles.productCopy}><small>{meta.short}</small><strong>{product.title}</strong><span>{product.brand || product.categoryLabel || meta.label}{!vendorId && product.vendorName ? ` · ${product.vendorName}` : ""}</span><em>{product.price}</em></div>
                </button>
                <Link className={styles.productDetailLink} href={productPublicPath(product)} prefetch={false}>Δες το προϊόν ↗</Link>
              </article>;
            })}
          </div>
        </div>
      </div>

      {editingSlot ? <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingSlot(null); }}>
        <aside className={styles.drawer} aria-label={`Αλλαγή ${slotMeta(editingSlot, audience).label}`}>
          <div className={styles.drawerHead}><div><small>KEEP THE LOOK · CHANGE ONE PIECE</small><h3>{slotMeta(editingSlot, audience).label}</h3></div><button type="button" onClick={() => setEditingSlot(null)}>×</button></div>
          <div className={styles.alternativeGrid}>{alternatives.map((product) => {
            return <button type="button" key={product.id} className={styles.alternativeCard} onClick={() => replaceSlot(editingSlot, product)}>
              <div><ProductArtwork product={product} alt="" /></div>
              <small>{product.brand || product.categoryLabel || "KONTA MOY"}{!vendorId && product.vendorName ? ` · ${product.vendorName}` : ""}</small>
              <strong>{product.title}</strong>
              <em>{product.price}</em>
            </button>;
          })}</div>
          {alternativeLoading ? <p className={styles.drawerEmpty}>Ο stylist φέρνει άλλες επιλογές…</p> : null}
          {!alternativeLoading && !alternatives.length ? <p className={styles.drawerEmpty}>Δεν υπάρχουν άλλες διαθέσιμες επιλογές για αυτό το κομμάτι αυτή τη στιγμή.</p> : null}
          {slotMeta(editingSlot, audience).optional ? <button type="button" className={styles.removeButton} onClick={() => removeSlot(editingSlot)}>Αφαίρεσε αυτό το κομμάτι από το look</button> : null}
        </aside>
      </div> : null}
    </section>
  </div>
  );
}
