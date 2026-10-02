import assert from "node:assert/strict";
import test from "node:test";
import { scoreSportFitProduct, type SportFitProduct } from "./sport-fit-engine.ts";

function product(
  overrides: Partial<SportFitProduct> & Pick<SportFitProduct, "id" | "title" | "categoryCode">
): SportFitProduct {
  return {
    slug: overrides.id,
    priceMinor: 9000,
    sizes: ["42"],
    available: true,
    availableToSell: 4,
    ...overrides
  };
}

test("walking cushioning priority separates documented cushioning profiles", () => {
  const cushioned = product({
    id: "walking-cushioned",
    title: "Walking Cushion",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["walking"],
      surfaces: ["road"],
      useCases: ["travel_walking"],
      cushioningLevel: "high"
    }
  });
  const low = product({
    id: "walking-low",
    title: "Walking Minimal",
    categoryCode: "mens-sneakers",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["walking"],
      surfaces: ["road"],
      useCases: ["travel_walking"],
      cushioningLevel: "low"
    }
  });
  const answers = {
    activity: "walking" as const,
    audience: "men" as const,
    surface: "road" as const,
    useCase: "travel_walking" as const,
    distance: "long" as const,
    frequency: "high" as const,
    priority: "cushioning" as const
  };

  const strong = scoreSportFitProduct(cushioned, answers);
  const weak = scoreSportFitProduct(low, answers);

  assert.ok(strong.technicalScore > weak.technicalScore);
  assert.ok(strong.technicalRequirements.some((item) =>
    item.id === "requirement.walking_cushioning_profile" && item.status === "match"
  ));
  assert.ok(weak.technicalRequirements.some((item) =>
    item.id === "requirement.walking_cushioning_profile" && item.status === "conflict"
  ));
});

test("hiking weather priority rewards documented protection without inventing it", () => {
  const protectedHike = product({
    id: "hiking-protected",
    title: "Trail Hiking Waterproof",
    categoryCode: "mens-hiking-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["hiking"],
      surfaces: ["trail"],
      useCases: ["technical_hike"],
      weatherProtection: ["waterproof"]
    }
  });
  const unknownProtection = product({
    id: "hiking-unknown-weather",
    title: "Trail Hiking",
    categoryCode: "mens-hiking-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["hiking"],
      surfaces: ["trail"],
      useCases: ["technical_hike"]
    }
  });
  const answers = {
    activity: "hiking" as const,
    audience: "men" as const,
    surface: "trail" as const,
    useCase: "technical_hike" as const,
    priority: "weather" as const
  };

  const documented = scoreSportFitProduct(protectedHike, answers);
  const unknown = scoreSportFitProduct(unknownProtection, answers);

  assert.ok(documented.technicalScore > unknown.technicalScore);
  assert.ok(documented.technicalRequirements.some((item) =>
    item.id === "requirement.hiking_weather_protection" && item.status === "match"
  ));
  assert.ok(unknown.technicalRequirements.some((item) =>
    item.id === "requirement.hiking_weather_protection" && item.status === "unknown"
  ));
});

test("tennis stability priority rewards documented stability while neutral stays unknown", () => {
  const stable = product({
    id: "tennis-stable",
    title: "Tennis Stability",
    categoryCode: "mens-tennis-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["tennis"],
      surfaces: ["court_hard"],
      useCases: ["tennis_training"],
      supportLevel: "stability"
    }
  });
  const neutral = product({
    id: "tennis-neutral",
    title: "Tennis Neutral",
    categoryCode: "mens-tennis-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["tennis"],
      surfaces: ["court_hard"],
      useCases: ["tennis_training"],
      supportLevel: "neutral"
    }
  });
  const answers = {
    activity: "tennis" as const,
    audience: "men" as const,
    surface: "court_hard" as const,
    useCase: "tennis_training" as const,
    priority: "stability" as const
  };

  const stableScore = scoreSportFitProduct(stable, answers);
  const neutralScore = scoreSportFitProduct(neutral, answers);

  assert.ok(stableScore.technicalScore > neutralScore.technicalScore);
  assert.ok(stableScore.technicalRequirements.some((item) =>
    item.id === "requirement.court_lateral_stability" && item.status === "match"
  ));
  assert.ok(neutralScore.technicalRequirements.some((item) =>
    item.id === "requirement.court_lateral_stability" && item.status === "unknown"
  ));
});

test("padel traction priority depends on documented court-surface compatibility", () => {
  const documented = product({
    id: "padel-surface",
    title: "Padel Court Shoe",
    categoryCode: "mens-padel-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["padel"],
      surfaces: ["court_artificial"],
      useCases: ["padel_match"]
    }
  });
  const unknownSurface = product({
    id: "padel-unknown-surface",
    title: "Padel Shoe",
    categoryCode: "mens-padel-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["padel"],
      useCases: ["padel_match"]
    }
  });
  const answers = {
    activity: "padel" as const,
    audience: "men" as const,
    surface: "court_artificial" as const,
    useCase: "padel_match" as const,
    priority: "traction" as const
  };

  const known = scoreSportFitProduct(documented, answers);
  const unknown = scoreSportFitProduct(unknownSurface, answers);

  assert.ok(known.technicalScore > unknown.technicalScore);
  assert.ok(known.technicalCoverage > unknown.technicalCoverage);
  assert.ok(known.technicalRequirements.some((item) =>
    item.id === "requirement.court_traction_surface" && item.status === "match"
  ));
});

test("basketball cushioning priority treats documented low cushioning as a conflict", () => {
  const cushioned = product({
    id: "basketball-cushioned",
    title: "Basketball Cushion",
    categoryCode: "mens-basketball-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["basketball"],
      surfaces: ["court_indoor"],
      useCases: ["basketball_match"],
      cushioningLevel: "high"
    }
  });
  const low = product({
    id: "basketball-low",
    title: "Basketball Low Cushion",
    categoryCode: "mens-basketball-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["basketball"],
      surfaces: ["court_indoor"],
      useCases: ["basketball_match"],
      cushioningLevel: "low"
    }
  });
  const answers = {
    activity: "basketball" as const,
    audience: "men" as const,
    surface: "court_indoor" as const,
    useCase: "basketball_match" as const,
    priority: "cushioning" as const
  };

  const high = scoreSportFitProduct(cushioned, answers);
  const lowScore = scoreSportFitProduct(low, answers);

  assert.ok(high.technicalScore > lowScore.technicalScore);
  assert.ok(lowScore.technicalRequirements.some((item) =>
    item.id === "requirement.court_cushioning_profile" && item.status === "conflict"
  ));
});

test("volleyball high-frequency use gets an explicit sport-specific requirement", () => {
  const shoe = product({
    id: "volleyball-training",
    title: "Volleyball Training Shoe",
    categoryCode: "mens-volleyball-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["volleyball"],
      surfaces: ["court_indoor"],
      useCases: ["volleyball_training"],
      supportLevel: "stability"
    }
  });

  const scored = scoreSportFitProduct(shoe, {
    activity: "volleyball",
    audience: "men",
    surface: "court_indoor",
    useCase: "volleyball_training",
    frequency: "high",
    priority: "stability"
  });

  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.court_frequency_profile" && item.status === "match"
  ));
  assert.ok(scored.appliedRules.includes("court.high_frequency_use"));
});
