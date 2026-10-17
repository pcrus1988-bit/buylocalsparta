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

test("governed running-shoe → running-sock edge is separately sourced and cannot invent product facts", () => {
  const shoe = product({
    id: "evidence-running-shoe", title: "Documented Running Shoe",
    categoryCode: "mens-running-shoes", sizes: ["42"],
    knowledge: { status: "partial", identityQuality: "strong", activities: ["running"], surfaces: ["road"] }
  });
  const sock = product({
    id: "evidence-running-sock", title: "Documented Running Sock",
    categoryCode: "socks-hosiery",
    knowledge: { status: "partial", identityQuality: "strong", activities: ["running"], moistureWicking: true }
  });
  const edge = {
    sportCode: "running" as const,
    useCase: "all",
    primaryRole: "footwear" as const,
    secondaryRole: "socks" as const,
    secondaryKind: "all",
    relationshipType: "recommended_with" as const,
    sourceUrl: "https://www.rei.com/learn/expert-advice/socks.html",
    sourceTitle: "REI: Choosing socks by sport",
    evidenceExcerpt: "Expert guidance describes running socks as suitable with running footwear.",
    confidence: 0.97
  };
  const out = buildSportFitRecommendation([shoe, sock], {
    activity: "running", audience: "men", size: "42", surface: "road"
  }, [edge]);
  assert.equal(out.primary?.id, shoe.id);
  assert.equal(out.kit[0]?.id, sock.id);
  assert.equal(out.kitCompatibility[0]?.relationshipType, "recommended_with");
  assert.equal(out.kitCompatibility[0]?.sourceUrl, edge.sourceUrl);
  assert.ok(out.kit[0]?.appliedRules.includes("kit.compatibility.recommended_with"));
  assert.ok(!out.kit[0]?.appliedRules.includes("football.shinguard_mandatory"));
  assert.equal(scoreSportFitProduct(sock, { activity: "running", audience: "men" }).role, "socks");
});

test("football match compulsory socks are use-case scoped; shinguards require verified subtype", () => {
  const boot = product({
    id: "football-boot", title: "Football FG Boot", categoryCode: "mens-sneakers",
    knowledge: { status: "verified", identityQuality: "strong", activities: ["football"] }
  });
  const sock = product({
    id: "football-sock", title: "Football Match Socks", categoryCode: "socks-hosiery",
    knowledge: { status: "verified", identityQuality: "strong", activities: ["football"] }
  });
  const generic = product({
    id: "generic-accessory", title: "Sport Bag", categoryCode: "fitness-accessories",
    knowledge: { status: "verified", identityQuality: "strong", activities: ["football"] }
  });
  const baseEdge = {
    sportCode: "football" as const, useCase: "football_match",
    primaryRole: "footwear" as const,
    secondaryRole: "socks" as const, secondaryKind: "all",
    relationshipType: "requires" as const,
    sourceUrl: "https://www.theifab.com/laws/latest/the-players-equipment/",
    sourceTitle: "IFAB 2026/27 Law 4",
    evidenceExcerpt: "Socks and shin guards are compulsory in football matches.",
    confidence: 1
  };
  const guardEdge = {
    ...baseEdge, secondaryRole: "accessory" as const,
    secondaryKind: "shin_guards"
  };
  const match = buildSportFitRecommendation([boot, sock, generic], {
    activity: "football", audience: "men", useCase: "football_match"
  }, [baseEdge, guardEdge]);
  assert.equal(match.kitCompatibility.find((i) => i.productId === sock.id)?.relationshipType, "requires");
  assert.ok(!match.kitCompatibility.some((i) => i.productId === generic.id));
  const training = buildSportFitRecommendation([boot, sock], {
    activity: "football", audience: "men", useCase: "football_training"
  }, [baseEdge, guardEdge]);
  assert.equal(training.kitCompatibility.length, 0);
});

test("compatibility edges never admit a stock-only secondary product or wrong sport", () => {
  const shoe = product({
    id: "hiking-primary", title: "Trail Hiking Shoe",
    categoryCode: "mens-hiking-shoes",
    knowledge: { status: "partial", identityQuality: "strong", activities: ["hiking"], surfaces: ["trail"] }
  });
  const generic = product({
    id: "unknown-sock", title: "Ordinary Sock", categoryCode: "socks-hosiery"
  });
  const edge = {
    sportCode: "hiking" as const, useCase: "all", primaryRole: "footwear" as const,
    secondaryRole: "socks" as const, secondaryKind: "all",
    relationshipType: "recommended_with" as const,
    sourceUrl: "https://www.rei.com/learn/expert-advice/socks.html",
    sourceTitle: "REI", evidenceExcerpt: "Hiking socks offer specialized foot comfort.",
    confidence: 0.99
  };
  const out = buildSportFitRecommendation([shoe, generic], {
    activity: "hiking", audience: "men", surface: "trail"
  }, [edge]);
  assert.equal(out.primary?.id, shoe.id);
  assert.equal(out.kit.some((item) => item.id === generic.id), false);
  assert.deepEqual(out.kitCompatibility, []);
});

test("evidence-backed incompatible-with relation blocks a whole kit role despite a positive score", () => {
  const shoe = product({
    id: "safe-shoe", title: "Safe Hiking Shoe", categoryCode: "mens-hiking-shoes",
    knowledge: { status: "partial", identityQuality: "strong", activities: ["hiking"], surfaces: ["trail"] }
  });
  const sock = product({
    id: "unsafe-sock", title: "Sock With Activity Evidence", categoryCode: "socks-hosiery",
    knowledge: { status: "partial", identityQuality: "strong", activities: ["hiking"], moistureWicking: true }
  });
  const shared = {
    sportCode: "hiking" as const, useCase: "all",
    primaryRole: "footwear" as const, secondaryRole: "socks" as const,
    secondaryKind: "all", confidence: 1,
    sourceUrl: "https://www.rei.com/learn/expert-advice/socks.html",
    sourceTitle: "Evidence guidance", evidenceExcerpt: "Curated sport equipment policy rule."
  };
  const result = buildSportFitRecommendation([shoe, sock], {
    activity: "hiking", audience: "men", surface: "trail"
  }, [
    { ...shared, relationshipType: "recommended_with" as const },
    { ...shared, relationshipType: "incompatible_with" as const }
  ]);
  assert.equal(result.primary?.id, shoe.id);
  assert.equal(result.kit.some((item) => item.id === sock.id), false);
  assert.deepEqual(result.kitCompatibility, []);
});
