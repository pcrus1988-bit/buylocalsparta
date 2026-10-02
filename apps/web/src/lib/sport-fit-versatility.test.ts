import assert from "node:assert/strict";
import test from "node:test";
import {
  scoreSportFitProduct,
  buildSportFitRecommendation,
  type SportFitProduct
} from "./sport-fit-engine.ts";

function product(
  overrides: Partial<SportFitProduct> & Pick<SportFitProduct, "id" | "title" | "categoryCode">
): SportFitProduct {
  return {
    slug: overrides.id,
    priceMinor: 8000,
    sizes: ["42"],
    available: true,
    availableToSell: 5,
    ...overrides
  };
}

test("versatility prefers documented breadth over a single-context footwear profile", () => {
  const broad = product({
    id: "broad-runner",
    title: "Multi Surface Daily Trainer",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running", "walking"],
      surfaces: ["road", "treadmill"],
      useCases: ["daily_training", "easy_run"],
      supportLevel: "neutral"
    }
  });
  const narrow = product({
    id: "single-context-runner",
    title: "Road Trainer",
    categoryCode: "mens-running-shoes",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"],
      supportLevel: "neutral"
    }
  });
  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    surface: "road" as const,
    priority: "versatility" as const
  };

  const broadScore = scoreSportFitProduct(broad, answers);
  const narrowScore = scoreSportFitProduct(narrow, answers);

  assert.ok(broadScore.technicalScore > narrowScore.technicalScore);
  assert.ok(broadScore.technicalRequirements.some((item) =>
    item.id === "requirement.versatility_profile" && item.status === "match"
  ));
  assert.ok(narrowScore.technicalRequirements.some((item) =>
    item.id === "requirement.versatility_profile" && item.status === "unknown"
  ));
  assert.ok(broadScore.appliedRules.includes("priority.versatility_verified"));
});

test("generic marketing language does not create verified versatility", () => {
  const generic = product({
    id: "generic-versatile-title",
    title: "Ultimate Versatile All Round Sport Shoe",
    categoryCode: "mens-running-shoes",
    description: "Versatile do-everything trainer for every day"
  });

  const scored = scoreSportFitProduct(generic, {
    activity: "running",
    audience: "men",
    priority: "versatility"
  });

  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.versatility_profile" && item.status === "unknown"
  ));
  assert.equal(scored.appliedRules.includes("priority.versatility_verified"), false);
});

test("broad general-training evidence can support kit versatility", () => {
  const top = product({
    id: "general-training-top",
    title: "General Training Top",
    categoryCode: "fashion-mens-tshirts-tops",
    sizes: ["M"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["general_training"],
      moistureWicking: true
    }
  });

  const scored = scoreSportFitProduct(top, {
    activity: "gym",
    audience: "men",
    priority: "versatility"
  });

  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.kit_versatility" && item.status === "match"
  ));
  assert.ok(scored.appliedRules.includes("kit.versatility_verified"));
});

test("recommendation ranking promotes governed versatility before price", () => {
  const broad = product({
    id: "broad-more-expensive",
    title: "Broad Running Trainer",
    categoryCode: "mens-running-shoes",
    priceMinor: 9000,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running", "walking"],
      surfaces: ["road", "treadmill"],
      useCases: ["daily_training", "easy_run"]
    }
  });
  const cheap = product({
    id: "cheap-single-use",
    title: "Cheap Road Running Trainer",
    categoryCode: "mens-running-shoes",
    priceMinor: 6000,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"]
    }
  });

  const result = buildSportFitRecommendation([cheap, broad], {
    activity: "running",
    audience: "men",
    surface: "road",
    priority: "versatility"
  });

  assert.equal(result.primary?.id, "broad-more-expensive");
});
