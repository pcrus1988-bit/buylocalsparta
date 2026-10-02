import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSportFitRecommendation,
  scoreSportFitProduct,
  type SportFitProduct
} from "./sport-fit-engine.ts";

function product(
  overrides: Partial<SportFitProduct> & Pick<SportFitProduct, "id" | "title" | "categoryCode">
): SportFitProduct {
  return {
    slug: overrides.id,
    priceMinor: 5000,
    sizes: [],
    available: true,
    availableToSell: 5,
    ...overrides
  };
}

test("stock-only kit products no longer report full technical confidence", () => {
  const sock = product({
    id: "stock-only-sock",
    title: "Sport Sock",
    categoryCode: "socks-hosiery"
  });

  const scored = scoreSportFitProduct(sock, {
    activity: "running",
    audience: "men",
    frequency: "high"
  });

  assert.equal(scored.role, "socks");
  assert.ok(scored.technicalScore < 100);
  assert.ok(scored.technicalCoverage < 100);
  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.kit_activity" && item.status === "unknown"
  ));
  assert.ok(scored.technicalRequirements.some((item) =>
    item.id === "requirement.kit_moisture_management" && item.status === "unknown"
  ));
});

test("documented running and moisture management outrank a stock-only sock", () => {
  const documented = product({
    id: "documented-running-sock",
    title: "Running Performance Sock",
    categoryCode: "socks-hosiery",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      moistureWicking: true,
      breathabilityLevel: "high"
    }
  });
  const unknown = product({
    id: "unknown-running-sock",
    title: "Generic Sport Sock",
    categoryCode: "socks-hosiery"
  });
  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    frequency: "high" as const
  };

  const strong = scoreSportFitProduct(documented, answers);
  const weak = scoreSportFitProduct(unknown, answers);

  assert.ok(strong.technicalScore > weak.technicalScore);
  assert.ok(strong.technicalCoverage > weak.technicalCoverage);
  assert.ok(strong.appliedRules.includes("kit.activity_verified_match"));
  assert.ok(strong.appliedRules.includes("kit.moisture_management_verified"));
});

test("documented activity mismatch lowers kit confidence without hard-rejecting versatile apparel", () => {
  const runningTop = product({
    id: "running-top",
    title: "Running Technical Top",
    categoryCode: "fashion-mens-tshirts-tops",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      moistureWicking: true
    }
  });
  const footballTop = product({
    id: "football-top",
    title: "Football Training Top",
    categoryCode: "fashion-mens-tshirts-tops",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["football"],
      moistureWicking: true
    }
  });
  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    frequency: "high" as const
  };

  const running = scoreSportFitProduct(runningTop, answers);
  const football = scoreSportFitProduct(footballTop, answers);

  assert.equal(football.technicalEligible, true);
  assert.ok(running.technicalScore > football.technicalScore);
  assert.ok(football.technicalRequirements.some((item) =>
    item.id === "requirement.kit_activity" && item.status === "conflict"
  ));
});

test("sock cushioning preference uses governed sock cushioning evidence", () => {
  const cushioned = product({
    id: "cushioned-sock",
    title: "Cushioned Running Sock",
    categoryCode: "socks-hosiery",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      sockCushioning: "max"
    }
  });
  const unknown = product({
    id: "unknown-cushioning-sock",
    title: "Running Sock",
    categoryCode: "socks-hosiery",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"]
    }
  });
  const answers = {
    activity: "running" as const,
    audience: "men" as const,
    priority: "cushioning" as const
  };

  const strong = scoreSportFitProduct(cushioned, answers);
  const weak = scoreSportFitProduct(unknown, answers);

  assert.ok(strong.technicalScore > weak.technicalScore);
  assert.ok(strong.technicalRequirements.some((item) =>
    item.id === "requirement.sock_cushioning" && item.status === "match"
  ));
  assert.ok(strong.appliedRules.includes("kit.sock_cushioning_verified"));
});

test("hiking weather kit rewards documented weather protection and keeps missing facts unknown", () => {
  const protectedLayer = product({
    id: "protected-layer",
    title: "Outdoor Weather Jacket",
    categoryCode: "fashion-mens-activewear",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["hiking"],
      weatherProtection: ["water_resistant"],
      thermalLevel: "midweight"
    }
  });
  const unknownLayer = product({
    id: "unknown-layer",
    title: "Outdoor Jacket",
    categoryCode: "fashion-mens-activewear",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["hiking"]
    }
  });
  const answers = {
    activity: "hiking" as const,
    audience: "men" as const,
    priority: "weather" as const
  };

  const protectedScore = scoreSportFitProduct(protectedLayer, answers);
  const unknownScore = scoreSportFitProduct(unknownLayer, answers);

  assert.ok(protectedScore.technicalScore > unknownScore.technicalScore);
  assert.ok(protectedScore.technicalRequirements.some((item) =>
    item.id === "requirement.kit_weather_protection" && item.status === "match"
  ));
  assert.ok(unknownScore.technicalRequirements.some((item) =>
    item.id === "requirement.kit_weather_protection" && item.status === "unknown"
  ));
});

test("Complete My Kit chooses the better-evidenced sock within the same role", () => {
  const shoe = product({
    id: "running-shoe",
    title: "Road Running Shoe",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    priceMinor: 9000,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"],
      cushioningLevel: "high",
      supportLevel: "neutral"
    }
  });
  const documentedSock = product({
    id: "documented-kit-sock",
    title: "Technical Running Sock",
    categoryCode: "socks-hosiery",
    priceMinor: 1800,
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      useCases: ["daily_training"],
      moistureWicking: true,
      breathabilityLevel: "high"
    }
  });
  const genericSock = product({
    id: "generic-kit-sock",
    title: "Generic Sport Sock",
    categoryCode: "socks-hosiery",
    priceMinor: 1200
  });

  const result = buildSportFitRecommendation(
    [genericSock, documentedSock, shoe],
    {
      activity: "running",
      audience: "men",
      size: "42",
      surface: "road",
      useCase: "daily_training",
      frequency: "high"
    }
  );

  assert.equal(result.primary?.id, "running-shoe");
  assert.equal(result.kit.find((item) => item.role === "socks")?.id, "documented-kit-sock");
});


test("Complete My Kit stays empty without a Tier-1 primary match", () => {
  const sock = product({
    id: "secondary-only-sock",
    title: "Running Sock 43-46",
    categoryCode: "socks-hosiery",
    sizes: ["43-46"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      moistureWicking: true
    }
  });

  const result = buildSportFitRecommendation([sock], {
    activity: "running",
    audience: "men",
    size: "44",
    surface: "road"
  });

  assert.equal(result.primary, undefined);
  assert.equal(result.kit.length, 0);
});

test("Complete My Kit excludes an explicitly incompatible numeric sock range", () => {
  const shoe = product({
    id: "road-shoe-44",
    title: "Road Running Shoe",
    categoryCode: "mens-running-shoes",
    sizes: ["44"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"]
    }
  });
  const wrongSock = product({
    id: "sock-35-38",
    title: "Running Sock 35-38",
    categoryCode: "socks-hosiery",
    sizes: ["35-38"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      moistureWicking: true
    }
  });
  const matchingSock = product({
    id: "sock-43-46",
    title: "Running Sock 43-46",
    categoryCode: "socks-hosiery",
    sizes: ["43-46"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      moistureWicking: true
    }
  });

  const result = buildSportFitRecommendation([wrongSock, matchingSock, shoe], {
    activity: "running",
    audience: "men",
    size: "44",
    surface: "road"
  });

  assert.equal(result.primary?.id, "road-shoe-44");
  assert.equal(result.kit.find((item) => item.role === "socks")?.id, "sock-43-46");
});

test("known cross-sport activity conflicts do not occupy final kit slots", () => {
  const shoe = product({
    id: "running-primary",
    title: "Road Running Shoe",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"]
    }
  });
  const footballTop = product({
    id: "football-only-top",
    title: "Football Training Top",
    categoryCode: "fashion-mens-tshirts-tops",
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["football"],
      moistureWicking: true
    }
  });

  const result = buildSportFitRecommendation([footballTop, shoe], {
    activity: "running",
    audience: "men",
    size: "42",
    surface: "road",
    frequency: "high"
  });

  assert.equal(result.primary?.id, "running-primary");
  assert.equal(result.kit.some((item) => item.id === "football-only-top"), false);
});


test("stock-only secondary products stay browseable but do not become final kit recommendations", () => {
  const shoe = product({
    id: "evidenced-running-primary",
    title: "Road Running Shoe",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"],
      useCases: ["daily_training"]
    }
  });
  const genericSock = product({
    id: "stock-only-generic-sock",
    title: "Sport Sock",
    categoryCode: "socks-hosiery",
    sizes: ["40-46"]
  });

  const result = buildSportFitRecommendation([genericSock, shoe], {
    activity: "running",
    audience: "men",
    size: "42",
    surface: "road",
    useCase: "daily_training"
  });

  assert.equal(result.primary?.id, "evidenced-running-primary");
  assert.equal(result.kit.some((item) => item.id === "stock-only-generic-sock"), false);

  const scoredSock = scoreSportFitProduct(genericSock, {
    activity: "running",
    audience: "men",
    size: "42",
    surface: "road",
    useCase: "daily_training"
  });
  assert.equal(scoredSock.technicalEligible, true);
  assert.ok(scoredSock.score >= 20);
  assert.ok(scoredSock.technicalRequirements.some((item) =>
    item.id === "requirement.kit_activity" && item.status === "unknown"
  ));
});

test("one governed kit match is enough to admit a compatible secondary product", () => {
  const shoe = product({
    id: "primary-road-shoe",
    title: "Road Running Shoe",
    categoryCode: "mens-running-shoes",
    sizes: ["42"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"],
      surfaces: ["road"]
    }
  });
  const activitySock = product({
    id: "running-evidence-sock",
    title: "Running Sock",
    categoryCode: "socks-hosiery",
    sizes: ["40-46"],
    knowledge: {
      status: "verified",
      identityQuality: "strong",
      activities: ["running"]
    }
  });

  const result = buildSportFitRecommendation([activitySock, shoe], {
    activity: "running",
    audience: "men",
    size: "42",
    surface: "road"
  });

  assert.equal(result.kit.find((item) => item.role === "socks")?.id, "running-evidence-sock");
});
