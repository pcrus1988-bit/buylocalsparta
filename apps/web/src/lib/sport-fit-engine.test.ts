import assert from "node:assert/strict";
import test from "node:test";
import { buildSportFitRecommendation, parseSportFitAnswers, scoreSportFitProduct, type SportFitProduct } from "./sport-fit-engine.ts";

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
      useCases: ["technical_hiking"]
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
