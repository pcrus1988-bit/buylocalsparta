import type {
  SportFitAnswers,
  SportFitProduct,
  SportProductRole,
  SportSurface
} from "./sport-fit-engine.ts";

export const SPORT_FIT_RULESET_VERSION = "2026-10-02.1";

export type SportFitRuleEvaluation = Readonly<{
  eligible: boolean;
  adjustment: number;
  reasons: readonly string[];
  ruleIds: readonly string[];
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

function knownSurfaceMatches(surface: SportSurface, actual: ReadonlySet<string>): boolean {
  if (!actual.size) return true;
  if (surface === "road") return includesAny(actual, ["road"]);
  if (surface === "treadmill") return includesAny(actual, ["treadmill", "indoor"]);
  if (surface === "trail") return includesAny(actual, ["trail"]);
  if (surface === "indoor") return includesAny(actual, ["indoor"]);
  if (surface === "grass") return includesAny(actual, ["natural_grass_firm", "natural_grass_soft", "multi_ground"]);
  if (surface === "artificial") return includesAny(actual, ["artificial_grass", "turf", "multi_ground"]);
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
  state: { adjustment: number; reasons: string[]; ruleIds: string[] },
  ruleId: string,
  adjustment: number,
  reason?: string
) {
  state.adjustment += adjustment;
  state.ruleIds.push(ruleId);
  if (reason) state.reasons.push(reason);
}

function reject(ruleId: string, reason: string, state: { adjustment: number; reasons: string[]; ruleIds: string[] }): SportFitRuleEvaluation {
  return {
    eligible: false,
    adjustment: state.adjustment,
    reasons: [reason, ...state.reasons].slice(0, 4),
    ruleIds: [ruleId, ...state.ruleIds],
    rejectionReason: reason
  };
}

export function evaluateSportFitRules(
  product: SportFitProduct,
  answers: SportFitAnswers,
  role: SportProductRole
): SportFitRuleEvaluation {
  const state = { adjustment: 0, reasons: [] as string[], ruleIds: [] as string[] };
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
  const cushioning = normalize(knowledge?.cushioningLevel);
  const support = normalize(knowledge?.supportLevel);
  const width = normalize(knowledge?.widthProfile);
  const lengthFit = normalize(knowledge?.fitLengthProfile);
  const footballCode = normalize(knowledge?.footballSurfaceCode);

  if (!product.available || product.availableToSell <= 0) {
    return reject("stock.positive_required", "Δεν υπάρχει διαθέσιμο απόθεμα τώρα", state);
  }

  if (role === "footwear" && activities.size) {
    const requested = answers.activity === "gym"
      ? ["gym_training", "general_training"]
      : answers.activity === "walking" && (answers.surface === "trail" || answers.surface === "mixed")
        ? ["walking", "hiking"]
        : answers.activity === "football"
          ? ["football", "team_sports"]
          : [answers.activity];

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
    && ["running", "walking", "football"].includes(answers.activity)
    && !knownSurfaceMatches(answers.surface, surfaces)
  ) {
    return reject(
      "surface.known_mismatch",
      "Η τεκμηριωμένη επιφάνεια του παπουτσιού δεν ταιριάζει με τη χρήση",
      state
    );
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
      push(state, "running.surface_match", 12, "Κανόνας τρεξίματος: τεκμηριωμένη επιφάνεια");
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
    if (useCases.has("daily_walking") || useCases.has("all_day_standing")) {
      push(state, "walking.daily_use", 14, "Κανόνας περπατήματος: τεκμηριωμένη καθημερινή / all-day χρήση");
    }
    if (answers.distance === "long" && (cushioning === "high" || cushioning === "max")) {
      push(state, "walking.long_cushioning", 8, "Κανόνας περπατήματος: αυξημένο cushioning για μεγάλη διάρκεια");
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

  return {
    eligible: true,
    adjustment: Math.max(-30, Math.min(45, state.adjustment)),
    reasons: state.reasons.slice(0, 4),
    ruleIds: state.ruleIds
  };
}
