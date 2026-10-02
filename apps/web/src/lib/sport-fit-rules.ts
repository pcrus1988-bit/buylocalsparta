import type {
  SportFitAnswers,
  SportFitProduct,
  SportProductRole,
  SportSurface,
  SportFitTechnicalRequirement
} from "./sport-fit-engine.ts";

export const SPORT_FIT_RULESET_VERSION = "2026-10-02.7";

export type SportFitRuleEvaluation = Readonly<{
  eligible: boolean;
  adjustment: number;
  reasons: readonly string[];
  ruleIds: readonly string[];
  technicalScore: number;
  technicalCoverage: number;
  technicalRequirements: readonly SportFitTechnicalRequirement[];
  rejectionReason?: string;
}>;

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function values(values: readonly string[] | undefined): ReadonlySet<string> {
  return new Set((values ?? []).map(normalize).filter(Boolean));
}

function includesAny(actual: ReadonlySet<string>, expected: readonly string[]): boolean {
  return expected.some((item) => actual.has(normalize(item)));
}


type MutableRuleState = {
  adjustment: number;
  reasons: string[];
  ruleIds: string[];
  technicalRequirements: SportFitTechnicalRequirement[];
};

function requestedActivityValues(answers: SportFitAnswers): readonly string[] {
  if (answers.activity === "gym") {
    return answers.gymTrainingType === "treadmill"
      ? ["gym_training", "general_training", "running"]
      : ["gym_training", "general_training"];
  }
  if (answers.activity === "walking" && (answers.surface === "trail" || answers.surface === "mixed")) {
    return ["walking", "hiking"];
  }
  if (answers.activity === "football") return ["football", "team_sports"];
  if (answers.activity === "basketball") return ["basketball"];
  if (answers.activity === "tennis") return ["tennis"];
  if (answers.activity === "padel") return ["padel"];
  if (answers.activity === "volleyball") return ["volleyball"];
  return [answers.activity];
}

function addRequirement(
  state: MutableRuleState,
  id: string,
  weight: number,
  status: SportFitTechnicalRequirement["status"],
  reason?: string
) {
  state.technicalRequirements.push({ id, weight, status, reason });
}

function summarizeRequirements(requirements: readonly SportFitTechnicalRequirement[]): Readonly<{
  score: number;
  coverage: number;
}> {
  const active = requirements.filter((item) => item.status !== "not_applicable" && item.weight > 0);
  const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return { score: 50, coverage: 0 };

  let earned = 0;
  let covered = 0;
  for (const item of active) {
    if (item.status === "match") {
      earned += item.weight;
      covered += item.weight;
    } else if (item.status === "conflict") {
      // A documented conflict increases certainty about rejection/suitability,
      // but it must never count as positive compatibility coverage.
    } else {
      // Unknown facts remain unknown: they receive only a small neutral allowance,
      // never the same value as documented compatibility.
      earned += item.weight * 0.35;
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round((earned / totalWeight) * 100))),
    coverage: Math.max(0, Math.min(100, Math.round((covered / totalWeight) * 100)))
  };
}

function seedKitTechnicalRequirements(
  state: MutableRuleState,
  answers: SportFitAnswers,
  role: SportProductRole,
  activities: ReadonlySet<string>,
  useCases: ReadonlySet<string>,
  weatherProtection: ReadonlySet<string>,
  sockCushioning: string,
  moistureWicking: boolean | undefined,
  sockArchSupport: boolean | undefined,
  breathability: string,
  thermal: string,
  reflectiveDetails: boolean | undefined
) {
  if (!["socks", "top", "bottom", "layer", "accessory"].includes(role)) return;

  const requestedActivities = requestedActivityValues(answers);
  addRequirement(
    state,
    "requirement.kit_activity",
    20,
    activities.size ? (includesAny(activities, requestedActivities) ? "match" : "conflict") : "unknown",
    activities.size
      ? "Τεκμηριωμένη δραστηριότητα για το συμπληρωματικό προϊόν"
      : "Η δραστηριότητα του συμπληρωματικού προϊόντος δεν έχει ακόμη τεκμηριωθεί"
  );

  if (answers.useCase) {
    addRequirement(
      state,
      "requirement.kit_use_case",
      8,
      useCases.has(normalize(answers.useCase)) ? "match" : "unknown",
      useCases.has(normalize(answers.useCase))
        ? "Τεκμηριωμένος τύπος χρήσης για το σετ"
        : "Δεν υπάρχει ακόμη ειδική τεκμηρίωση για αυτόν τον τύπο χρήσης"
    );
  }

  if (answers.priority === "versatility") {
    const broadKitEvidence =
      activities.size >= 2
      || useCases.size >= 2
      || activities.has("general_training")
      || activities.has("team_sports")
      || activities.has("racket_sports");
    addRequirement(
      state,
      "requirement.kit_versatility",
      9,
      broadKitEvidence ? "match" : "unknown",
      broadKitEvidence
        ? "Τεκμηριωμένη ευελιξία δραστηριοτήτων / χρήσεων"
        : "Η ευελιξία χρήσεων δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  const performanceRole = role === "socks" || role === "top" || role === "bottom" || role === "layer";
  const sweatContext =
    answers.frequency === "high"
    || answers.activity === "running"
    || answers.activity === "gym"
    || answers.activity === "football"
    || ["basketball", "tennis", "padel", "volleyball"].includes(answers.activity);

  if (performanceRole && sweatContext) {
    addRequirement(
      state,
      "requirement.kit_moisture_management",
      10,
      moistureWicking === true ? "match" : moistureWicking === false ? "conflict" : "unknown",
      moistureWicking === true
        ? "Τεκμηριωμένη απομάκρυνση υγρασίας"
        : moistureWicking === false
          ? "Δεν δηλώνεται λειτουργία απομάκρυνσης υγρασίας"
          : "Η απομάκρυνση υγρασίας δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (performanceRole && (answers.frequency === "high" || answers.priority === "comfort")) {
    addRequirement(
      state,
      "requirement.kit_breathability",
      8,
      breathability === "high" || breathability === "medium"
        ? "match"
        : breathability === "low"
          ? "conflict"
          : "unknown",
      breathability
        ? "Τεκμηριωμένο επίπεδο διαπνοής"
        : "Η διαπνοή δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (role === "socks" && (answers.priority === "comfort" || answers.priority === "cushioning")) {
    addRequirement(
      state,
      "requirement.sock_cushioning",
      9,
      ["medium", "max"].includes(sockCushioning)
        ? "match"
        : answers.priority === "cushioning" && sockCushioning === "none"
          ? "conflict"
          : "unknown",
      sockCushioning
        ? "Τεκμηριωμένο cushioning κάλτσας"
        : "Το cushioning της κάλτσας δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (role === "socks" && answers.priority === "stability") {
    addRequirement(
      state,
      "requirement.sock_arch_support",
      7,
      sockArchSupport === true ? "match" : "unknown",
      sockArchSupport === true
        ? "Τεκμηριωμένη κατασκευή στήριξης καμάρας"
        : "Η κατασκευή στήριξης καμάρας δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (
    (role === "top" || role === "bottom" || role === "layer" || role === "socks")
    && answers.priority === "weather"
  ) {
    addRequirement(
      state,
      "requirement.kit_weather_protection",
      10,
      weatherProtection.size ? "match" : "unknown",
      weatherProtection.size
        ? "Τεκμηριωμένη προστασία από καιρό"
        : "Η προστασία από καιρό δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (
    (role === "layer" || role === "socks")
    && answers.activity === "hiking"
    && answers.priority === "weather"
  ) {
    addRequirement(
      state,
      "requirement.kit_thermal_profile",
      7,
      ["midweight", "thermal"].includes(thermal) ? "match" : thermal === "lightweight" ? "unknown" : "unknown",
      thermal
        ? "Τεκμηριωμένο θερμικό προφίλ"
        : "Το θερμικό προφίλ δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (
    (role === "top" || role === "bottom" || role === "layer")
    && answers.activity === "running"
    && (answers.frequency === "high" || answers.priority === "weather")
  ) {
    addRequirement(
      state,
      "requirement.kit_visibility",
      5,
      reflectiveDetails === true ? "match" : "unknown",
      reflectiveDetails === true
        ? "Τεκμηριωμένες ανακλαστικές λεπτομέρειες"
        : "Οι ανακλαστικές λεπτομέρειες δεν έχουν ακόμη τεκμηριωθεί"
    );
  }
}

function seedTechnicalRequirements(
  state: MutableRuleState,
  product: SportFitProduct,
  answers: SportFitAnswers,
  role: SportProductRole,
  activities: ReadonlySet<string>,
  surfaces: ReadonlySet<string>,
  useCases: ReadonlySet<string>,
  weatherProtection: ReadonlySet<string>,
  cushioning: string,
  support: string,
  width: string,
  footballCode: string,
  weightG: number | undefined,
  sockCushioning: string,
  moistureWicking: boolean | undefined,
  sockArchSupport: boolean | undefined,
  breathability: string,
  thermal: string,
  reflectiveDetails: boolean | undefined
) {
  addRequirement(
    state,
    "requirement.stock",
    18,
    product.available && product.availableToSell > 0 ? "match" : "conflict",
    product.available && product.availableToSell > 0 ? "Διαθέσιμο απόθεμα" : "Χωρίς διαθέσιμο απόθεμα"
  );

  if (role !== "footwear") {
    seedKitTechnicalRequirements(
      state,
      answers,
      role,
      activities,
      useCases,
      weatherProtection,
      sockCushioning,
      moistureWicking,
      sockArchSupport,
      breathability,
      thermal,
      reflectiveDetails
    );
    return;
  }

  const requestedActivities = requestedActivityValues(answers);
  addRequirement(
    state,
    "requirement.activity",
    22,
    activities.size ? (includesAny(activities, requestedActivities) ? "match" : "conflict") : "unknown",
    activities.size ? "Τεκμηριωμένη δραστηριότητα" : "Η τεχνική δραστηριότητα δεν έχει ακόμη τεκμηριωθεί"
  );

  if (
    answers.surface
    && ["running", "walking", "football", "hiking", "basketball", "tennis", "padel", "volleyball"].includes(answers.activity)
  ) {
    addRequirement(
      state,
      "requirement.surface",
      18,
      surfaces.size ? (knownSurfaceMatches(answers.surface, surfaces) ? "match" : "conflict") : "unknown",
      surfaces.size ? "Τεκμηριωμένη συμβατότητα επιφάνειας" : "Η επιφάνεια δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (answers.useCase) {
    addRequirement(
      state,
      "requirement.use_case",
      12,
      useCases.size ? (useCases.has(normalize(answers.useCase)) ? "match" : "conflict") : "unknown",
      useCases.size ? "Τεκμηριωμένος τύπος χρήσης" : "Ο συγκεκριμένος τύπος χρήσης δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (answers.fitPreference) {
    let fitStatus: SportFitTechnicalRequirement["status"] = "unknown";
    if (width) {
      if (answers.fitPreference === "wide") fitStatus = width === "wide" || width === "extra_wide" ? "match" : width === "narrow" ? "conflict" : "unknown";
      else if (answers.fitPreference === "narrow") fitStatus = width === "narrow" ? "match" : width === "extra_wide" ? "conflict" : "unknown";
      else fitStatus = width === "standard" ? "match" : "unknown";
    }
    addRequirement(state, "requirement.fit_width", 10, fitStatus, width ? "Τεκμηριωμένο width profile" : "Το width profile δεν έχει ακόμη τεκμηριωθεί");
  }

  if (answers.priority === "versatility") {
    const broadFootwearEvidence =
      activities.size >= 2
      || surfaces.size >= 2
      || useCases.size >= 2
      || activities.has("general_training")
      || activities.has("team_sports")
      || activities.has("racket_sports");
    addRequirement(
      state,
      "requirement.versatility_profile",
      12,
      broadFootwearEvidence ? "match" : "unknown",
      broadFootwearEvidence
        ? "Τεκμηριωμένο εύρος δραστηριοτήτων / επιφανειών / χρήσεων"
        : "Το εύρος χρήσεων δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (answers.activity === "football" && answers.surface) {
    const compatibility = footballCodeCompatibility(answers.surface, footballCode);
    addRequirement(
      state,
      "requirement.football_outsole",
      24,
      compatibility === "match" ? "match" : compatibility === "mismatch" ? "conflict" : "unknown",
      footballCode ? `Τεκμηριωμένος τύπος σόλας ${footballCode.toUpperCase()}` : "Ο τύπος ποδοσφαιρικής σόλας δεν έχει ακόμη τεκμηριωθεί"
    );
  }

  if (answers.activity === "running") {
    if (answers.distance) {
      let status: SportFitTechnicalRequirement["status"] = "unknown";
      if (answers.distance === "long") {
        if (useCases.has("long_run") || cushioning === "high" || cushioning === "max") status = "match";
        else if (cushioning === "minimal" || cushioning === "low") status = "conflict";
      } else if (answers.distance === "short") {
        if (useCases.has("speed_training") || useCases.has("race_day") || (typeof weightG === "number" && weightG <= 280)) status = "match";
      } else if (useCases.has("daily_training") || useCases.has("easy_run")) {
        status = "match";
      }
      addRequirement(state, "requirement.running_distance_profile", 14, status, "Τεχνικό προφίλ για τη συνήθη απόσταση");
    }

    if (answers.frequency && answers.frequency !== "light") {
      const status = useCases.has("daily_training") || cushioning === "high" || cushioning === "max" ? "match" : "unknown";
      addRequirement(state, "requirement.running_frequency_profile", 10, status, "Τεχνικό προφίλ για τη συχνότητα χρήσης");
    }

    if (answers.runnerNeed) {
      let status: SportFitTechnicalRequirement["status"] = "unknown";
      if (answers.runnerNeed === "guided_support") {
        if (["guided", "stability", "max_support"].includes(support)) status = "match";
        else if (support === "neutral") status = "conflict";
      } else if (answers.runnerNeed === "neutral") {
        if (support === "neutral") status = "match";
        else if (support === "max_support") status = "conflict";
      } else if (answers.runnerNeed === "soft_ride") {
        if (cushioning === "high" || cushioning === "max") status = "match";
        else if (cushioning === "minimal" || cushioning === "low") status = "conflict";
      } else if (answers.runnerNeed === "speed") {
        if (useCases.has("speed_training") || useCases.has("race_day") || (typeof weightG === "number" && weightG <= 280)) status = "match";
      } else if (answers.runnerNeed === "wide_fit") {
        if (width === "wide" || width === "extra_wide") status = "match";
        else if (width === "narrow") status = "conflict";
      } else if (useCases.has("daily_training")) {
        status = "match";
      }
      addRequirement(state, "requirement.running_runner_need", 18, status, "Τεχνική αντιστοίχιση της ανάγκης του δρομέα");
    }
  }

  if (answers.activity === "gym" && answers.gymTrainingType) {
    let status: SportFitTechnicalRequirement["status"] = "unknown";
    if (answers.gymTrainingType === "strength") {
      if (useCases.has("gym_strength") || ["stability", "guided", "max_support"].includes(support) || ["minimal", "low", "medium"].includes(cushioning)) status = "match";
      if ((cushioning === "high" || cushioning === "max") && support === "neutral") status = "conflict";
    } else if (answers.gymTrainingType === "cardio" || answers.gymTrainingType === "treadmill") {
      if (useCases.has("gym_cardio") || ["medium", "high", "max"].includes(cushioning)) status = "match";
      else if (cushioning === "minimal" || cushioning === "low") status = "conflict";
    } else if (answers.gymTrainingType === "functional") {
      if (activities.has("general_training") || activities.has("gym_training")) {
        status = support === "stability" || cushioning === "medium" ? "match" : "unknown";
      }
    } else if (answers.gymTrainingType === "mixed" && (activities.has("general_training") || activities.has("gym_training"))) {
      status = "match";
    }
    addRequirement(state, "requirement.gym_training_type", 24, status, "Τεχνικό προφίλ για τον τύπο προπόνησης");
  }

  if (answers.activity === "walking") {
    if (answers.distance === "long" || answers.frequency === "high") {
      const enduranceStatus: SportFitTechnicalRequirement["status"] =
        includesAny(useCases, ["daily_walking", "all_day_standing", "travel_walking"])
        || cushioning === "high"
        || cushioning === "max"
          ? "match"
          : "unknown";
      addRequirement(
        state,
        "requirement.walking_endurance_profile",
        12,
        enduranceStatus,
        "Τεχνικό προφίλ για παρατεταμένο περπάτημα"
      );
    }

    if (answers.priority === "comfort") {
      const comfortStatus: SportFitTechnicalRequirement["status"] =
        includesAny(useCases, ["daily_walking", "all_day_standing", "travel_walking"])
        || ["medium", "high", "max"].includes(cushioning)
          ? "match"
          : "unknown";
      addRequirement(
        state,
        "requirement.walking_comfort_profile",
        10,
        comfortStatus,
        "Τεκμηρίωση για άνεση σε καθημερινό / πολύωρο περπάτημα"
      );
    } else if (answers.priority === "cushioning") {
      const cushioningStatus: SportFitTechnicalRequirement["status"] =
        ["medium", "high", "max"].includes(cushioning)
          ? "match"
          : ["minimal", "low"].includes(cushioning)
            ? "conflict"
            : "unknown";
      addRequirement(
        state,
        "requirement.walking_cushioning_profile",
        12,
        cushioningStatus,
        "Τεχνικό προφίλ απορρόφησης για περπάτημα"
      );
    } else if (answers.priority === "traction" && answers.surface) {
      addRequirement(
        state,
        "requirement.walking_traction_surface",
        10,
        surfaces.size ? (knownSurfaceMatches(answers.surface, surfaces) ? "match" : "conflict") : "unknown",
        "Τεκμηριωμένη συμβατότητα επιφάνειας για πρόσφυση"
      );
    } else if (answers.priority === "weather") {
      addRequirement(
        state,
        "requirement.walking_weather_protection",
        10,
        weatherProtection.size ? "match" : "unknown",
        weatherProtection.size ? "Τεκμηριωμένη προστασία από καιρό" : "Η προστασία από καιρό δεν έχει ακόμη τεκμηριωθεί"
      );
    }
  }

  if (answers.activity === "hiking") {
    if (answers.useCase === "technical_hike") {
      const technicalTerrainStatus: SportFitTechnicalRequirement["status"] =
        useCases.has("technical_hike")
          || includesAny(surfaces, ["trail", "mixed"])
          ? "match"
          : useCases.size || surfaces.size
            ? "conflict"
            : "unknown";
      addRequirement(
        state,
        "requirement.hiking_technical_terrain",
        18,
        technicalTerrainStatus,
        "Τεχνικό terrain / trail προφίλ πεζοπορίας"
      );
    } else if (answers.useCase === "day_hike" || answers.useCase === "urban_outdoor") {
      addRequirement(
        state,
        "requirement.hiking_use_case_profile",
        12,
        useCases.size ? (useCases.has(normalize(answers.useCase)) ? "match" : "conflict") : "unknown",
        "Τεκμηριωμένος τύπος πεζοπορίας / outdoor χρήσης"
      );
    }

    if (answers.priority === "weather") {
      addRequirement(
        state,
        "requirement.hiking_weather_protection",
        14,
        weatherProtection.size ? "match" : "unknown",
        weatherProtection.size ? "Τεκμηριωμένη προστασία από νερό / άνεμο" : "Η προστασία από καιρό δεν έχει ακόμη τεκμηριωθεί"
      );
    }

    if (answers.priority === "traction" && answers.surface) {
      addRequirement(
        state,
        "requirement.hiking_traction_surface",
        14,
        surfaces.size ? (knownSurfaceMatches(answers.surface, surfaces) ? "match" : "conflict") : "unknown",
        "Τεκμηριωμένη συμβατότητα terrain για πρόσφυση"
      );
    }
  }

  if (["basketball", "tennis", "padel", "volleyball"].includes(answers.activity)) {
    if (answers.priority === "stability") {
      const stabilityStatus: SportFitTechnicalRequirement["status"] =
        ["guided", "stability", "max_support"].includes(support) ? "match" : "unknown";
      addRequirement(
        state,
        "requirement.court_lateral_stability",
        14,
        stabilityStatus,
        "Τεκμηριωμένο προφίλ σταθερότητας για αλλαγές κατεύθυνσης"
      );
    }

    if (answers.priority === "cushioning" || answers.priority === "comfort") {
      const courtCushioningStatus: SportFitTechnicalRequirement["status"] =
        ["medium", "high", "max"].includes(cushioning)
          ? "match"
          : answers.priority === "cushioning" && ["minimal", "low"].includes(cushioning)
            ? "conflict"
            : "unknown";
      addRequirement(
        state,
        "requirement.court_cushioning_profile",
        12,
        courtCushioningStatus,
        "Τεχνικό cushioning profile για court sport"
      );
    }

    if (answers.priority === "traction" && answers.surface) {
      addRequirement(
        state,
        "requirement.court_traction_surface",
        14,
        surfaces.size ? (knownSurfaceMatches(answers.surface, surfaces) ? "match" : "conflict") : "unknown",
        "Τεκμηριωμένη συμβατότητα court επιφάνειας για πρόσφυση"
      );
    }

    if (answers.frequency === "high") {
      const activityTrainingUseCase = `${answers.activity}_training`;
      const activityMatchUseCase = `${answers.activity}_match`;
      addRequirement(
        state,
        "requirement.court_frequency_profile",
        8,
        includesAny(useCases, [activityTrainingUseCase, activityMatchUseCase]) ? "match" : "unknown",
        "Τεκμηριωμένο sport-specific use case για συχνή χρήση"
      );
    }
  }
}

function knownSurfaceMatches(surface: SportSurface, actual: ReadonlySet<string>): boolean {
  if (!actual.size) return true;
  if (surface === "road") return includesAny(actual, ["road"]);
  if (surface === "treadmill") return includesAny(actual, ["treadmill", "indoor"]);
  if (surface === "trail") return includesAny(actual, ["trail"]);
  if (surface === "indoor") return includesAny(actual, ["indoor"]);
  if (surface === "grass") return includesAny(actual, ["natural_grass_firm", "natural_grass_soft", "multi_ground"]);
  if (surface === "artificial") return includesAny(actual, ["artificial_grass", "turf", "multi_ground"]);
  if (surface === "court_hard") return includesAny(actual, ["court_hard"]);
  if (surface === "court_clay") return includesAny(actual, ["court_clay"]);
  if (surface === "court_indoor") return includesAny(actual, ["court_indoor", "indoor"]);
  if (surface === "court_outdoor") return includesAny(actual, ["court_outdoor"]);
  if (surface === "court_artificial") return includesAny(actual, ["court_artificial"]);
  if (surface === "sand") return includesAny(actual, ["sand"]);
  return includesAny(actual, ["mixed", "road", "trail"]);
}

function footballCodeCompatibility(surface: SportSurface | undefined, code: string): "match" | "mismatch" | "unknown" {
  if (!surface || !code) return "unknown";
  if (surface === "grass") return ["fg", "mg"].includes(code) ? "match" : "mismatch";
  if (surface === "artificial") return ["ag", "mg", "tf"].includes(code) ? "match" : "mismatch";
  if (surface === "indoor") return code === "in" ? "match" : "mismatch";
  return "unknown";
}

function push(
  state: MutableRuleState,
  ruleId: string,
  adjustment: number,
  reason?: string
) {
  state.adjustment += adjustment;
  state.ruleIds.push(ruleId);
  if (reason) state.reasons.push(reason);
}

function reject(ruleId: string, reason: string, state: MutableRuleState): SportFitRuleEvaluation {
  const technical = summarizeRequirements(state.technicalRequirements);
  return {
    eligible: false,
    adjustment: state.adjustment,
    reasons: [reason, ...state.reasons].slice(0, 4),
    ruleIds: [ruleId, ...state.ruleIds],
    technicalScore: technical.score,
    technicalCoverage: technical.coverage,
    technicalRequirements: state.technicalRequirements,
    rejectionReason: reason
  };
}

export function evaluateSportFitRules(
  product: SportFitProduct,
  answers: SportFitAnswers,
  role: SportProductRole
): SportFitRuleEvaluation {
  const state: MutableRuleState = { adjustment: 0, reasons: [], ruleIds: [], technicalRequirements: [] };
  const candidateKnowledge = product.knowledge;
  const knowledge = candidateKnowledge
    && candidateKnowledge.queueStatus !== "blocked"
    && candidateKnowledge.status !== "conflict"
    && candidateKnowledge.status !== "insufficient"
    && candidateKnowledge.identityQuality !== "weak"
      ? candidateKnowledge
      : undefined;
  const activities = values(knowledge?.activities);
  const surfaces = values(knowledge?.surfaces);
  const useCases = values(knowledge?.useCases);
  const weatherProtection = values(knowledge?.weatherProtection);
  const cushioning = normalize(knowledge?.cushioningLevel);
  const support = normalize(knowledge?.supportLevel);
  const width = normalize(knowledge?.widthProfile);
  const lengthFit = normalize(knowledge?.fitLengthProfile);
  const footballCode = normalize(knowledge?.footballSurfaceCode);
  const sockCushioning = normalize(knowledge?.sockCushioning);
  const breathability = normalize(knowledge?.breathabilityLevel);
  const thermal = normalize(knowledge?.thermalLevel);

  seedTechnicalRequirements(
    state,
    product,
    answers,
    role,
    activities,
    surfaces,
    useCases,
    weatherProtection,
    cushioning,
    support,
    width,
    footballCode,
    knowledge?.weightG,
    sockCushioning,
    knowledge?.moistureWicking,
    knowledge?.sockArchSupport,
    breathability,
    thermal,
    knowledge?.reflectiveDetails
  );

  if (!product.available || product.availableToSell <= 0) {
    return reject("stock.positive_required", "Δεν υπάρχει διαθέσιμο απόθεμα τώρα", state);
  }

  if (role !== "footwear" && ["socks", "top", "bottom", "layer", "accessory"].includes(role)) {
    const requestedActivities = requestedActivityValues(answers);
    if (activities.size && includesAny(activities, requestedActivities)) {
      push(state, "kit.activity_verified_match", 7);
    }
    if (answers.useCase && useCases.has(normalize(answers.useCase))) {
      push(state, "kit.use_case_verified_match", 5);
    }
    if (knowledge?.moistureWicking === true) {
      push(state, "kit.moisture_management_verified", 4);
    }
    if (
      answers.priority === "weather"
      && weatherProtection.size
      && (role === "socks" || role === "top" || role === "bottom" || role === "layer")
    ) {
      push(state, "kit.weather_protection_verified", 5);
    }
    if (
      role === "socks"
      && answers.priority === "cushioning"
      && ["medium", "max"].includes(sockCushioning)
    ) {
      push(state, "kit.sock_cushioning_verified", 5);
    }
  }

  if (
    answers.priority === "versatility"
    && role !== "footwear"
    && ["socks", "top", "bottom", "layer", "accessory"].includes(role)
    && (
      activities.size >= 2
      || useCases.size >= 2
      || activities.has("general_training")
      || activities.has("team_sports")
      || activities.has("racket_sports")
    )
  ) {
    push(state, "kit.versatility_verified", 4);
  }

  if (
    answers.priority === "versatility"
    && role === "footwear"
    && (
      activities.size >= 2
      || surfaces.size >= 2
      || useCases.size >= 2
      || activities.has("general_training")
      || activities.has("team_sports")
      || activities.has("racket_sports")
    )
  ) {
    push(state, "priority.versatility_verified", 8, "Τεχνικός κανόνας: τεκμηριωμένο εύρος χρήσεων");
  }

  if (role === "footwear" && activities.size) {
    const requested = requestedActivityValues(answers);

    if (!includesAny(activities, requested)) {
      return reject(
        "activity.known_mismatch",
        "Η τεκμηριωμένη χρήση του παπουτσιού δεν ταιριάζει με τη δραστηριότητα",
        state
      );
    }
    push(state, "activity.verified_match", 8, "Τεχνικός κανόνας: τεκμηριωμένη χρήση για τη δραστηριότητα");
  }

  if (
    role === "footwear"
    && answers.surface
    && surfaces.size
    && ["running", "walking", "football", "hiking", "basketball", "tennis", "padel", "volleyball"].includes(answers.activity)
    && !knownSurfaceMatches(answers.surface, surfaces)
  ) {
    return reject(
      "surface.known_mismatch",
      "Η τεκμηριωμένη επιφάνεια του παπουτσιού δεν ταιριάζει με τη χρήση",
      state
    );
  }

  if (answers.useCase && useCases.size && useCases.has(normalize(answers.useCase))) {
    push(state, "use_case.verified_match", 12, "Τεχνικός κανόνας: τεκμηριωμένη χρήση / τύπος προπόνησης");
  }

  if (answers.activity === "football" && role === "footwear") {
    const compatibility = footballCodeCompatibility(answers.surface, footballCode);
    if (compatibility === "mismatch") {
      return reject(
        "football.boot_surface_mismatch",
        "Ο τεκμηριωμένος τύπος σόλας δεν είναι συμβατός με το γήπεδο",
        state
      );
    }
    if (compatibility === "match") {
      push(
        state,
        "football.boot_surface_match",
        24,
        `Κανόνας ποδοσφαίρου: ${footballCode.toUpperCase()} συμβατό με το επιλεγμένο γήπεδο`
      );
    } else if (answers.surface && knownSurfaceMatches(answers.surface, surfaces) && surfaces.size) {
      push(state, "football.surface_match", 12, "Κανόνας ποδοσφαίρου: τεκμηριωμένη συμβατότητα γηπέδου");
    }
  }

  if (answers.fitPreference && role === "footwear" && width) {
    if (answers.fitPreference === "wide") {
      if (width === "narrow") {
        return reject("fit.wide_reject_narrow", "Το τεκμηριωμένο στενό fit δεν ταιριάζει στην ανάγκη για φαρδιά εφαρμογή", state);
      }
      if (width === "wide" || width === "extra_wide") {
        push(state, "fit.wide_match", 14, "Κανόνας εφαρμογής: τεκμηριωμένο φαρδύ fit");
      }
    } else if (answers.fitPreference === "narrow") {
      if (width === "narrow") push(state, "fit.narrow_match", 12, "Κανόνας εφαρμογής: τεκμηριωμένο στενότερο fit");
      if (width === "extra_wide") push(state, "fit.narrow_vs_extra_wide", -10);
    } else if (width === "standard") {
      push(state, "fit.standard_match", 6, "Κανόνας εφαρμογής: τεκμηριωμένο standard fit");
    }
  }

  if (role === "footwear" && lengthFit === "true_to_size") {
    push(state, "fit.true_to_size", 4, "Τεκμηριωμένη εφαρμογή true-to-size");
  }

  if (answers.activity === "running" && role === "footwear") {
    if (answers.surface && surfaces.size && knownSurfaceMatches(answers.surface, surfaces)) {
      push(state, "running.surface_match", 12, "Τεκμηριωμένη καταλληλότητα επιφάνειας · κανόνας τρεξίματος");
    }

    if (answers.distance === "long") {
      if (useCases.has("long_run")) push(state, "running.long_run_use_case", 16, "Κανόνας τρεξίματος: τεκμηριωμένο long-run use case");
      if (cushioning === "high" || cushioning === "max") push(state, "running.long_cushioning", 10, "Κανόνας τρεξίματος: αυξημένο cushioning για μεγάλη απόσταση");
      if (cushioning === "minimal" || cushioning === "low") push(state, "running.long_low_cushioning", -12);
    } else if (answers.distance === "short") {
      if (useCases.has("speed_training") || useCases.has("race_day")) {
        push(state, "running.short_speed_use_case", 12, "Κανόνας τρεξίματος: speed / race use case για μικρή απόσταση");
      }
      if (typeof knowledge?.weightG === "number" && knowledge.weightG <= 280) {
        push(state, "running.short_weight", 5, "Κανόνας τρεξίματος: χαμηλότερο τεκμηριωμένο βάρος");
      }
    } else if (answers.distance === "medium" && (useCases.has("daily_training") || useCases.has("easy_run"))) {
      push(state, "running.medium_daily", 8, "Κανόνας τρεξίματος: daily / easy-run χρήση");
    }

    if (answers.frequency === "high") {
      if (useCases.has("daily_training")) push(state, "running.high_frequency_daily", 9, "Κανόνας τρεξίματος: τεκμηριωμένο daily training για συχνή χρήση");
      if (cushioning === "high" || cushioning === "max") push(state, "running.high_frequency_cushioning", 5);
    } else if (answers.frequency === "regular" && useCases.has("daily_training")) {
      push(state, "running.regular_frequency_daily", 5);
    }

    if (answers.runnerNeed === "guided_support") {
      if (["guided", "stability", "max_support"].includes(support)) {
        push(state, "running.need_guided_support_match", 15, "Ανάγκη δρομέα: τεκμηριωμένη πρόσθετη στήριξη");
      } else if (support === "neutral") {
        push(state, "running.need_guided_support_neutral", -14);
      }
    } else if (answers.runnerNeed === "neutral") {
      if (support === "neutral") push(state, "running.need_neutral_match", 10, "Ανάγκη δρομέα: τεκμηριωμένο neutral support");
      if (support === "max_support") push(state, "running.need_neutral_max_support", -8);
    } else if (answers.runnerNeed === "soft_ride") {
      if (cushioning === "high" || cushioning === "max") push(state, "running.need_soft_ride", 14, "Ανάγκη δρομέα: υψηλό τεκμηριωμένο cushioning");
      if (cushioning === "minimal" || cushioning === "low") push(state, "running.need_soft_ride_low", -12);
    } else if (answers.runnerNeed === "speed") {
      if (useCases.has("speed_training") || useCases.has("race_day")) push(state, "running.need_speed_use_case", 15, "Ανάγκη δρομέα: speed / race use case");
      if (typeof knowledge?.weightG === "number" && knowledge.weightG <= 280) push(state, "running.need_speed_weight", 5);
    } else if (answers.runnerNeed === "wide_fit") {
      if (width === "wide" || width === "extra_wide") push(state, "running.need_wide_fit", 15, "Ανάγκη δρομέα: τεκμηριωμένο φαρδύ fit");
      if (width === "narrow") return reject("running.need_wide_reject_narrow", "Η ανάγκη για φαρδύ fit συγκρούεται με τεκμηριωμένο narrow fit", state);
    } else if (answers.runnerNeed === "all_rounder" && useCases.has("daily_training")) {
      push(state, "running.need_all_rounder", 8, "Ανάγκη δρομέα: τεκμηριωμένη καθημερινή προπόνηση");
    }
  }

  if (answers.activity === "walking" && role === "footwear") {
    if (answers.useCase === "all_day_standing" && useCases.has("all_day_standing")) {
      push(state, "walking.all_day_standing", 18, "Κανόνας περπατήματος: τεκμηριωμένη χρήση για πολύωρη ορθοστασία");
    } else if (answers.useCase === "travel_walking" && useCases.has("travel_walking")) {
      push(state, "walking.travel_use", 16, "Κανόνας περπατήματος: τεκμηριωμένη χρήση για πολύ περπάτημα / ταξίδι");
    } else if (useCases.has("daily_walking") || useCases.has("all_day_standing")) {
      push(state, "walking.daily_use", 14, "Κανόνας περπατήματος: τεκμηριωμένη καθημερινή / all-day χρήση");
    }
    if (answers.distance === "long" && (cushioning === "high" || cushioning === "max")) {
      push(state, "walking.long_cushioning", 8, "Κανόνας περπατήματος: αυξημένο cushioning για μεγάλη διάρκεια");
    }
    if (
      answers.frequency === "high"
      && includesAny(useCases, ["daily_walking", "all_day_standing", "travel_walking"])
    ) {
      push(state, "walking.high_frequency_use", 7, "Κανόνας περπατήματος: τεκμηριωμένη χρήση για συχνό / πολύωρο περπάτημα");
    }
    if (
      answers.priority === "comfort"
      && (
        includesAny(useCases, ["daily_walking", "all_day_standing", "travel_walking"])
        || ["medium", "high", "max"].includes(cushioning)
      )
    ) {
      push(state, "walking.comfort_profile", 8, "Κανόνας περπατήματος: τεκμηριωμένο comfort profile");
    } else if (answers.priority === "cushioning") {
      if (["medium", "high", "max"].includes(cushioning)) {
        push(state, "walking.cushioning_match", 8, "Κανόνας περπατήματος: cushioning συμβατό με την προτεραιότητα");
      } else if (["minimal", "low"].includes(cushioning)) {
        push(state, "walking.cushioning_low", -8);
      }
    }
    if (
      answers.priority === "traction"
      && answers.surface
      && surfaces.size
      && knownSurfaceMatches(answers.surface, surfaces)
    ) {
      push(state, "walking.traction_surface_match", 8, "Κανόνας περπατήματος: τεκμηριωμένη επιφάνεια για πρόσφυση");
    }
    if (answers.priority === "weather" && weatherProtection.size) {
      push(state, "walking.weather_protection", 8, "Κανόνας περπατήματος: τεκμηριωμένη προστασία από καιρό");
    }
  }

  if (answers.activity === "hiking" && role === "footwear") {
    if (answers.surface && surfaces.size && knownSurfaceMatches(answers.surface, surfaces)) {
      push(state, "hiking.surface_match", 15, "Κανόνας πεζοπορίας: τεκμηριωμένη συμβατότητα εδάφους");
    }
    if (answers.useCase === "technical_hike" && useCases.has("technical_hike")) {
      push(state, "hiking.technical_use", 16, "Κανόνας πεζοπορίας: τεκμηριωμένη χρήση σε τεχνικό terrain");
    } else if (answers.useCase === "day_hike" && useCases.has("day_hike")) {
      push(state, "hiking.day_use", 13, "Κανόνας πεζοπορίας: τεκμηριωμένη χρήση για ημερήσια πεζοπορία");
    }
    if (answers.priority === "weather" && weatherProtection.size) {
      push(state, "hiking.weather_protection", 12, "Κανόνας πεζοπορίας: τεκμηριωμένη προστασία από καιρό");
    }
    if (
      answers.priority === "traction"
      && answers.surface
      && surfaces.size
      && knownSurfaceMatches(answers.surface, surfaces)
    ) {
      push(state, "hiking.traction_surface_match", 10, "Κανόνας πεζοπορίας: τεκμηριωμένο terrain για πρόσφυση");
    }
    if (
      answers.useCase === "technical_hike"
      && (useCases.has("technical_hike") || includesAny(surfaces, ["trail", "mixed"]))
    ) {
      push(state, "hiking.technical_terrain_profile", 9, "Κανόνας πεζοπορίας: τεχνικό trail profile");
    }
  }

  if (["basketball", "tennis", "padel", "volleyball"].includes(answers.activity) && role === "footwear") {
    if (answers.surface && surfaces.size && knownSurfaceMatches(answers.surface, surfaces)) {
      push(state, "court.surface_match", 14, "Κανόνας court sport: τεκμηριωμένη συμβατότητα επιφάνειας");
    }
    if (answers.useCase && useCases.has(normalize(answers.useCase))) {
      push(state, "court.use_case_match", 12, "Κανόνας court sport: τεκμηριωμένος τύπος προπόνησης / αγώνα");
    }
    if (answers.priority === "stability" && ["guided", "stability", "max_support"].includes(support)) {
      push(state, "court.stability_match", 8, "Κανόνας court sport: τεκμηριωμένη σταθερότητα");
    }
    if (answers.priority === "cushioning" || answers.priority === "comfort") {
      if (["medium", "high", "max"].includes(cushioning)) {
        push(state, "court.cushioning_match", 8, "Κανόνας court sport: cushioning συμβατό με την προτεραιότητα");
      } else if (answers.priority === "cushioning" && ["minimal", "low"].includes(cushioning)) {
        push(state, "court.cushioning_low", -8);
      }
    }
    if (
      answers.priority === "traction"
      && answers.surface
      && surfaces.size
      && knownSurfaceMatches(answers.surface, surfaces)
    ) {
      push(state, "court.traction_surface_match", 9, "Κανόνας court sport: τεκμηριωμένη επιφάνεια για πρόσφυση");
    }
    if (
      answers.frequency === "high"
      && includesAny(useCases, [`${answers.activity}_training`, `${answers.activity}_match`])
    ) {
      push(state, "court.high_frequency_use", 6, "Κανόνας court sport: τεκμηριωμένη sport-specific χρήση για συχνή προπόνηση");
    }
  }

  if (answers.activity === "gym" && role === "footwear") {
    const training = answers.gymTrainingType;
    if (training === "strength") {
      if (useCases.has("gym_strength")) push(state, "gym.strength_use_case", 20, "Κανόνας γυμναστηρίου: τεκμηριωμένο strength training");
      if (["stability", "guided", "max_support"].includes(support)) push(state, "gym.strength_stability", 10, "Κανόνας γυμναστηρίου: προτεραιότητα στη σταθερότητα");
      if (cushioning === "high" || cushioning === "max") push(state, "gym.strength_high_cushioning", -14);
      if (cushioning === "minimal" || cushioning === "low" || cushioning === "medium") push(state, "gym.strength_lower_cushioning", 5);
    } else if (training === "cardio" || training === "treadmill") {
      if (useCases.has("gym_cardio")) push(state, "gym.cardio_use_case", 15, "Κανόνας γυμναστηρίου: τεκμηριωμένο cardio");
      if (cushioning === "medium" || cushioning === "high" || cushioning === "max") {
        push(state, "gym.cardio_cushioning", 10, "Κανόνας γυμναστηρίου: cushioning για cardio / διάδρομο");
      }
      if (training === "treadmill" && surfaces.size && !includesAny(surfaces, ["treadmill", "indoor", "road"])) {
        return reject("gym.treadmill_surface_mismatch", "Η τεκμηριωμένη επιφάνεια δεν ταιριάζει με διάδρομο", state);
      }
    } else if (training === "functional" || training === "mixed") {
      if (activities.has("general_training") || activities.has("gym_training")) push(state, "gym.functional_activity", 12, "Κανόνας γυμναστηρίου: γενική / functional προπόνηση");
      if (["guided", "stability", "max_support"].includes(support)) push(state, "gym.functional_stability", 7);
      if (cushioning === "medium") push(state, "gym.functional_medium_cushioning", 6);
    }
  }

  const technical = summarizeRequirements(state.technicalRequirements);
  return {
    eligible: true,
    adjustment: Math.max(-30, Math.min(45, state.adjustment)),
    reasons: state.reasons.slice(0, 4),
    ruleIds: state.ruleIds,
    technicalScore: technical.score,
    technicalCoverage: technical.coverage,
    technicalRequirements: state.technicalRequirements
  };
}
