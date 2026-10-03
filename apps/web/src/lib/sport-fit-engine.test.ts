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
    product({
      id: "sock",
      title: "Performance Running Socks - 42",
      categoryCode: "socks-hosiery",
      priceMinor: 1200,
      knowledge: {
        status: "verified",
        identityQuality: "strong",
        activities: ["running"],
        moistureWicking: true
      }
    }),
    product({
      id: "top",
      title: "Aeroready Training T-Shirt - M",
      categoryCode: "fashion-mens-tshirts-tops",
      sizes: ["M"],
      priceMinor: 2500,
      knowledge: {
        status: "verified",
        identityQuality: "strong",
        activities: ["running"],
        moistureWicking: true
      }
    }),
    product({
      id: "short",
      title: "Training Shorts - M",
      categoryCode: "fashion-mens-shorts",
      sizes: ["M"],
      priceMinor: 3000,
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
  assert.equal(result.rulesetVersion, "2026-10-03.1");
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

test("compact fractional supplier shoe size matches canonical EU fractional request", () => {
  const eastrail = product({
    id: "jr4007-47-third",
    title: "adidas Terrex Eastrail 3",
    categoryCode: "mens-running-shoes",
    sizes: ["4713"],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["hiking"],
      surfaces: ["trail"],
      useCases: ["technical_hike"],
      fitLengthProfile: "true_to_size"
    }
  });
  const wrongSize = product({
    id: "jr4007-wrong-size",
    title: "adidas Terrex Eastrail 3",
    categoryCode: "mens-running-shoes",
    sizes: ["48"],
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["hiking"],
      surfaces: ["trail"],
      useCases: ["technical_hike"],
      fitLengthProfile: "true_to_size"
    }
  });

  const answers = {
    activity: "hiking" as const,
    audience: "men" as const,
    size: "EU 47⅓",
    surface: "trail" as const,
    useCase: "technical_hike" as const
  };

  const scored = scoreSportFitProduct(eastrail, answers);
  assert.equal(scored.technicalEligible, true);
  assert.equal(scored.matchedSize, "4713");
  assert.equal(scoreSportFitProduct(wrongSize, answers).technicalEligible, false);
  assert.equal(buildSportFitRecommendation([wrongSize, eastrail], answers).primary?.id, "jr4007-47-third");
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


test("exact basketball evidence outranks a broad team-sports classification", () => {
  const broad = product({
    id: "broad-team-court",
    title: "Team Court Shoe",
    categoryCode: "mens-sneakers",
    priceMinor: 7000,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["team_sports"],
      surfaces: ["court_indoor"],
      useCases: ["basketball_training"],
      cushioningLevel: "medium"
    }
  });
  const exact = product({
    id: "exact-basketball",
    title: "Basketball Court Shoe",
    categoryCode: "mens-sneakers",
    priceMinor: 7000,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["basketball"],
      surfaces: ["court_indoor"],
      useCases: ["basketball_training"],
      cushioningLevel: "medium"
    }
  });
  const answers = {
    activity: "basketball" as const,
    audience: "men" as const,
    surface: "court_indoor" as const,
    useCase: "basketball_training" as const
  };

  const broadScore = scoreSportFitProduct(broad, answers);
  const exactScore = scoreSportFitProduct(exact, answers);
  const result = buildSportFitRecommendation([broad, exact], answers);

  assert.equal(broadScore.technicalEligible, true);
  assert.equal(exactScore.technicalEligible, true);
  assert.ok(exactScore.technicalScore > broadScore.technicalScore);
  assert.ok(broadScore.technicalRequirements.some((item) =>
    item.id === "requirement.activity_specificity" && item.status === "unknown"
  ));
  assert.ok(exactScore.technicalRequirements.some((item) =>
    item.id === "requirement.activity_specificity" && item.status === "match"
  ));
  assert.equal(result.primary?.id, "exact-basketball");
});

test("exact court surface evidence outranks a generic indoor surface", () => {
  const genericIndoor = product({
    id: "generic-indoor-tennis",
    title: "Tennis Indoor Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["tennis"],
      surfaces: ["indoor"],
      useCases: ["tennis_training"]
    }
  });
  const exactCourt = product({
    id: "exact-indoor-tennis",
    title: "Tennis Court Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["tennis"],
      surfaces: ["court_indoor"],
      useCases: ["tennis_training"]
    }
  });
  const answers = {
    activity: "tennis" as const,
    audience: "men" as const,
    surface: "court_indoor" as const,
    useCase: "tennis_training" as const
  };

  const genericScore = scoreSportFitProduct(genericIndoor, answers);
  const exactScore = scoreSportFitProduct(exactCourt, answers);
  const result = buildSportFitRecommendation([genericIndoor, exactCourt], answers);

  assert.ok(exactScore.technicalScore > genericScore.technicalScore);
  assert.ok(genericScore.technicalRequirements.some((item) =>
    item.id === "requirement.court_surface_specificity" && item.status === "unknown"
  ));
  assert.ok(exactScore.technicalRequirements.some((item) =>
    item.id === "requirement.court_surface_specificity" && item.status === "match"
  ));
  assert.equal(result.primary?.id, "exact-indoor-tennis");
});

test("Complete My Kit prefers exact sport evidence over a broad team-sports top", () => {
  const shoe = product({
    id: "basketball-primary",
    title: "Basketball Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["basketball"],
      surfaces: ["court_indoor"],
      useCases: ["basketball_training"]
    }
  });
  const broadTop = product({
    id: "team-sports-top",
    title: "Team Training Top",
    categoryCode: "fashion-mens-tshirts-tops",
    sizes: ["M"],
    priceMinor: 2500,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["team_sports"],
      useCases: ["basketball_training"],
      moistureWicking: true
    }
  });
  const exactTop = product({
    id: "basketball-top",
    title: "Basketball Training Top",
    categoryCode: "fashion-mens-tshirts-tops",
    sizes: ["M"],
    priceMinor: 2500,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["basketball"],
      useCases: ["basketball_training"],
      moistureWicking: true
    }
  });

  const result = buildSportFitRecommendation([broadTop, exactTop, shoe], {
    activity: "basketball",
    audience: "men",
    surface: "court_indoor",
    useCase: "basketball_training",
    frequency: "high"
  });

  assert.equal(result.primary?.id, "basketball-primary");
  assert.equal(result.kit.find((item) => item.role === "top")?.id, "basketball-top");
});


test("final Top 5 uses the governed evidence pool when governed footwear exists", () => {
  const governed = product({
    id: "governed-road-shoe",
    title: "Daily Trainer",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"]
    }
  });
  const heuristicA = product({
    id: "heuristic-running-a",
    title: "Running Comfort Shoe",
    categoryCode: "mens-running-shoes",
    description: "Road running cushion comfort"
  });
  const heuristicB = product({
    id: "heuristic-running-b",
    title: "Running Speed Shoe",
    categoryCode: "mens-running-shoes",
    description: "Road running lightweight speed"
  });

  const result = buildSportFitRecommendation([heuristicA, heuristicB, governed], {
    activity: "running",
    audience: "men",
    surface: "road",
    useCase: "daily_training"
  });

  assert.equal(result.finalistEvidenceMode, "governed");
  assert.equal(result.primary?.id, "governed-road-shoe");
  assert.equal(result.alternatives.length, 0);
  assert.deepEqual(result.ranked.map((item) => item.id), ["governed-road-shoe"]);
});

test("heuristic footwear remains a cautious fallback when no governed primary evidence exists", () => {
  const first = product({
    id: "heuristic-only-a",
    title: "Road Running Shoe",
    categoryCode: "mens-running-shoes",
    description: "Running road daily trainer"
  });
  const second = product({
    id: "heuristic-only-b",
    title: "Road Runner Cushion",
    categoryCode: "mens-running-shoes",
    description: "Running road cushion"
  });

  const result = buildSportFitRecommendation([first, second], {
    activity: "running",
    audience: "men",
    surface: "road"
  });

  assert.equal(result.finalistEvidenceMode, "heuristic_fallback");
  assert.ok(result.primary);
  assert.ok(result.ranked.length >= 1);
});

test("a governed broad sport classification is enough to enter the governed finalist pool", () => {
  const broad = product({
    id: "governed-team-sports",
    title: "Indoor Team Court Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["team_sports"],
      surfaces: ["court_indoor"]
    }
  });
  const heuristic = product({
    id: "heuristic-basketball",
    title: "Basketball Shoe",
    categoryCode: "mens-basketball-shoes",
    description: "Indoor basketball court shoe"
  });

  const result = buildSportFitRecommendation([heuristic, broad], {
    activity: "basketball",
    audience: "men",
    surface: "court_indoor"
  });

  assert.equal(result.finalistEvidenceMode, "governed");
  assert.equal(result.primary?.id, "governed-team-sports");
  assert.equal(result.alternatives.length, 0);
});


test("handball accepts governed team-sports evidence but prefers exact handball evidence", () => {
  const broad = product({
    id: "broad-handball-team",
    title: "Indoor Team Court Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["team_sports"],
      surfaces: ["court_indoor"],
      useCases: ["handball_training"],
      supportLevel: "stability"
    }
  });
  const exact = product({
    id: "exact-handball",
    title: "Handball Indoor Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["handball"],
      surfaces: ["court_indoor"],
      useCases: ["handball_training"],
      supportLevel: "stability"
    }
  });
  const answers = {
    activity: "handball" as const,
    audience: "men" as const,
    surface: "court_indoor" as const,
    useCase: "handball_training" as const,
    priority: "stability" as const
  };

  const broadScore = scoreSportFitProduct(broad, answers);
  const exactScore = scoreSportFitProduct(exact, answers);
  const result = buildSportFitRecommendation([broad, exact], answers);

  assert.equal(broadScore.technicalEligible, true);
  assert.equal(exactScore.technicalEligible, true);
  assert.ok(exactScore.technicalScore > broadScore.technicalScore);
  assert.ok(broadScore.technicalRequirements.some((item) =>
    item.id === "requirement.activity_specificity" && item.status === "unknown"
  ));
  assert.ok(exactScore.technicalRequirements.some((item) =>
    item.id === "requirement.activity_specificity" && item.status === "match"
  ));
  assert.equal(result.primary?.id, "exact-handball");
});

test("badminton accepts governed racket-sports evidence but prefers exact badminton evidence", () => {
  const broad = product({
    id: "broad-badminton-racket",
    title: "Indoor Racket Court Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["racket_sports"],
      surfaces: ["court_indoor"],
      useCases: ["badminton_training"],
      cushioningLevel: "medium"
    }
  });
  const exact = product({
    id: "exact-badminton",
    title: "Badminton Indoor Shoe",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["badminton"],
      surfaces: ["court_indoor"],
      useCases: ["badminton_training"],
      cushioningLevel: "medium"
    }
  });
  const answers = {
    activity: "badminton" as const,
    audience: "women" as const,
    surface: "court_indoor" as const,
    useCase: "badminton_training" as const,
    priority: "lightweight" as const
  };

  const broadScore = scoreSportFitProduct(broad, answers);
  const exactScore = scoreSportFitProduct(exact, answers);
  const result = buildSportFitRecommendation([broad, exact], answers);

  assert.equal(broadScore.technicalEligible, true);
  assert.equal(exactScore.technicalEligible, true);
  assert.ok(exactScore.technicalScore > broadScore.technicalScore);
  assert.equal(result.primary?.id, "exact-badminton");
});

test("strict activity identity recognizes handball and badminton without admitting a generic sneaker", () => {
  const generic = product({
    id: "generic-court-sneaker",
    title: "Indoor Court Sneaker",
    categoryCode: "mens-sneakers"
  });
  const handball = product({
    id: "handball-title-signal",
    title: "Performance Handball Shoe",
    categoryCode: "mens-sneakers"
  });
  const badminton = product({
    id: "badminton-title-signal",
    title: "Performance Badminton Shoe",
    categoryCode: "mens-sneakers"
  });

  assert.equal(sportFitCandidateSupportsRequestedActivity(generic, {
    activity: "handball",
    audience: "men",
    surface: "court_indoor"
  }), false);
  assert.equal(sportFitCandidateSupportsRequestedActivity(handball, {
    activity: "handball",
    audience: "men",
    surface: "court_indoor"
  }), true);
  assert.equal(sportFitCandidateSupportsRequestedActivity(generic, {
    activity: "badminton",
    audience: "men",
    surface: "court_indoor"
  }), false);
  assert.equal(sportFitCandidateSupportsRequestedActivity(badminton, {
    activity: "badminton",
    audience: "men",
    surface: "court_indoor"
  }), true);
});

test("Sport & Fit answer parser accepts handball and badminton use cases", () => {
  const handball = parseSportFitAnswers({
    activity: "handball",
    audience: "men",
    surface: "court_indoor",
    useCase: "handball_match"
  });
  const badminton = parseSportFitAnswers({
    activity: "badminton",
    audience: "women",
    surface: "court_hard",
    useCase: "badminton_training"
  });

  assert.equal(handball.activity, "handball");
  assert.equal(handball.useCase, "handball_match");
  assert.equal(badminton.activity, "badminton");
  assert.equal(badminton.useCase, "badminton_training");
});

test("race-day request prefers exact governed race evidence over otherwise matching daily trainer", () => {
  const dailyTrainer = product({
    id: "duramo-rc2-daily",
    title: "Duramo RC2 Daily Running Shoe",
    categoryCode: "womens-running-shoes",
    sizes: ["38"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road", "track"],
      useCases: ["daily_training"],
      supportLevel: "neutral",
      fitLengthProfile: "true_to_size"
    }
  });
  const raceDocumented = product({
    id: "duramo-rc2-race",
    title: "Duramo RC2 Race-Documented Running Shoe",
    categoryCode: "womens-running-shoes",
    sizes: ["38"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road", "track"],
      useCases: ["daily_training", "race_day"],
      supportLevel: "neutral",
      fitLengthProfile: "true_to_size"
    }
  });

  const answers = {
    activity: "running" as const,
    audience: "women" as const,
    size: "EU 38",
    surface: "road" as const,
    useCase: "race_day" as const
  };

  const dailyScore = scoreSportFitProduct(dailyTrainer, answers);
  const raceScore = scoreSportFitProduct(raceDocumented, answers);
  const result = buildSportFitRecommendation([dailyTrainer, raceDocumented], answers);

  assert.equal(dailyScore.technicalEligible, true);
  assert.equal(raceScore.technicalEligible, true);
  assert.ok(raceScore.technicalScore > dailyScore.technicalScore);
  assert.equal(result.primary?.id, "duramo-rc2-race");
});

test("governed road and trail evidence matches both Runfalcon-style running surfaces", () => {
  const multiSurface = product({
    id: "governed-road-trail-runner",
    title: "All Terrain Running Shoe",
    categoryCode: "womens-running-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road", "trail"],
      fitLengthProfile: "true_to_size"
    }
  });

  const road = scoreSportFitProduct(multiSurface, {
    activity: "running",
    audience: "women",
    surface: "road"
  });
  const trail = scoreSportFitProduct(multiSurface, {
    activity: "running",
    audience: "women",
    surface: "trail"
  });

  assert.equal(road.technicalEligible, true);
  assert.equal(trail.technicalEligible, true);
  assert.ok(road.technicalRequirements.some((item) =>
    item.id === "requirement.surface" && item.status === "match"
  ));
  assert.ok(trail.technicalRequirements.some((item) =>
    item.id === "requirement.surface" && item.status === "match"
  ));
});

test("street-surface evidence on general-training footwear does not hard-reject a gym treadmill request", () => {
  const trainer = product({
    id: "general-training-street-shoe",
    title: "General Training Shoe",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["general_training"],
      surfaces: ["road"],
      fitLengthProfile: "true_to_size"
    }
  });

  const scored = scoreSportFitProduct(trainer, {
    activity: "gym",
    audience: "men",
    surface: "treadmill",
    gymTrainingType: "treadmill"
  });

  assert.equal(scored.technicalEligible, true);
  assert.equal(scored.appliedRules.includes("surface.known_mismatch"), false);
  assert.equal(scored.technicalRequirements.some((item) =>
    item.id === "requirement.surface" && item.status === "conflict"
  ), false);
});

test("exact basketball knowledge overrides a misleading generic sneaker catalogue label", () => {
  const b480 = product({
    id: "new-balance-gsb480",
    title: "Black And White Leather Athletic Sneakers",
    categoryCode: "womens-sneakers",
    brand: "New Balance",
    sizes: ["EU36/US6", "EU38/US8"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["basketball"]
    }
  });

  const basketball = scoreSportFitProduct(b480, {
    activity: "basketball",
    audience: "kids"
  });
  const walking = scoreSportFitProduct(b480, {
    activity: "walking",
    audience: "kids"
  });

  assert.equal(sportFitCandidateSupportsRequestedActivity(b480, {
    activity: "basketball",
    audience: "kids"
  }), true);
  assert.equal(basketball.technicalEligible, true);
  assert.ok(basketball.technicalRequirements.some((item) =>
    item.id === "requirement.activity" && item.status === "match"
  ));
  assert.equal(walking.technicalEligible, false);
  assert.ok(walking.technicalRequirements.some((item) =>
    item.id === "requirement.activity" && item.status === "conflict"
  ));
});

test("governed Advantage 2.0 walking identity blocks tennis-heritage heuristic contamination", () => {
  const advantage = product({
    id: "adidas-ig9166",
    title: "Advantage 2.0 Tennis-Inspired Shoes",
    categoryCode: "mens-sneakers",
    brand: "adidas",
    sizes: ["46"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["walking", "casual_lifestyle"],
      useCases: ["daily_walking"],
      fitLengthProfile: "true_to_size"
    }
  });

  const walking = scoreSportFitProduct(advantage, {
    activity: "walking",
    audience: "men",
    useCase: "daily_walking"
  });

  assert.equal(walking.technicalEligible, true);
  assert.ok(walking.technicalRequirements.some((item) =>
    item.id === "requirement.activity" && item.status === "match"
  ));
  assert.ok(walking.technicalRequirements.some((item) =>
    item.id === "requirement.use_case" && item.status === "match"
  ));
  assert.equal(sportFitCandidateSupportsRequestedActivity(advantage, {
    activity: "tennis",
    audience: "men",
    surface: "court_hard"
  }), false);
});


test("governed Cloudfoam Flex walking evidence overrides contradictory running title and category", () => {
  const cloudfoamFlex = product({
    id: "adidas-kj4808",
    title: "ADIDAS CLOUDFOAM FLEX-LACES WOMENS RUNNING SHOES",
    categoryCode: "womens-running-shoes",
    brand: "adidas",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["walking"],
      useCases: ["daily_walking"],
      widthProfile: "wide"
    }
  });

  const walking = scoreSportFitProduct(cloudfoamFlex, {
    activity: "walking",
    audience: "women",
    useCase: "daily_walking"
  });
  const running = scoreSportFitProduct(cloudfoamFlex, {
    activity: "running",
    audience: "women",
    surface: "road"
  });

  assert.equal(walking.technicalEligible, true);
  assert.ok(walking.technicalRequirements.some((item) =>
    item.id === "requirement.activity" && item.status === "match"
  ));
  assert.ok(walking.technicalRequirements.some((item) =>
    item.id === "requirement.use_case" && item.status === "match"
  ));
  assert.equal(sportFitCandidateSupportsRequestedActivity(cloudfoamFlex, {
    activity: "walking",
    audience: "women"
  }), true);

  assert.equal(running.technicalEligible, false);
  assert.ok(running.appliedRules.includes("activity.known_mismatch"));
  assert.equal(sportFitCandidateSupportsRequestedActivity(cloudfoamFlex, {
    activity: "running",
    audience: "women",
    surface: "road"
  }), false);
});

test("governed New Balance lifestyle identity blocks running-heritage contamination", () => {
  const heritageLifestyle = product({
    id: "new-balance-740-u740bm2",
    title: "New Balance 740 Daily Runner Running-Inspired Shoe",
    categoryCode: "mens-running-shoes",
    brand: "New Balance",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["casual_lifestyle"]
    }
  });

  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    surface: "road" as const
  };

  const scored = scoreSportFitProduct(heritageLifestyle, answers);
  assert.equal(scored.technicalEligible, false);
  assert.equal(sportFitCandidateSupportsRequestedActivity(heritageLifestyle, answers), false);
  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.activity" && item.status === "conflict"
  ));
});

test("governed casual-lifestyle footwear is hard-excluded from running despite athletic retailer wording", () => {
  const lifestyleOnly = product({
    id: "governed-lifestyle-only",
    title: "Performance Running Athletic Sneaker",
    categoryCode: "womens-running-shoes",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["casual_lifestyle"],
      fitLengthProfile: "true_to_size",
      dropMm: 8,
      weightG: 216
    }
  });

  const scored = scoreSportFitProduct(lifestyleOnly, {
    activity: "running",
    audience: "women",
    surface: "road"
  });
  const result = buildSportFitRecommendation([lifestyleOnly], {
    activity: "running",
    audience: "women",
    surface: "road"
  });

  assert.equal(scored.technicalEligible, false);
  assert.ok(scored.appliedRules.includes("activity.known_mismatch"));
  assert.equal(result.primary, undefined);
  assert.equal(result.ranked.length, 0);
});


test("exact gym-functional evidence satisfies a functional gym request without invented cushioning or support", () => {
  const genericGym = product({
    id: "generic-governed-gym",
    title: "Generic Gym Trainer",
    categoryCode: "mens-sneakers",
    priceMinor: 12000,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["gym_training"]
    }
  });
  const exactFunctional = product({
    id: "on-cloud-x-5-functional",
    title: "On Cloud X 5",
    categoryCode: "mens-sneakers",
    priceMinor: 12000,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["gym_training"],
      useCases: ["gym_functional"],
      fitLengthProfile: "true_to_size",
      dropMm: 8,
      weightG: 290
    }
  });

  const answers = {
    activity: "gym" as const,
    audience: "men" as const,
    gymTrainingType: "functional" as const
  };
  const genericScore = scoreSportFitProduct(genericGym, answers);
  const exactScore = scoreSportFitProduct(exactFunctional, answers);
  const result = buildSportFitRecommendation([genericGym, exactFunctional], answers);

  assert.equal(genericScore.technicalEligible, true);
  assert.equal(exactScore.technicalEligible, true);
  assert.ok(genericScore.technicalRequirements.some((item) =>
    item.id === "requirement.gym_training_type" && item.status === "unknown"
  ));
  assert.ok(exactScore.technicalRequirements.some((item) =>
    item.id === "requirement.gym_training_type" && item.status === "match"
  ));
  assert.ok(exactScore.technicalScore > genericScore.technicalScore);
  assert.equal(result.primary?.id, "on-cloud-x-5-functional");
});


test("resolved reference-size evidence keeps governed JR9087-like hiking knowledge recommendation-eligible", () => {
  const anylander = product({
    id: "jr9087-reference-size-resolved",
    title: "adidas Terrex Anylander Rain.Rdy",
    categoryCode: "mens-hiking-shoes",
    sizes: ["42 2/3"],
    knowledge: {
      status: "partial",
      queueStatus: "partial",
      identityQuality: "strong",
      activities: ["hiking"],
      surfaces: ["trail"],
      fitLengthProfile: "true_to_size",
      dropMm: 10,
      weightG: 390,
      weatherProtection: ["waterproof"]
    }
  });

  const answers = {
    activity: "hiking" as const,
    audience: "men" as const,
    surface: "trail" as const,
    priority: "weather" as const
  };
  const scored = scoreSportFitProduct(anylander, answers);
  const result = buildSportFitRecommendation([anylander], answers);

  assert.equal(scored.technicalEligible, true);
  assert.equal(sportFitCandidateSupportsRequestedActivity(anylander, answers), true);
  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.activity" && item.status === "match"
  ));
  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.surface" && item.status === "match"
  ));
  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.hiking_weather_protection" && item.status === "match"
  ));
  assert.equal(result.primary?.id, anylander.id);
});
test("governed Cloud X Tempo preserves hybrid gym-running activity without cross-sport leakage", () => {
  const cloudXTempo = product({
    id: "on-cloud-x-tempo-3mg30110969",
    title: "On Cloud X Tempo - smooth ride of a runner for mixed workouts",
    categoryCode: "mens-sneakers",
    brand: "ON",
    knowledge: {
      status: "partial",
      identityQuality: "strong",
      activities: ["gym_training", "running"],
      useCases: ["gym_functional"],
      fitLengthProfile: "true_to_size",
      dropMm: 8,
      weightG: 307
    }
  });

  const gymAnswers = {
    activity: "gym" as const,
    audience: "men" as const,
    gymTrainingType: "functional" as const
  };
  const runningAnswers = {
    activity: "running" as const,
    audience: "men" as const
  };
  const basketballAnswers = {
    activity: "basketball" as const,
    audience: "men" as const
  };

  const gym = scoreSportFitProduct(cloudXTempo, gymAnswers);
  const running = scoreSportFitProduct(cloudXTempo, runningAnswers);
  const basketball = scoreSportFitProduct(cloudXTempo, basketballAnswers);

  assert.equal(gym.technicalEligible, true);
  assert.ok(gym.technicalRequirements.some((item) =>
    item.id === "requirement.activity" && item.status === "match"
  ));
  assert.ok(gym.technicalRequirements.some((item) =>
    item.id === "requirement.gym_training_type" && item.status === "match"
  ));
  assert.equal(sportFitCandidateSupportsRequestedActivity(cloudXTempo, runningAnswers), true);
  assert.equal(running.technicalEligible, true);
  assert.equal(sportFitCandidateSupportsRequestedActivity(cloudXTempo, basketballAnswers), false);
  assert.equal(basketball.technicalEligible, false);
});
