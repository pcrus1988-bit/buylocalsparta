import assert from "node:assert/strict";
import test from "node:test";
import { buildSportFitRecommendation, parseSportFitAnswers, scoreSportFitProduct, sportFitCandidateSupportsRequestedActivity, type SportFitProduct } from "./sport-fit-engine.ts";
import { canonicalSportBrand, sportSizeGuideBrandKey } from "./sport-fit-brand.ts";

function product(overrides: Partial<SportFitProduct> & Pick<SportFitProduct, "id" | "title" | "categoryCode">): SportFitProduct {
  return {
    slug: overrides.id,
    priceMinor: 7000,
    sizes: ["42"],
    available: true,
    availableToSell: 2,
    ...overrides
  };
}

test("running guide prefers an exact-size running shoe over a sneaker with a wrong known size", () => {
  const exact = product({
    id: "run-1",
    title: "Road Running Cushion Shoe - 42",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    description: "Cushioned daily running shoe for road training"
  });
  const wrong = product({
    id: "sneaker-1",
    title: "Lifestyle Sneaker - 43",
    categoryCode: "mens-sneakers",
    sizes: ["43"]
  });

  const result = buildSportFitRecommendation([wrong, exact], {
    activity: "running",
    audience: "men",
    size: "42",
    surface: "road",
    priority: "cushioning",
    frequency: "regular",
    distance: "medium",
    budgetMinor: 10000
  });

  assert.equal(result.primary?.id, "run-1");
  assert.equal(result.primary?.matchedSize, "42");
  assert.ok(result.primary?.reasons.some((reason) => /μέγεθος 42/i.test(reason)));
});

test("trail evidence improves a trail shoe relative to a generic road shoe", () => {
  const trail = product({
    id: "trail-1",
    title: "Terrex Trail Running Shoe - 42",
    categoryCode: "mens-running-shoes",
    description: "Trail outdoor grip"
  });
  const road = product({
    id: "road-1",
    title: "Classic Road Running Shoe - 42",
    categoryCode: "mens-running-shoes"
  });
  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    size: "42",
    surface: "trail" as const,
    priority: "versatility" as const
  };

  assert.ok(scoreSportFitProduct(trail, answers).score > scoreSportFitProduct(road, answers).score);
});

test("complete-kit selection can add socks and activewear beside the primary shoe", () => {
  const result = buildSportFitRecommendation([
    product({ id: "shoe", title: "Running Shoe - 42", categoryCode: "mens-running-shoes" }),
    product({ id: "sock", title: "Performance Running Socks - 42", categoryCode: "socks-hosiery", priceMinor: 1200 }),
    product({ id: "top", title: "Aeroready Training T-Shirt - M", categoryCode: "fashion-mens-tshirts-tops", sizes: ["M"], priceMinor: 2500 }),
    product({ id: "short", title: "Training Shorts - M", categoryCode: "fashion-mens-shorts", sizes: ["M"], priceMinor: 3000 })
  ], {
    activity: "running",
    audience: "men",
    surface: "road",
    priority: "comfort"
  });

  assert.equal(result.primary?.id, "shoe");
  assert.ok(result.kit.some((item) => item.role === "socks"));
  assert.ok(result.kit.some((item) => item.role === "top" || item.role === "bottom"));
});

test("over-budget products receive a material ranking penalty", () => {
  const affordable = product({ id: "a", title: "Running Shoe A - 42", categoryCode: "mens-running-shoes", priceMinor: 8000 });
  const expensive = product({ id: "b", title: "Running Shoe B - 42", categoryCode: "mens-running-shoes", priceMinor: 18000 });
  const answers = { activity: "running" as const, audience: "men" as const, budgetMinor: 10000 };

  assert.ok(scoreSportFitProduct(affordable, answers).score > scoreSportFitProduct(expensive, answers).score);
});


test("shoe size does not penalize apparel and can match a sock size range", () => {
  const sock = product({
    id: "sock-range",
    title: "Running Socks 43-46",
    categoryCode: "socks-hosiery",
    sizes: ["43-46"],
    priceMinor: 1200
  });
  const top = product({
    id: "top-m",
    title: "Training T-Shirt - M",
    categoryCode: "fashion-mens-tshirts-tops",
    sizes: ["M"],
    priceMinor: 2500
  });
  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    size: "44",
    surface: "road" as const
  };

  const scoredSock = scoreSportFitProduct(sock, answers);
  const scoredTop = scoreSportFitProduct(top, answers);
  assert.equal(scoredSock.matchedSize, "43-46");
  assert.ok(scoredTop.score >= 20);
});


test("governed surface facts outrank misleading title heuristics", () => {
  const verifiedRoad = product({
    id: "verified-road",
    title: "Outdoor Trail Style Running Shoe - 42",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      evidenceScore: 0.7,
      activities: ["running"],
      surfaces: ["road"]
    }
  });
  const heuristicRoad = product({
    id: "heuristic-road",
    title: "Road Running Shoe - 42",
    categoryCode: "mens-running-shoes",
    description: "road running shoe"
  });

  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    size: "42",
    surface: "road" as const
  };

  const verified = scoreSportFitProduct(verifiedRoad, answers);
  const heuristic = scoreSportFitProduct(heuristicRoad, answers);
  assert.ok(verified.score > heuristic.score);
  assert.ok(verified.reasons.some((reason) => /Τεκμηριωμένη καταλληλότητα επιφάνειας/i.test(reason)));
});

test("documented activity mismatch outweighs optimistic product-title wording", () => {
  const documentedWalking = product({
    id: "walking-only",
    title: "Performance Running Speed Shoe - 42",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["walking"],
      surfaces: ["road"]
    }
  });
  const unknownRunning = product({
    id: "running-unknown",
    title: "Running Shoe - 42",
    categoryCode: "mens-running-shoes"
  });

  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    size: "42",
    surface: "road" as const
  };

  assert.ok(scoreSportFitProduct(unknownRunning, answers).score > scoreSportFitProduct(documentedWalking, answers).score);
});

test("blocked identity conflicts are excluded from recommendations", () => {
  const blocked = product({
    id: "blocked",
    title: "Running Shoe - 42",
    categoryCode: "womens-running-shoes",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      queueStatus: "blocked",
      activities: ["running"]
    }
  });
  const safe = product({
    id: "safe",
    title: "Running Shoe Safe - 42",
    categoryCode: "womens-running-shoes"
  });

  const result = buildSportFitRecommendation([blocked, safe], {
    activity: "running",
    audience: "women",
    size: "42",
    surface: "road"
  });

  assert.equal(result.primary?.id, "safe");
  assert.ok(!result.ranked.some((item) => item.id === "blocked"));
});


test("brand-specific measured size hints apply only to the matching footwear brand", () => {
  const adidasExact = product({
    id: "adidas-exact",
    title: "adidas Running Shoe",
    brand: "adidas",
    categoryCode: "mens-running-shoes",
    sizes: ["42 2/3"]
  });
  const adidasWrong = product({
    id: "adidas-wrong",
    title: "adidas Running Shoe Other Size",
    brand: "adidas",
    categoryCode: "mens-running-shoes",
    sizes: ["44"]
  });
  const otherBrand = product({
    id: "other-brand",
    title: "Other Running Shoe",
    brand: "Other Brand",
    categoryCode: "mens-running-shoes",
    sizes: ["44"]
  });

  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    surface: "road" as const,
    brandSizeHints: {
      adidas: ["42", "42 2/3"]
    }
  };

  const exactScore = scoreSportFitProduct(adidasExact, answers);
  const wrongScore = scoreSportFitProduct(adidasWrong, answers);
  const otherScore = scoreSportFitProduct(otherBrand, answers);

  assert.equal(exactScore.matchedSize, "42 2/3");
  assert.ok(exactScore.score > wrongScore.score);
  assert.ok(otherScore.score > wrongScore.score, "another brand must not inherit the adidas size mismatch penalty");
});


test("documented hiking footwear is compatible with trail walking but not road running", () => {
  const hiking = product({
    id: "hiking-shoe",
    title: "Technical Hiking Shoe - 42",
    categoryCode: "mens-sneakers",
    sizes: ["42"],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["hiking"],
      surfaces: ["trail"],
      useCases: ["technical_hike"]
    }
  });

  const trailWalking = scoreSportFitProduct(hiking, {
    activity: "walking",
    audience: "men",
    size: "42",
    surface: "trail"
  });
  const roadRunning = scoreSportFitProduct(hiking, {
    activity: "running",
    audience: "men",
    size: "42",
    surface: "road"
  });

  assert.ok(trailWalking.score > roadRunning.score);
  assert.ok(trailWalking.reasons.some((reason) => /δραστηριότητας/i.test(reason)));
});


test("multiple brand size hints remain isolated per footwear brand", () => {
  const adidas = product({
    id: "adidas-multi-brand",
    title: "adidas Running Shoe",
    brand: "Adidas",
    categoryCode: "mens-running-shoes",
    sizes: ["42 2/3"]
  });
  const reebok = product({
    id: "reebok-multi-brand",
    title: "Reebok Running Shoe",
    brand: "Reebok",
    categoryCode: "mens-running-shoes",
    sizes: ["42"]
  });

  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    surface: "road" as const,
    brandSizeHints: {
      adidas: ["42 2/3"],
      reebok: ["42"]
    }
  };

  const adidasScore = scoreSportFitProduct(adidas, answers);
  const reebokScore = scoreSportFitProduct(reebok, answers);

  assert.equal(adidasScore.matchedSize, "42 2/3");
  assert.equal(reebokScore.matchedSize, "42");
  assert.ok(adidasScore.score > 0);
  assert.ok(reebokScore.score > 0);
});


test("kids foot measurements down to the stored adidas chart range are accepted", () => {
  const smallestStoredChartMeasurement = parseSportFitAnswers({
    activity: "walking",
    audience: "kids",
    footLengthMm: 81
  });
  const belowSupportedRange = parseSportFitAnswers({
    activity: "walking",
    audience: "kids",
    footLengthMm: 79
  });

  assert.equal(smallestStoredChartMeasurement.footLengthMm, 81);
  assert.equal(belowSupportedRange.footLengthMm, undefined);
});


test("Sport Fit normalizes the Kerasiotis Sketchers typo without inventing other aliases", () => {
  assert.equal(canonicalSportBrand("Sketchers"), "Skechers");
  assert.equal(canonicalSportBrand("Skechers"), "Skechers");
  assert.equal(canonicalSportBrand("Reebok"), "Reebok");
  assert.equal(canonicalSportBrand(undefined), undefined);
});

test("size-guide brand keys use the trusted Skechers alias only", () => {
  assert.equal(sportSizeGuideBrandKey("Sketchers"), "skechers");
  assert.equal(sportSizeGuideBrandKey("Skechers"), "skechers");
  assert.equal(sportSizeGuideBrandKey("Reebok"), "reebok");
});


test("governed sock thermal and breathability facts reach result reasons", () => {
  const sock = product({
    id: "gsa-thermal-sock",
    title: "GSA thermal sock",
    categoryCode: "socks-hosiery",
    sizes: [],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      breathabilityLevel: "high",
      thermalLevel: "thermal"
    }
  });

  const scored = scoreSportFitProduct(sock, {
    activity: "walking",
    audience: "men"
  });

  assert.ok(scored.reasons.some((reason) => /διαπνοή/i.test(reason)));
  assert.ok(scored.reasons.some((reason) => /θερμική/i.test(reason)));
});

test("governed running-apparel moisture and reflective facts reach result reasons", () => {
  const top = product({
    id: "adidas-kb5970",
    title: "adi365 Running Essentials Tank",
    categoryCode: "fashion-mens-tshirts-tops",
    sizes: ["M"],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["running"],
      moistureWicking: true,
      reflectiveDetails: true
    }
  });

  const scored = scoreSportFitProduct(top, {
    activity: "running",
    audience: "men"
  });

  assert.ok(scored.reasons.some((reason) => /δραστηριότητας/i.test(reason)));
  assert.ok(scored.reasons.some((reason) => /υγρασίας/i.test(reason)));
  assert.ok(scored.reasons.some((reason) => /ανακλαστικές/i.test(reason)));
});



test("running rules combine distance, frequency, cushioning and verified use case", () => {
  const longRun = product({
    id: "long-run",
    title: "Long Run Shoe",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training", "long_run"],
      cushioningLevel: "high",
      supportLevel: "neutral",
      fitLengthProfile: "true_to_size"
    }
  });
  const speed = product({
    id: "speed",
    title: "Speed Shoe",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["speed_training"],
      cushioningLevel: "low",
      supportLevel: "neutral"
    }
  });

  const result = buildSportFitRecommendation([speed, longRun], {
    activity: "running",
    audience: "men",
    size: "42",
    surface: "road",
    distance: "long",
    frequency: "high",
    runnerNeed: "soft_ride",
    fitPreference: "standard"
  });

  assert.equal(result.primary?.id, "long-run");
  assert.equal(result.rulesetVersion, "2026-10-02.10");
  assert.ok(result.primary?.appliedRules.includes("running.long_run_use_case"));
  assert.ok(result.primary?.reasons.some((reason) => /long-run|cushioning/i.test(reason)));
});

test("football rules reject a documented outsole code that conflicts with the selected ground", () => {
  const ag = product({
    id: "ag-boot",
    title: "AG Football Boot",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["football"],
      footballSurfaceCode: "ag"
    }
  });
  const fg = product({
    id: "fg-boot",
    title: "FG Football Boot",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["football"],
      footballSurfaceCode: "fg"
    }
  });

  const agScore = scoreSportFitProduct(ag, {
    activity: "football",
    audience: "men",
    surface: "artificial"
  });
  const fgScore = scoreSportFitProduct(fg, {
    activity: "football",
    audience: "men",
    surface: "artificial"
  });

  assert.equal(agScore.technicalEligible, true);
  assert.equal(fgScore.technicalEligible, false);
  assert.ok(agScore.appliedRules.includes("football.boot_surface_match"));
  assert.ok(fgScore.appliedRules.includes("football.boot_surface_mismatch"));
});

test("gym strength rules prefer stability over maximum cushioning", () => {
  const stable = product({
    id: "strength-stable",
    title: "Stable Training Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["gym_training"],
      useCases: ["gym_strength"],
      cushioningLevel: "medium",
      supportLevel: "stability"
    }
  });
  const soft = product({
    id: "cardio-soft",
    title: "Soft Cardio Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["gym_training"],
      useCases: ["gym_cardio"],
      cushioningLevel: "max",
      supportLevel: "neutral"
    }
  });

  const answers = {
    activity: "gym" as const,
    audience: "men" as const,
    gymTrainingType: "strength" as const,
    surface: "indoor" as const,
    priority: "stability" as const
  };

  assert.ok(scoreSportFitProduct(stable, answers).score > scoreSportFitProduct(soft, answers).score);
  assert.ok(scoreSportFitProduct(stable, answers).appliedRules.includes("gym.strength_use_case"));
});

test("wide-fit requirement fails closed against documented narrow footwear", () => {
  const narrow = product({
    id: "narrow-runner",
    title: "Narrow Running Shoe",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      widthProfile: "narrow"
    }
  });
  const wide = product({
    id: "wide-runner",
    title: "Wide Running Shoe",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      widthProfile: "wide"
    }
  });
  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    surface: "road" as const,
    runnerNeed: "wide_fit" as const,
    fitPreference: "wide" as const
  };

  assert.equal(scoreSportFitProduct(narrow, answers).technicalEligible, false);
  assert.equal(buildSportFitRecommendation([narrow, wide], answers).primary?.id, "wide-runner");
});

test("known requested shoe-size miss is excluded instead of merely penalized", () => {
  const wrongSize = product({
    id: "wrong-size",
    title: "Running Shoe Wrong Size",
    categoryCode: "mens-running-shoes",
    sizes: ["43"],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"]
    }
  });
  const exactSize = product({
    id: "exact-size",
    title: "Running Shoe Exact Size",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"]
    }
  });

  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    size: "42",
    surface: "road" as const
  };

  assert.equal(scoreSportFitProduct(wrongSize, answers).technicalEligible, false);
  assert.equal(buildSportFitRecommendation([wrongSize, exactSize], answers).primary?.id, "exact-size");
});

test("new rule inputs are parsed only from controlled values", () => {
  const parsed = parseSportFitAnswers({
    activity: "gym",
    audience: "women",
    gymTrainingType: "strength",
    fitPreference: "wide",
    runnerNeed: "speed"
  });
  const invalid = parseSportFitAnswers({
    activity: "running",
    audience: "men",
    gymTrainingType: "bodybuilding-ish",
    fitPreference: "whatever",
    runnerNeed: "medical_pronation_guess"
  });

  assert.equal(parsed.gymTrainingType, "strength");
  assert.equal(parsed.fitPreference, "wide");
  assert.equal(parsed.runnerNeed, "speed");
  assert.equal(invalid.gymTrainingType, undefined);
  assert.equal(invalid.fitPreference, undefined);
  assert.equal(invalid.runnerNeed, undefined);
});


test("gym treadmill explicitly accepts governed running footwear", () => {
  const runningShoe = product({
    id: "treadmill-running-shoe",
    title: "Road Running Shoe",
    categoryCode: "womens-running-shoes",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      cushioningLevel: "medium",
      supportLevel: "neutral"
    }
  });

  const scored = scoreSportFitProduct(runningShoe, {
    activity: "gym",
    audience: "women",
    gymTrainingType: "treadmill",
    surface: "treadmill"
  });

  assert.equal(scored.technicalEligible, true);
  assert.ok(scored.score > 0);
});


test("hiking path prefers documented hiking footwear and excludes documented running-only footwear", () => {
  const hiking = product({
    id: "hike-terrex",
    title: "Terrex Hiking Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["hiking"],
      surfaces: ["trail"],
      useCases: ["day_hike"],
      weatherProtection: ["water_resistant"]
    }
  });
  const roadRunner = product({
    id: "road-only",
    title: "Road Running Shoe",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"]
    }
  });

  const result = buildSportFitRecommendation([roadRunner, hiking], {
    activity: "hiking",
    audience: "men",
    surface: "trail",
    useCase: "day_hike",
    priority: "weather"
  });

  assert.equal(result.primary?.id, "hike-terrex");
  assert.equal(result.ranked.some((item) => item.id === "road-only"), false);
  assert.ok(result.primary?.appliedRules.includes("hiking.surface_match"));
});

test("basketball path rejects lifestyle basketball inspiration unless sport identity is explicit", () => {
  const lifestyle = product({
    id: "rapid-court",
    title: "Rapid Court Low",
    categoryCode: "mens-sneakers",
    description: "Lifestyle streetwear sneaker inspired by classic basketball style"
  });
  const basketball = product({
    id: "court-performance",
    title: "Performance Basketball Shoe",
    categoryCode: "mens-basketball-shoes",
    description: "Indoor court training shoe"
  });

  const result = buildSportFitRecommendation([lifestyle, basketball], {
    activity: "basketball",
    audience: "men",
    surface: "court_indoor",
    useCase: "basketball_training",
    priority: "stability"
  });

  assert.equal(result.primary?.id, "court-performance");
  assert.equal(result.ranked.some((item) => item.id === "rapid-court"), false);
});

test("new Sport & Fit activities, court surfaces and use cases parse only from controlled values", () => {
  const parsed = parseSportFitAnswers({
    activity: "padel",
    audience: "women",
    surface: "court_artificial",
    useCase: "padel_match",
    priority: "traction"
  });
  const invalid = parseSportFitAnswers({
    activity: "pickleball",
    audience: "men",
    surface: "parking_lot",
    useCase: "weekend_fun",
    priority: "fashion"
  });

  assert.equal(parsed.activity, "padel");
  assert.equal(parsed.surface, "court_artificial");
  assert.equal(parsed.useCase, "padel_match");
  assert.equal(parsed.priority, "traction");
  assert.equal(invalid.activity, "running");
  assert.equal(invalid.surface, undefined);
  assert.equal(invalid.useCase, undefined);
  assert.equal(invalid.priority, undefined);
});


test("governed technical evidence outranks a stronger heuristic-only running title", () => {
  const verified = product({
    id: "verified-road-runner",
    title: "Daily Trainer",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training", "long_run"],
      cushioningLevel: "high",
      supportLevel: "neutral",
      widthProfile: "standard"
    }
  });
  const heuristic = product({
    id: "heuristic-runner",
    title: "Ultra Performance Running Cushion Speed Shoe",
    categoryCode: "mens-running-shoes",
    description: "Running performance comfort cushion lightweight speed training"
  });

  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    surface: "road" as const,
    distance: "long" as const,
    frequency: "high" as const,
    runnerNeed: "soft_ride" as const,
    fitPreference: "standard" as const
  };

  const verifiedScore = scoreSportFitProduct(verified, answers);
  const heuristicScore = scoreSportFitProduct(heuristic, answers);
  const result = buildSportFitRecommendation([heuristic, verified], answers);

  assert.ok(verifiedScore.technicalScore > heuristicScore.technicalScore);
  assert.ok(verifiedScore.technicalCoverage > heuristicScore.technicalCoverage);
  assert.equal(result.primary?.id, "verified-road-runner");
});

test("running technical profile combines surface distance frequency runner need and fit", () => {
  const matched = product({
    id: "matched-running-profile",
    title: "Matched Runner",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training", "long_run"],
      cushioningLevel: "high",
      supportLevel: "neutral",
      widthProfile: "wide"
    }
  });
  const partial = product({
    id: "partial-running-profile",
    title: "Partial Runner",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      cushioningLevel: "low",
      supportLevel: "neutral",
      widthProfile: "standard"
    }
  });
  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    surface: "road" as const,
    distance: "long" as const,
    frequency: "high" as const,
    runnerNeed: "soft_ride" as const,
    fitPreference: "wide" as const
  };

  const good = scoreSportFitProduct(matched, answers);
  const weak = scoreSportFitProduct(partial, answers);

  assert.ok(good.technicalScore > weak.technicalScore);
  assert.ok(good.technicalRequirements.some((item) => item.id === "requirement.running_distance_profile" && item.status === "match"));
  assert.ok(weak.technicalRequirements.some((item) => item.id === "requirement.running_distance_profile" && item.status === "conflict"));
});

test("football outsole compatibility materially raises technical confidence", () => {
  const verifiedAg = product({
    id: "verified-ag",
    title: "Football Boot",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["football"],
      surfaces: ["artificial_grass"],
      footballSurfaceCode: "ag"
    }
  });
  const unknownBoot = product({
    id: "unknown-football",
    title: "Football Boot",
    categoryCode: "mens-sneakers"
  });
  const answers = {
    activity: "football" as const,
    audience: "men" as const,
    surface: "artificial" as const
  };

  const verified = scoreSportFitProduct(verifiedAg, answers);
  const unknown = scoreSportFitProduct(unknownBoot, answers);

  assert.ok(verified.technicalScore > unknown.technicalScore);
  assert.ok(verified.technicalRequirements.some((item) => item.id === "requirement.football_outsole" && item.status === "match"));
});

test("gym technical profile separates stable strength footwear from max-cushion neutral footwear", () => {
  const strength = product({
    id: "strength-profile",
    title: "Strength Trainer",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["gym_training"],
      useCases: ["gym_strength"],
      cushioningLevel: "low",
      supportLevel: "stability"
    }
  });
  const maxCushion = product({
    id: "max-cushion-profile",
    title: "Soft Cardio Trainer",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["gym_training"],
      useCases: ["gym_cardio"],
      cushioningLevel: "max",
      supportLevel: "neutral"
    }
  });
  const answers = {
    activity: "gym" as const,
    audience: "men" as const,
    gymTrainingType: "strength" as const,
    surface: "indoor" as const
  };

  const stable = scoreSportFitProduct(strength, answers);
  const soft = scoreSportFitProduct(maxCushion, answers);

  assert.ok(stable.technicalScore > soft.technicalScore);
  assert.ok(stable.technicalRequirements.some((item) => item.id === "requirement.gym_training_type" && item.status === "match"));
  assert.ok(soft.technicalRequirements.some((item) => item.id === "requirement.gym_training_type" && item.status === "conflict"));
});

test("tier-two socks never become a primary match or finalist", () => {
  const result = buildSportFitRecommendation([
    product({
      id: "sock-only",
      title: "Performance Running Socks 43-46",
      categoryCode: "socks-hosiery",
      sizes: ["43-46"],
      priceMinor: 1200,
      knowledge: {
        status: "verified",
        identityQuality: "strong",
        activities: ["running"],
        moistureWicking: true
      }
    })
  ], {
    activity: "running",
    audience: "men",
    size: "44",
    surface: "road"
  });

  assert.equal(result.primary, undefined);
  assert.equal(result.alternatives.length, 0);
  assert.equal(result.ranked.length, 0);
  assert.ok(result.kit.every((item) => item.role !== "footwear"));
});

test("survivor activity gate uses the same strict court-sport identity as finalist ranking", () => {
  const genericSneaker = product({
    id: "generic-court-look",
    title: "Lifestyle Sneaker",
    categoryCode: "mens-sneakers",
    description: "Basketball-inspired streetwear style"
  });
  const performanceBasketball = product({
    id: "basketball-performance",
    title: "Performance Basketball Shoe",
    categoryCode: "mens-basketball-shoes",
    description: "Indoor court training shoe"
  });
  const answers = {
    activity: "basketball" as const,
    audience: "men" as const,
    surface: "court_indoor" as const,
    useCase: "basketball_training" as const
  };

  assert.equal(sportFitCandidateSupportsRequestedActivity(genericSneaker, answers), false);
  assert.equal(sportFitCandidateSupportsRequestedActivity(performanceBasketball, answers), true);

  const result = buildSportFitRecommendation([genericSneaker, performanceBasketball], answers);
  assert.equal(result.primary?.id, "basketball-performance");
});



test("canonical family id de-duplicates differently titled variants in Top 5", () => {
  const blue = product({
    id: "shoe-blue-42",
    familyId: "family-xml-123",
    title: "Performance Runner Blue EU 42",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    priceMinor: 8000,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"]
    }
  });
  const red = product({
    id: "shoe-red-42",
    familyId: "family-xml-123",
    title: "Performance Runner Red EU 42",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    priceMinor: 8200,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"]
    }
  });
  const secondFamily = product({
    id: "shoe-family-two",
    familyId: "family-xml-456",
    title: "Daily Road Trainer EU 42",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    priceMinor: 8500,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"]
    }
  });

  const result = buildSportFitRecommendation([red, secondFamily, blue], {
    activity: "running",
    audience: "men",
    size: "42",
    surface: "road",
    useCase: "daily_training"
  });

  const finalists = [result.primary, ...result.alternatives].filter(Boolean);
  assert.equal(finalists.filter((item) => item?.familyId === "family-xml-123").length, 1);
  assert.equal(result.ranked.filter((item) => item.familyId === "family-xml-123").length, 1);
  assert.equal(result.primary?.id, "shoe-blue-42");
});
