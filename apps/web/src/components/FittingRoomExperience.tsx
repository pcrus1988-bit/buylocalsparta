"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { productPublicPath } from "../lib/product-url";
import { styleLookShareCodeFromToken } from "../lib/style-look-share-code";
import styles from "./FittingRoomExperience.module.css";

type Audience = "women" | "men";
type Step = 0 | 1 | 2 | 3 | 4;
type SlotKey = "main" | "bottom" | "layer" | "shoes" | "bag" | "accessory" | "beauty" | "nails";

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
  beauty: { label: "Beauty", short: "BEAUTY", optional: true },
  nails: { label: "Νύχια", short: "NAILS", optional: true }
};

const WOMEN_SLOTS: readonly SlotKey[] = ["main", "bottom", "layer", "shoes", "bag", "accessory", "beauty", "nails"];
const MEN_SLOTS: readonly SlotKey[] = ["main", "bottom", "layer", "shoes", "bag", "accessory", "beauty"];

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

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[_-]+/g, " ")
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

function slotFromText(text: string): SlotKey | null {
  if (/nail|polish|lacquer|βερνικ|νυχι/.test(text)) return "nails";
  if (/lip|makeup|mascara|foundation|concealer|blush|eyeshadow|perfume|fragrance|cosmetic|skincare|serum|cream|beauty|grooming|κραγιον|μακιγιαζ|αρωμ|ομορφ|περιποι/.test(text)) return "beauty";
  if (/shoe|sneaker|trainer|boot|loafer|moccas|sandal|heel|pump|footwear|παπουτ|μποτ|σανδαλ/.test(text)) return "shoes";
  if (/bag|handbag|backpack|clutch|wallet|purse|τσαντ|σακιδ|πορτοφολ/.test(text)) return "bag";
  if (/necklace|earring|bracelet|ring|watch|sunglass|eyewear|belt|scarf|hat|jewel|κολιε|σκουλαρ|βραχιολ|δαχτυλ|ρολογ|γυαλ|ζων|κασκολ|καπελ|κοσμη/.test(text)) return "accessory";
  if (/jacket|coat|blazer|cardigan|overshirt|parka|trench|μπουφαν|παλτο|σακακι|ζακετ/.test(text)) return "layer";
  if (/trouser|pants|jean|skirt|shorts|legging|chino|παντελον|τζιν|φουστ|σορτ/.test(text)) return "bottom";
  if (/dress|jumpsuit|overall|φορεμ|ολόσωμ|ολοσωμ|shirt|t shirt|t-shirt|top|blouse|sweater|knit|hoodie|polo|πουκαμισ|μπλουζ|πλεκ|φουτερ/.test(text)) return "main";
  return null;
}

function slotFor(product: Product): SlotKey | null {
  return slotFromText(productText(product));
}

function isOnePiece(product: Product | undefined): boolean {
  if (!product) return false;
  return /dress|jumpsuit|overall|φορεμ|ολόσωμ|ολοσωμ/.test(productText(product));
}

const WOMEN_ONLY_BEAUTY = new Set(["lip-makeup", "face-makeup", "eye-makeup", "nail-care-colour"]);
const MEN_ONLY_BEAUTY = new Set(["grooming-care"]);

function hasWomenSignal(text: string): boolean {
  return /(?:^|\s)(?:women|woman|womens|female|lady|ladies|donna|femme|girl)(?:\s|$)|γυναικ/.test(text);
}

function hasMenSignal(text: string): boolean {
  return /(?:^|\s)(?:men|mens|man|male|uomo|homme|boy)(?:\s|$)|ανδρ/.test(text);
}

function isAudienceCompatible(product: Product, audience: Audience): boolean {
  const category = normalize(product.categoryCode);
  if (audience === "men" && WOMEN_ONLY_BEAUTY.has(product.categoryCode)) return false;
  if (audience === "women" && MEN_ONLY_BEAUTY.has(product.categoryCode)) return false;
  if (audience === "men" && /(?:^|\s)(?:women|woman|womens|female)(?:\s|$)|γυναικ/.test(category)) return false;
  if (audience === "women" && /(?:^|\s)(?:men|mens|man|male)(?:\s|$)|ανδρ/.test(category)) return false;

  const text = productText(product);
  const women = hasWomenSignal(text);
  const men = hasMenSignal(text);
  if (audience === "men" && women && !men) return false;
  if (audience === "women" && men && !women) return false;
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

function personalityScore(product: Product, personality: number): number {
  const text = productText(product);
  if (personality === 0) {
    return /black|white|beige|navy|cream|classic|basic|minimal|λευκ|μαυρ|μπεζ/.test(text) ? 10 : 0;
  }
  if (personality === 1) {
    return /blazer|leather|denim|loafer|heel|watch|structured|tailor|σακακ|δερμα|τζιν/.test(text) ? 12 : 0;
  }
  return /red|pink|purple|gold|silver|metallic|sequin|glitter|statement|burgundy|κοκκιν|ροζ|χρυσ|ασημ/.test(text) ? 16 : 0;
}

function productScore(
  product: Product,
  slot: SlotKey,
  audience: Audience,
  sizes: SizeProfile,
  colors: readonly string[],
  brands: readonly string[],
  personality: number
): number {
  let score = 50;
  score += audiencePenalty(product, audience);
  score += matchesSize(product, slot, sizes);
  score += colorAffinity(product, colors);
  score += personalityScore(product, personality);
  if (product.brand && brands.some((brand) => normalize(brand) === normalize(product.brand))) score += 34;
  if (product.available !== false && (product.availableToSell ?? 1) > 0) score += 8;
  return score;
}

function imageFor(product: Product): string | undefined {
  if (product.imageSrc) return product.imageSrc;
  if (product.mediaId) return `/api/media/${encodeURIComponent(product.mediaId)}`;
  if (product.sourceImageAvailable) return `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  return undefined;
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

function encodeShareLook(look: Look): string {
  const payload = {
    v: 1,
    n: look.name,
    m: look.mood,
    x: look.note,
    s: Object.fromEntries(Object.entries(look.slots).map(([key, value]) => [key, value ? compactProduct(value) : undefined]))
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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

export function FittingRoomExperience({
  vendorId,
  csrfToken,
  savedLookId
}: {
  vendorId: string;
  csrfToken?: string;
  savedLookId?: string;
}) {
  const [started, setStarted] = useState(false);
  const [step, setStep] = useState<Step>(0);
  const [audience, setAudience] = useState<Audience>("women");
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
    const controller = new AbortController();
    void fetch(`/api/catalog/vendor/${encodeURIComponent(vendorId)}?facets=1&facetsOnly=1`, {
      signal: controller.signal,
      cache: "default"
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("facets");
        return response.json() as Promise<{ facets?: Facets | null }>;
      })
      .then((payload) => setFacets(payload.facets ?? {}))
      .catch(() => {
        if (!controller.signal.aborted) setFacets({});
      });
    return () => controller.abort();
  }, [vendorId]);

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
          const slot = item.slot as SlotKey;
          if (!slotsForAudience(saved.audience).includes(slot)) continue;
          if (!isAudienceCompatible(item, saved.audience)) continue;
          slots[slot] = item;
        }
        if (!Object.keys(slots).length) return;
        setAudience(saved.audience);
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
    setEditingSlot(null);
  }, [audience, vendorId]);

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
        score: productScore(product, editingSlot, audience, sizes, colors, brands, activeLook < 3 ? activeLook : 0)
      }))
      .filter((entry) => entry.score > -40)
      .sort((left, right) => right.score - left.score || left.product.priceMinor - right.product.priceMinor)
      .slice(0, 12)
      .map((entry) => entry.product);
  }, [activeLook, audience, brands, colors, currentLook, editingSlot, products, sizes]);

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
    if (step < 4) setStep((step + 1) as Step);
    else void createLooks();
  }

  async function loadCandidateProducts(): Promise<readonly Product[]> {
    const body = JSON.stringify({
      vendorId,
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
        score: productScore(product, slot, audience, sizes, colors, brands, personality)
      }))
      .filter((entry) => entry.score > -40)
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
    if (!isOnePiece(slots.main)) choose("bottom", personality % 2);
    choose("shoes", personality);
    choose("layer", personality, true);
    choose("bag", personality, true);
    choose("accessory", personality + 1, true);
    choose("beauty", personality, true);
    if (audience === "women") choose("nails", personality + 1, true);

    return { ...meta, slots };
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
    setLooks((current) => current.map((look, index) => index === activeLook
      ? { ...look, slots: { ...look.slots, [slot]: product } }
      : look));
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
        brands
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
          <p className={styles.entryLead}>Μέγεθος, χρώμα, budget και brands. Μετά θα σου δείξω τρεις ολοκληρωμένες προτάσεις που μπορείς να αλλάξεις κομμάτι-κομμάτι.</p>
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
            {!brandOptions.length ? <p className={styles.muted}>Δεν χρειάζεται να επιλέξεις brand για να συνεχίσουμε.</p> : null}
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
          <span className={styles.stepCount}>{step + 1} / 5</span>
        </div>
        <div className={styles.roomBody}>
          <aside className={styles.consultant}>
            <div className={styles.consultantPortrait}><span>K</span></div>
            <div><small>YOUR CONSULTANT</small><strong>KONTA MOY Stylist</strong><p>{question.copy}</p></div>
          </aside>
          <div className={styles.questionCard}>
            <div className={styles.progress}><i style={{ width: `${((step + 1) / 5) * 100}%` }} /></div>
            <p className={styles.questionEyebrow}>STYLE SESSION · STEP {String(step + 1).padStart(2, "0")}</p>
            <h2>{question.title}</h2>
            {question.content}
            {loadError ? <p className={styles.error} role="alert">{loadError}</p> : null}
            <div className={styles.questionActions}>
              {step > 0 ? <button type="button" className={styles.secondaryButton} onClick={() => setStep((step - 1) as Step)}>← Πίσω</button> : <span />}
              <button type="button" className={styles.primaryButton} disabled={loading} onClick={nextStep}>{loading ? "Ο stylist ετοιμάζει τα looks…" : step === 4 ? "Δείξε μου τα looks →" : "Συνέχεια →"}</button>
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
            {slotsForAudience(audience).map((slot) => {
              const meta = slotMeta(slot, audience);
              const product = currentLook.slots[slot];
              if (!product) return <button type="button" className={styles.emptySlot} key={slot} onClick={() => setEditingSlot(slot)}>
                <span>{meta.short}</span><strong>+ {meta.label}</strong>
                <small>{activeLook === 3 ? "Διάλεξε το κομμάτι που θέλεις." : "Πρόσθεσε ή άλλαξε αυτό το σημείο του look."}</small>
              </button>;
              const image = imageFor(product);
              return <article className={styles.productSlot} key={slot}>
                <button type="button" className={styles.productButton} onClick={() => setEditingSlot(slot)}>
                  <div className={styles.productImage}>{image ? <img src={image} alt={product.mediaAlt || product.title} loading="lazy" /> : <span>{product.title.slice(0, 1)}</span>}<b>Αλλαγή</b></div>
                  <div className={styles.productCopy}><small>{meta.short}</small><strong>{product.title}</strong><span>{product.brand || product.categoryLabel || meta.label}</span><em>{product.price}</em></div>
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
            const image = imageFor(product);
            return <button type="button" key={product.id} className={styles.alternativeCard} onClick={() => replaceSlot(editingSlot, product)}>
              <div>{image ? <img src={image} alt="" loading="lazy" /> : <span>{product.title.slice(0, 1)}</span>}</div>
              <small>{product.brand || product.categoryLabel || "KONTA MOY"}</small>
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
