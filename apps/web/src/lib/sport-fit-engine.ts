import { evaluateSportFitRules, SPORT_FIT_RULESET_VERSION } from "./sport-fit-rules.ts";

export const SPORT_ACTIVITIES = ["running", "walking", "gym", "football", "hiking", "basketball", "tennis", "padel", "volleyball"] as const;
export type SportActivity = (typeof SPORT_ACTIVITIES)[number];

export const SPORT_AUDIENCES = ["men", "women", "kids"] as const;
export type SportAudience = (typeof SPORT_AUDIENCES)[number];

export const SPORT_SURFACES = ["road", "treadmill", "mixed", "trail", "indoor", "grass", "artificial", "court_hard", "court_clay", "court_indoor", "court_outdoor", "court_artificial", "sand"] as const;
export type SportSurface = (typeof SPORT_SURFACES)[number];

export const SPORT_FREQUENCIES = ["light", "regular", "high"] as const;
export type SportFrequency = (typeof SPORT_FREQUENCIES)[number];

export const SPORT_DISTANCES = ["short", "medium", "long"] as const;
export type SportDistance = (typeof SPORT_DISTANCES)[number];

export const SPORT_PRIORITIES = ["comfort", "cushioning", "lightweight", "stability", "versatility", "traction", "weather"] as const;
export type SportPriority = (typeof SPORT_PRIORITIES)[number];

export const SPORT_USE_CASES = [
  "daily_training", "easy_run", "recovery_run", "long_run", "speed_training", "race_day",
  "daily_walking", "all_day_standing", "travel_walking",
  "gym_strength", "gym_cardio", "gym_functional",
  "football_training", "football_match",
  "day_hike", "technical_hike", "urban_outdoor",
  "basketball_training", "basketball_match",
  "tennis_training", "tennis_match",
  "padel_training", "padel_match",
  "volleyball_training", "volleyball_match"
] as const;
export type SportUseCase = (typeof SPORT_USE_CASES)[number];

export const SPORT_RUNNER_NEEDS = ["neutral", "guided_support", "wide_fit", "soft_ride", "speed", "all_rounder"] as const;
export type SportRunnerNeed = (typeof SPORT_RUNNER_NEEDS)[number];

export const SPORT_FIT_PREFERENCES = ["standard", "wide", "narrow"] as const;
export type SportFitPreference = (typeof SPORT_FIT_PREFERENCES)[number];

export const SPORT_GYM_TRAINING_TYPES = ["strength", "functional", "cardio", "treadmill", "mixed"] as const;
export type SportGymTrainingType = (typeof SPORT_GYM_TRAINING_TYPES)[number];

export type SportProductRole = "footwear" | "socks" | "top" | "bottom" | "layer" | "accessory" | "other";
export type SportProductTier = "primary" | "secondary" | "unsupported";

export function sportProductTier(role: SportProductRole): SportProductTier {
  if (role === "footwear") return "primary";
  if (role === "socks" || role === "top" || role === "bottom" || role === "layer" || role === "accessory") return "secondary";
  return "unsupported";
}

export type SportKnowledgeStatus = "pending" | "researching" | "partial" | "verified" | "conflict" | "insufficient";
export type SportKnowledgeQueueStatus = "pending" | "leased" | "completed" | "partial" | "failed" | "blocked";

export type SportFitKnowledge = Readonly<{
  status?: SportKnowledgeStatus;
  identityQuality?: "weak" | "medium" | "strong";
  queueStatus?: SportKnowledgeQueueStatus;
  completenessScore?: number;
  evidenceScore?: number;
  activities?: readonly string[];
  surfaces?: readonly string[];
  useCases?: readonly string[];
  cushioningLevel?: string;
  supportLevel?: string;
  fitLengthProfile?: string;
  widthProfile?: string;
  dropMm?: number;
  weightG?: number;
  footballSurfaceCode?: string;
  weatherProtection?: readonly string[];
  sockHeight?: string;
  sockCushioning?: string;
  moistureWicking?: boolean;
  sockArchSupport?: boolean;
  breathabilityLevel?: string;
  thermalLevel?: string;
  compressionLevel?: string;
  reflectiveDetails?: boolean;
}>;

export type SportFitAnswers = Readonly<{
  activity: SportActivity;
  audience: SportAudience;
  size?: string;
  footLengthMm?: number;
  brandSizeHints?: Readonly<Record<string, readonly string[]>>;
  budgetMinor?: number;
  surface?: SportSurface;
  frequency?: SportFrequency;
  distance?: SportDistance;
  priority?: SportPriority;
  runnerNeed?: SportRunnerNeed;
  fitPreference?: SportFitPreference;
  gymTrainingType?: SportGymTrainingType;
  useCase?: SportUseCase;
}>;

export type SportFitRequirementStatus = "match" | "conflict" | "unknown" | "not_applicable";

export type SportFitTechnicalRequirement = Readonly<{
  id: string;
  weight: number;
  status: SportFitRequirementStatus;
  reason?: string;
}>;

export type SportFitProduct = Readonly<{
  id: string;
  familyId?: string;
  slug: string;
  title: string;
  priceMinor: number;
  categoryCode: string;
  categoryLabel?: string;
  brand?: string;
  color?: string;
  sizes: readonly string[];
  fit?: string;
  description?: string;
  attributes?: Readonly<Record<string, string>>;
  vendorId?: string;
  vendorName?: string;
  mediaId?: string;
  mediaAlt?: string;
  previewImageSrc?: string;
  knowledge?: SportFitKnowledge;
  available: boolean;
  availableToSell: number;
}>;

export type SportFitScoredProduct = SportFitProduct & Readonly<{
  role: SportProductRole;
  score: number;
  reasons: readonly string[];
  matchedSize?: string;
  technicalEligible: boolean;
  technicalScore: number;
  technicalCoverage: number;
  technicalRequirements: readonly SportFitTechnicalRequirement[];
  appliedRules: readonly string[];
}>;

export type SportFitRecommendation = Readonly<{
  rulesetVersion: string;
  primary?: SportFitScoredProduct;
  alternatives: readonly SportFitScoredProduct[];
  kit: readonly SportFitScoredProduct[];
  ranked: readonly SportFitScoredProduct[];
}>;

const SIZE_TRAILER = /\s*(?:[-–—]\s*)?(?:EU\s*)?(?:\d{1,2}(?:[.,]\d)?|3XS|2XS|XS|S|M|L|XL|2XL|3XL|4XL|5XL)\s*$/iu;

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampScore(value: number): number {
  // The legacy additive score has more than 100 possible points now that the
  // governed rules layer contributes verified technical evidence. Keep useful
  // headroom so strong candidates do not all collapse to an indistinguishable 100%.
  return Math.max(0, Math.min(100, Math.round(value / 1.25)));
}

function hasAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(normalize(term)));
}

function usableKnowledge(product: SportFitProduct): SportFitKnowledge | undefined {
  const knowledge = product.knowledge;
  if (!knowledge) return undefined;
  if (knowledge.queueStatus === "blocked" || knowledge.status === "conflict" || knowledge.status === "insufficient") return undefined;
  if (knowledge.identityQuality === "weak") return undefined;
  return knowledge;
}

function requestedActivityCodes(answers: SportFitAnswers): readonly string[] {
  if (answers.activity === "running") return ["running"];
  if (answers.activity === "walking") {
    return answers.surface === "trail" || answers.surface === "mixed"
      ? ["walking", "hiking"]
      : ["walking"];
  }
  if (answers.activity === "gym") return ["gym_training", "general_training"];
  if (answers.activity === "football") return ["football", "team_sports"];
  if (answers.activity === "hiking") return ["hiking"];
  if (answers.activity === "basketball") return ["basketball", "team_sports"];
  if (answers.activity === "tennis") return ["tennis", "racket_sports"];
  if (answers.activity === "padel") return ["padel", "racket_sports"];
  return ["volleyball", "team_sports"];
}

function requestedSurfaceCodes(surface: SportSurface): readonly string[] {
  if (surface === "road") return ["road"];
  if (surface === "treadmill") return ["treadmill", "indoor"];
  if (surface === "trail") return ["trail"];
  if (surface === "indoor") return ["indoor"];
  if (surface === "grass") return ["natural_grass_firm", "natural_grass_soft", "multi_ground"];
  if (surface === "artificial") return ["artificial_grass", "turf", "multi_ground"];
  if (surface === "court_hard") return ["court_hard"];
  if (surface === "court_clay") return ["court_clay"];
  if (surface === "court_indoor") return ["court_indoor", "indoor"];
  if (surface === "court_outdoor") return ["court_outdoor"];
  if (surface === "court_artificial") return ["court_artificial"];
  if (surface === "sand") return ["sand"];
  return ["mixed", "road", "trail"];
}

function requestedUseCaseCodes(useCase: SportUseCase | undefined): readonly string[] {
  return useCase ? [useCase] : [];
}

function knowledgeList(values: readonly string[] | undefined): readonly string[] {
  return (values ?? []).map(normalize).filter(Boolean);
}

function normalizedKnowledgeValue(value: string | undefined): string {
  return normalize(value);
}

function hasKnowledgeMatch(values: readonly string[] | undefined, expected: readonly string[]): boolean {
  const normalizedValues = new Set(knowledgeList(values));
  return expected.some((value) => normalizedValues.has(normalize(value)));
}

function matchingSize(product: SportFitProduct, requestedSize: string | undefined, role: SportProductRole): string | undefined {
  const target = normalize(requestedSize).replace(/^eu\s*/, "");
  if (!target || (role !== "footwear" && role !== "socks")) return undefined;

  const exact = product.sizes.find((size) => normalize(size).replace(/^eu\s*/, "") === target);
  if (exact) return exact;
  if (role !== "socks") return undefined;

  const numericTarget = Number(target.replace(",", "."));
  if (!Number.isFinite(numericTarget)) return undefined;
  return product.sizes.find((size) => {
    // Do not use the general search-text normalizer here: it intentionally
    // removes punctuation, which turns a real sock range such as 43-46 into
    // "43 46" before the range parser can inspect it.
    const normalized = size
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("el-GR")
      .trim()
      .replace(/^eu\s*/, "")
      .replace(",", ".")
      .replace(/\s+/g, " ");
    const range = normalized.match(/^(\d{1,2}(?:\.\d+)?)\s*[-–—/]\s*(\d{1,2}(?:\.\d+)?)$/);
    if (!range) return false;
    const min = Number(range[1]);
    const max = Number(range[2]);
    return Number.isFinite(min) && Number.isFinite(max) && numericTarget >= Math.min(min, max) && numericTarget <= Math.max(min, max);
  });
}

function productText(product: SportFitProduct): string {
  return normalize([
    product.title,
    product.categoryCode,
    product.categoryLabel,
    product.brand,
    product.color,
    product.fit,
    product.description,
    ...Object.entries(product.attributes ?? {}).flatMap(([key, value]) => [key, value])
  ].filter(Boolean).join(" "));
}

function strictIdentityText(product: SportFitProduct): string {
  return normalize([product.title, product.categoryCode, product.categoryLabel].filter(Boolean).join(" "));
}

function candidateSupportsRequestedActivity(product: SportFitProduct, answers: SportFitAnswers): boolean {
  if (["running", "walking", "gym", "football"].includes(answers.activity)) return true;

  const knowledge = usableKnowledge(product);
  const knownActivities = knowledgeList(knowledge?.activities);
  if (knownActivities.length > 0) {
    return knownActivities.includes(normalize(answers.activity));
  }

  const text = strictIdentityText(product);
  if (answers.activity === "hiking") return hasAny(text, ["hiking", "terrex", "trail", "πεζοπορ", "outdoor"]);
  if (answers.activity === "basketball") return hasAny(text, ["basketball", "μπασκετ", "μπάσκετ"]);
  if (answers.activity === "tennis") return hasAny(text, ["tennis", "τενις", "τένις"]);
  if (answers.activity === "padel") return hasAny(text, ["padel", "παντελ", "πάντελ"]);
  return hasAny(text, ["volleyball", "volley", "βολει", "βόλεϊ"]);
}

export function sportProductRole(product: SportFitProduct): SportProductRole {
  const category = normalize(product.categoryCode);
  const text = productText(product);

  if (
    category.includes("running shoes")
    || category.includes("sneakers")
    || hasAny(text, ["παπουτσι", "shoe", "sneaker", "trainer", "football boot", "ποδοσφαιρικο"])
  ) return "footwear";
  if (category.includes("socks hosiery") || hasAny(text, ["καλτσ", "sock"])) return "socks";
  if (
    category.includes("shorts")
    || category.includes("trousers")
    || hasAny(text, ["short", "σορτ", "κολαν", "legging", "παντελον", "track pant"])
  ) return "bottom";
  if (
    category.includes("tshirts")
    || category.includes("tops")
    || hasAny(text, ["t shirt", "tshirt", "μπλουζ", "φανελ", "jersey"])
  ) return "top";
  if (
    category.includes("activewear")
    || category.includes("sports clothing")
    || hasAny(text, ["ζακετ", "fleece", "hood", "jacket", "φουτερ"])
  ) return "layer";
  if (
    category.includes("fitness accessories")
    || category.includes("team sports equipment")
    || hasAny(text, ["μπαλα", "ball", "bag", "τσαντ", "bottle", "παγουρ", "glove"])
  ) return "accessory";
  return "other";
}

function activityScore(product: SportFitProduct, answers: SportFitAnswers, text: string, role: SportProductRole): number {
  const category = normalize(product.categoryCode);
  const knowledge = usableKnowledge(product);
  const knownActivities = knowledgeList(knowledge?.activities);
  if (knownActivities.length > 0) {
    const matches = hasKnowledgeMatch(knownActivities, requestedActivityCodes(answers));
    if (matches) {
      if (role === "footwear") return 46;
      if (role === "socks") return 28;
      if (role === "top" || role === "bottom" || role === "layer") return 27;
      if (role === "accessory") return 26;
      return 18;
    }
    // A documented activity mismatch should outweigh optimistic title/category heuristics.
    if (role === "footwear") return 2;
    return 6;
  }

  const runningSignal = category.includes("running shoes") || hasAny(text, ["running", "run ", "δρομ", "τρεξ", "runner"]);
  const footballSignal = category.includes("team sports equipment") || hasAny(text, ["football", "soccer", "futsal", "ποδοσφ", "turf", "tf ", "fg ", "ag "]);
  const gymSignal = category.includes("fitness accessories") || hasAny(text, ["training", "workout", "fitness", "gym", "aeroready", "dry fit", "dri fit"]);
  const outdoorSignal = hasAny(text, ["trail", "terrex", "hiking", "outdoor", "πεζοπορ"]);

  if (answers.activity === "running") {
    if (runningSignal && role === "footwear") return 40;
    if (role === "footwear") return 24;
    if (role === "socks") return 22;
    if (role === "top" || role === "bottom" || role === "layer") return gymSignal ? 20 : 13;
    if (role === "accessory") return 10;
    return outdoorSignal ? 8 : 2;
  }

  if (answers.activity === "walking") {
    if (role === "footwear" && (runningSignal || category.includes("sneakers"))) return 36;
    if (role === "footwear") return 24;
    if (role === "socks") return 22;
    if (role === "top" || role === "bottom" || role === "layer") return 14;
    if (role === "accessory") return outdoorSignal ? 14 : 8;
    return 2;
  }

  if (answers.activity === "gym") {
    if (gymSignal && role === "accessory") return 34;
    if (gymSignal && (role === "top" || role === "bottom" || role === "layer")) return 32;
    if (role === "footwear") return runningSignal ? 24 : 28;
    if (role === "top" || role === "bottom" || role === "layer") return 22;
    if (role === "socks") return 18;
    return role === "accessory" ? 24 : 2;
  }

  if (answers.activity === "hiking") {
    if (outdoorSignal && role === "footwear") return 44;
    if (outdoorSignal) return role === "accessory" ? 32 : 28;
    if (role === "socks") return 24;
    if (role === "top" || role === "bottom" || role === "layer") return 20;
    return role === "footwear" ? 8 : 3;
  }

  if (["basketball", "tennis", "padel", "volleyball"].includes(answers.activity)) {
    const identity = strictIdentityText(product);
    const signal = answers.activity === "basketball"
      ? hasAny(identity, ["basketball", "μπασκετ", "μπάσκετ"])
      : answers.activity === "tennis"
        ? hasAny(identity, ["tennis", "τενις", "τένις"])
        : answers.activity === "padel"
          ? hasAny(identity, ["padel", "παντελ", "πάντελ"])
          : hasAny(identity, ["volleyball", "volley", "βολει", "βόλεϊ"]);
    if (signal && role === "footwear") return 44;
    if (signal && role === "accessory") return 38;
    if (signal && (role === "top" || role === "bottom" || role === "layer")) return 30;
    if (role === "socks") return 22;
    return signal ? 24 : 2;
  }

  if (footballSignal && role === "footwear") return 42;
  if (footballSignal) return 36;
  if (role === "socks") return 30;
  if (role === "top" || role === "bottom" || role === "layer") return 22;
  if (role === "footwear") return 12;
  return role === "accessory" ? 18 : 2;
}

function surfaceScore(product: SportFitProduct, surface: SportSurface | undefined, text: string, role: SportProductRole): number {
  if (!surface) return 4;

  const knowledge = usableKnowledge(product);
  const knownSurfaces = knowledgeList(knowledge?.surfaces);
  if (knownSurfaces.length > 0) {
    if (hasKnowledgeMatch(knownSurfaces, requestedSurfaceCodes(surface))) return 16;
    return role === "footwear" ? -6 : 2;
  }

  const trail = hasAny(text, ["trail", "terrex", "hiking", "outdoor", "ορειν", "πεζοπορ"]);
  const indoor = hasAny(text, ["indoor", "court", "training", "gym", "futsal"]);
  const artificial = hasAny(text, ["turf", "artificial", "tf ", "ag "]);
  const grass = hasAny(text, ["firm ground", "fg ", "grass", "γρασιδ"]);
  const court = hasAny(text, ["court", "tennis", "padel", "basketball", "volleyball", "τενις", "παντελ", "μπασκετ", "βολει"]);

  if (["court_hard", "court_clay", "court_indoor", "court_outdoor", "court_artificial"].includes(surface)) {
    return court ? 14 : role === "footwear" ? 3 : 5;
  }
  if (surface === "trail") return trail ? 14 : role === "footwear" ? 2 : 5;
  if (surface === "treadmill" || surface === "indoor") return indoor ? 12 : role === "footwear" ? 8 : 5;
  if (surface === "artificial") return artificial ? 14 : role === "footwear" ? 3 : 5;
  if (surface === "grass") return grass ? 14 : role === "footwear" ? 3 : 5;
  if (surface === "road") return trail ? 2 : role === "footwear" ? 10 : 5;
  return role === "footwear" ? 8 : 5;
}

function priorityScore(product: SportFitProduct, priority: SportPriority | undefined, text: string): number {
  if (!priority) return 4;
  const knowledge = usableKnowledge(product);
  const cushioning = normalizedKnowledgeValue(knowledge?.cushioningLevel);
  const support = normalizedKnowledgeValue(knowledge?.supportLevel);

  if (priority === "comfort") {
    if (cushioning === "high" || cushioning === "max") return 12;
    return hasAny(text, ["comfort", "soft", "foam", "cloud", "gel", "cush", "αναπαυ", "ανεσ"]) ? 10 : 5;
  }
  if (priority === "cushioning") {
    if (cushioning === "max") return 14;
    if (cushioning === "high") return 13;
    if (cushioning === "medium") return 10;
    if (cushioning === "minimal" || cushioning === "low") return 2;
    return hasAny(text, ["cush", "foam", "gel", "boost", "air", "cloud", "απορροφ"]) ? 10 : 4;
  }
  if (priority === "lightweight") {
    return hasAny(text, ["lightweight", "light ", "ultra light", "speed", "adizero", "ελαφρ"]) ? 12 : 4;
  }
  if (priority === "stability") {
    if (support === "max support" || support === "max_support") return 14;
    if (support === "stability") return 13;
    if (support === "guided" || support === "guided support") return 10;
    if (support === "neutral") return 4;
    return hasAny(text, ["stability", "stable", "support", "control", "στηριξ", "σταθερ"]) ? 10 : 4;
  }
  if (priority === "traction") {
    return hasAny(text, ["traction", "grip", "traxion", "lug", "προσφυ", "αντιολισθ"]) ? 13 : 4;
  }
  if (priority === "weather") {
    if ((knowledge?.weatherProtection ?? []).length > 0) return 14;
    return hasAny(text, ["waterproof", "water resistant", "rain.rdy", "gore tex", "gore-tex", "αδιαβροχ", "υδροαπωθ"]) ? 12 : 4;
  }
  if (priority === "versatility") {
    const activities = knowledgeList(knowledge?.activities);
    const surfaces = knowledgeList(knowledge?.surfaces);
    const useCases = knowledgeList(knowledge?.useCases);
    const broadEvidence =
      activities.length >= 2
      || surfaces.length >= 2
      || useCases.length >= 2
      || activities.includes("general training")
      || activities.includes("team sports")
      || activities.includes("racket sports");
    return broadEvidence ? 12 : 5;
  }
  return 8;
}

function distanceScore(distance: SportDistance | undefined, text: string, role: SportProductRole): number {
  if (!distance) return 3;
  if (role !== "footwear") return 4;
  const cushioning = hasAny(text, ["cush", "foam", "gel", "boost", "cloud", "απορροφ"]);
  const speed = hasAny(text, ["speed", "race", "racing", "adizero", "lightweight", "ελαφρ"]);
  if (distance === "long") return cushioning ? 10 : 6;
  if (distance === "short") return speed ? 9 : 6;
  return 8;
}

function frequencyScore(product: SportFitProduct, frequency: SportFrequency | undefined, text: string): number {
  if (!frequency) return 3;
  const knowledge = usableKnowledge(product);
  const useCases = knowledgeList(knowledge?.useCases);
  if ((frequency === "high" || frequency === "regular") && useCases.includes("daily training")) return 8;
  if (frequency === "high") return hasAny(text, ["performance", "training", "aeroready", "dry fit", "dri fit", "technical"]) ? 8 : 5;
  if (frequency === "regular") return 6;
  return 5;
}

function useCaseScore(product: SportFitProduct, useCase: SportUseCase | undefined, text: string, role: SportProductRole): number {
  if (!useCase) return 3;
  const knowledge = usableKnowledge(product);
  const knownUseCases = knowledgeList(knowledge?.useCases);
  if (knownUseCases.length > 0) {
    if (hasKnowledgeMatch(knownUseCases, requestedUseCaseCodes(useCase))) return 11;
    return role === "footwear" || role === "accessory" ? 1 : 3;
  }

  const signals: Readonly<Record<SportUseCase, readonly string[]>> = {
    daily_training: ["training", "daily"],
    easy_run: ["easy run", "daily run"],
    recovery_run: ["recovery"],
    long_run: ["long run", "long distance"],
    speed_training: ["speed", "tempo", "interval"],
    race_day: ["race", "racing", "competition"],
    daily_walking: ["walking", "walk", "περπατ"],
    all_day_standing: ["all day", "work", "standing", "ορθοστασ"],
    travel_walking: ["travel", "walking", "city", "urban"],
    gym_strength: ["strength", "weight", "lifting", "stable", "ενδυναμ"],
    gym_cardio: ["cardio", "treadmill", "training"],
    gym_functional: ["functional", "cross training", "training"],
    football_training: ["football", "soccer", "training"],
    football_match: ["football", "soccer", "match"],
    day_hike: ["hiking", "trail", "πεζοπορ"],
    technical_hike: ["technical", "trail", "hiking", "terrex", "ορειν"],
    urban_outdoor: ["outdoor", "urban", "city", "walking"],
    basketball_training: ["basketball", "training", "μπασκετ"],
    basketball_match: ["basketball", "match", "μπασκετ"],
    tennis_training: ["tennis", "training", "τενις"],
    tennis_match: ["tennis", "match", "τενις"],
    padel_training: ["padel", "training", "παντελ"],
    padel_match: ["padel", "match", "παντελ"],
    volleyball_training: ["volleyball", "volley", "training", "βολει"],
    volleyball_match: ["volleyball", "volley", "match", "βολει"]
  };
  return hasAny(text, signals[useCase]) ? 8 : 3;
}

function budgetScore(product: SportFitProduct, budgetMinor: number | undefined): number {
  if (!budgetMinor) return 4;
  if (product.priceMinor <= budgetMinor) return 8;
  if (product.priceMinor <= Math.round(budgetMinor * 1.1)) return 2;
  return -10;
}

function requestedSizes(product: SportFitProduct, answers: SportFitAnswers, role: SportProductRole): readonly string[] {
  if (role === "footwear") {
    const brandKey = normalize(product.brand);
    const brandHints = brandKey ? answers.brandSizeHints?.[brandKey] : undefined;
    if (brandHints?.length) return brandHints.filter((value) => normalize(value));
  }
  return normalize(answers.size) ? [answers.size!] : [];
}

function sizeScore(product: SportFitProduct, answers: SportFitAnswers, role: SportProductRole): Readonly<{ score: number; matchedSize?: string }> {
  if (role !== "footwear" && role !== "socks") return { score: 0 };
  const requested = requestedSizes(product, answers, role);
  if (!requested.length) return { score: 4 };

  for (const requestedSize of requested) {
    const match = matchingSize(product, requestedSize, role);
    if (match) return { score: 15, matchedSize: match };
  }
  if (product.sizes.length > 0) return { score: role === "footwear" ? -30 : -8 };
  return { score: -4 };
}

function reasonsFor(
  product: SportFitProduct,
  answers: SportFitAnswers,
  role: SportProductRole,
  text: string,
  matchedSize: string | undefined
): readonly string[] {
  const reasons: string[] = [];
  const category = normalize(product.categoryCode);

  if (role === "footwear" && category.includes("running shoes")) reasons.push("Κατηγορία παπουτσιού τρεξίματος");
  else if (role === "footwear") reasons.push("Παπούτσι που ταιριάζει στη δραστηριότητα");
  else if (role === "socks") reasons.push("Συμπληρώνει το σετ ως κάλτσα");
  else if (role === "top" || role === "bottom" || role === "layer") reasons.push("Αθλητικό ένδυμα για το προτεινόμενο σετ");
  else if (role === "accessory") reasons.push("Χρήσιμο συμπλήρωμα για τη δραστηριότητα");

  if (matchedSize) reasons.push("Διαθέσιμο στο μέγεθος " + matchedSize);

  const knowledge = usableKnowledge(product);
  if (knowledge && hasKnowledgeMatch(knowledge.activities, requestedActivityCodes(answers))) {
    reasons.push("Τεκμηριωμένη αντιστοίχιση δραστηριότητας");
  }
  if (knowledge && answers.useCase && hasKnowledgeMatch(knowledge.useCases, requestedUseCaseCodes(answers.useCase))) {
    reasons.push("Τεκμηριωμένη αντιστοίχιση χρήσης / προπόνησης");
  }
  if (knowledge && answers.surface && hasKnowledgeMatch(knowledge.surfaces, requestedSurfaceCodes(answers.surface))) {
    reasons.push("Τεκμηριωμένη καταλληλότητα επιφάνειας");
  }
  if (knowledge && answers.priority === "cushioning" && knowledge.cushioningLevel) {
    reasons.push("Τεκμηριωμένο cushioning: " + knowledge.cushioningLevel);
  }
  if (knowledge && answers.priority === "stability" && knowledge.supportLevel) {
    reasons.push("Τεκμηριωμένο support: " + knowledge.supportLevel);
  }
  if (
    knowledge
    && knowledge.moistureWicking === true
    && (role === "socks" || role === "top" || role === "bottom" || role === "layer")
  ) {
    reasons.push("Τεκμηριωμένη απομάκρυνση υγρασίας");
  }
  if (knowledge && role === "socks" && knowledge.sockArchSupport === true) {
    reasons.push("Τεκμηριωμένη στήριξη καμάρας");
  }
  if (knowledge && role === "socks" && knowledge.sockHeight) {
    reasons.push("Τεκμηριωμένο ύψος κάλτσας: " + knowledge.sockHeight);
  }
  if (knowledge && role === "socks" && knowledge.sockCushioning) {
    reasons.push("Τεκμηριωμένο cushioning κάλτσας: " + knowledge.sockCushioning);
  }
  if (knowledge && role === "socks" && knowledge.breathabilityLevel) {
    reasons.push("Τεκμηριωμένη διαπνοή: " + knowledge.breathabilityLevel);
  }
  if (knowledge && role === "socks" && knowledge.thermalLevel) {
    reasons.push("Τεκμηριωμένη θερμική προστασία: " + knowledge.thermalLevel);
  }
  if (
    knowledge
    && knowledge.reflectiveDetails === true
    && (role === "top" || role === "bottom" || role === "layer")
  ) {
    reasons.push("Τεκμηριωμένες ανακλαστικές λεπτομέρειες");
  }
  if (
    knowledge
    && (knowledge.weatherProtection?.length ?? 0) > 0
    && (role === "socks" || role === "top" || role === "bottom" || role === "layer")
  ) {
    reasons.push("Τεκμηριωμένη προστασία από καιρό");
  }

  if (answers.budgetMinor && product.priceMinor <= answers.budgetMinor) reasons.push("Εντός του budget σου");
  if (product.available && product.availableToSell > 0) reasons.push("Διαθέσιμο τώρα");

  if (answers.surface === "trail" && hasAny(text, ["trail", "terrex", "hiking", "outdoor"])) reasons.push("Έχει σαφή ένδειξη trail / outdoor στον κατάλογο");
  if ((answers.surface === "artificial" || answers.surface === "grass") && hasAny(text, ["football", "soccer", "futsal", "turf", "tf ", "fg ", "ag "])) reasons.push("Έχει σαφή ένδειξη ποδοσφαιρικής χρήσης στον κατάλογο");

  if (answers.priority === "comfort" && hasAny(text, ["comfort", "soft", "foam", "gel", "cloud"])) reasons.push("Ο κατάλογος περιέχει ένδειξη άνεσης / μαλακής αίσθησης");
  if (answers.priority === "cushioning" && hasAny(text, ["cush", "foam", "gel", "boost", "cloud", "απορροφ"])) reasons.push("Ο κατάλογος περιέχει ένδειξη απορρόφησης / cushioning");
  if (answers.priority === "lightweight" && hasAny(text, ["lightweight", "light ", "speed", "adizero", "ελαφρ"])) reasons.push("Ο κατάλογος περιέχει ένδειξη ελαφριάς / γρήγορης κατασκευής");
  if (answers.priority === "stability" && hasAny(text, ["stability", "stable", "support", "control", "στηριξ", "σταθερ"])) reasons.push("Ο κατάλογος περιέχει ένδειξη στήριξης / σταθερότητας");

  return reasons.slice(0, 4);
}

export function scoreSportFitProduct(product: SportFitProduct, answers: SportFitAnswers): SportFitScoredProduct {
  const text = productText(product);
  const role = sportProductRole(product);
  const size = sizeScore(product, answers, role);
  const requested = requestedSizes(product, answers, role);
  const hardSizeMismatch = role === "footwear" && requested.length > 0 && product.sizes.length > 0 && !size.matchedSize;
  const ruleEvaluation = evaluateSportFitRules(product, answers, role);
  const stockEligible = product.available && product.availableToSell > 0;
  const technicalEligible = stockEligible && !hardSizeMismatch && ruleEvaluation.eligible;
  let score = 5;

  if (technicalEligible) {
    score += activityScore(product, answers, text, role);
    score += surfaceScore(product, answers.surface, text, role);
    score += priorityScore(product, answers.priority, text);
    score += distanceScore(answers.distance, text, role);
    score += frequencyScore(product, answers.frequency, text);
    score += useCaseScore(product, answers.useCase, text, role);
    score += budgetScore(product, answers.budgetMinor);
    score += size.score;
    score += 10;
    score += ruleEvaluation.adjustment;

    if (["running", "walking", "football", "hiking", "basketball", "tennis", "padel", "volleyball"].includes(answers.activity) && role === "footwear") score += 8;
    if (answers.activity === "gym" && (role === "footwear" || role === "top" || role === "bottom" || role === "accessory")) score += 6;
    if (["basketball", "tennis", "padel", "volleyball"].includes(answers.activity) && (role === "accessory" || role === "top" || role === "bottom")) score += 4;
  } else {
    score = 0;
  }

  const technicalReasons = hardSizeMismatch
    ? ["Δεν υπάρχει το ζητούμενο μέγεθος σε διαθέσιμη παραλλαγή"]
    : ruleEvaluation.reasons;

  return {
    ...product,
    role,
    score: clampScore(score),
    reasons: [...technicalReasons, ...reasonsFor(product, answers, role, text, size.matchedSize)].slice(0, 4),
    matchedSize: size.matchedSize,
    technicalEligible,
    technicalScore: ruleEvaluation.technicalScore,
    technicalCoverage: ruleEvaluation.technicalCoverage,
    technicalRequirements: ruleEvaluation.technicalRequirements,
    appliedRules: [
      ...(stockEligible ? ["stock.positive"] : ["stock.unavailable"]),
      ...(hardSizeMismatch ? ["fit.requested_size_mismatch"] : size.matchedSize ? ["fit.requested_size_match"] : []),
      ...ruleEvaluation.ruleIds
    ]
  };
}

function familyKey(product: SportFitScoredProduct): string {
  return normalize(product.title.replace(SIZE_TRAILER, "")) || product.id;
}

function uniqueRanked(products: readonly SportFitScoredProduct[]): readonly SportFitScoredProduct[] {
  const seen = new Set<string>();
  const output: SportFitScoredProduct[] = [];
  for (const product of products) {
    const key = familyKey(product);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(product);
  }
  return output;
}

function kitSelectionEligible(
  product: SportFitScoredProduct,
  answers: SportFitAnswers
): boolean {
  if (sportProductTier(product.role) !== "secondary") return false;

  const activityRequirement = product.technicalRequirements.find(
    (item) => item.id === "requirement.kit_activity"
  );
  if (activityRequirement?.status === "conflict") return false;

  if (product.role === "socks" && answers.size && product.sizes.length > 0) {
    const requestedNumeric = Number(
      normalize(answers.size).replace(/^eu\s*/, "").replace(",", ".")
    );
    const hasComparableNumericSizing = product.sizes.some((size) => /\d/.test(size));
    if (Number.isFinite(requestedNumeric) && hasComparableNumericSizing && !product.matchedSize) {
      return false;
    }
  }

  return true;
}

export function buildSportFitRecommendation(
  products: readonly SportFitProduct[],
  answers: SportFitAnswers
): SportFitRecommendation {
  const scored = products
    .filter((product) =>
      product.available
      && product.availableToSell > 0
      && product.priceMinor > 0
      && product.knowledge?.queueStatus !== "blocked"
      && product.knowledge?.status !== "conflict"
      && product.knowledge?.status !== "insufficient"
      && candidateSupportsRequestedActivity(product, answers)
    )
    .map((product) => scoreSportFitProduct(product, answers))
    .filter((product) => product.technicalEligible && product.score >= 20)
    .sort((left, right) =>
      right.technicalScore - left.technicalScore
      || right.technicalCoverage - left.technicalCoverage
      || right.score - left.score
      || left.priceMinor - right.priceMinor
      || left.title.localeCompare(right.title, "el")
    );

  const eligible = uniqueRanked(scored);
  // Tier 1 is the field that can become the Top 5. Socks, apparel and
  // accessories remain Tier 2 and are only allowed into Complete My Kit.
  const primaryRanked = eligible.filter((product) => sportProductTier(product.role) === "primary");
  const primary = primaryRanked[0];
  const alternatives = primaryRanked.filter((product) => product.id !== primary?.id).slice(0, 4);

  const kit: SportFitScoredProduct[] = [];
  if (primary) {
    const usedIds = new Set([primary.id]);
    for (const role of ["socks", "top", "bottom", "layer", "accessory"] as const) {
      const item = eligible.find((product) =>
        product.role === role
        && !usedIds.has(product.id)
        && product.score >= 35
        && kitSelectionEligible(product, answers)
      );
      if (!item) continue;
      usedIds.add(item.id);
      kit.push(item);
    }
  }

  return {
    rulesetVersion: SPORT_FIT_RULESET_VERSION,
    primary,
    alternatives,
    kit,
    ranked: primaryRanked.slice(0, 24)
  };
}

function enumValue<T extends readonly string[]>(values: T, value: unknown, fallback: T[number]): T[number] {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T[number] : fallback;
}

function optionalEnumValue<T extends readonly string[]>(values: T, value: unknown): T[number] | undefined {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? value as T[number] : undefined;
}

export function parseSportFitAnswers(input: unknown): SportFitAnswers {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const size = typeof value.size === "string" ? value.size.trim().slice(0, 24) : "";
  const parsedBudget = Number(value.budgetMinor);
  const budgetMinor = Number.isSafeInteger(parsedBudget) && parsedBudget > 0 ? Math.min(parsedBudget, 500_000) : undefined;
  const parsedFootLengthMm = Number(value.footLengthMm);
  const footLengthMm = Number.isFinite(parsedFootLengthMm) && parsedFootLengthMm >= 80 && parsedFootLengthMm <= 400
    ? Math.round(parsedFootLengthMm * 10) / 10
    : undefined;

  return {
    activity: enumValue(SPORT_ACTIVITIES, value.activity, "running"),
    audience: enumValue(SPORT_AUDIENCES, value.audience, "men"),
    size: size || undefined,
    footLengthMm,
    budgetMinor,
    surface: optionalEnumValue(SPORT_SURFACES, value.surface),
    frequency: optionalEnumValue(SPORT_FREQUENCIES, value.frequency),
    distance: optionalEnumValue(SPORT_DISTANCES, value.distance),
    priority: optionalEnumValue(SPORT_PRIORITIES, value.priority),
    runnerNeed: optionalEnumValue(SPORT_RUNNER_NEEDS, value.runnerNeed),
    fitPreference: optionalEnumValue(SPORT_FIT_PREFERENCES, value.fitPreference),
    gymTrainingType: optionalEnumValue(SPORT_GYM_TRAINING_TYPES, value.gymTrainingType),
    useCase: optionalEnumValue(SPORT_USE_CASES, value.useCase)
  };
}
