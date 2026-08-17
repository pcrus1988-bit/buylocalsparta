import { money } from "../common/money.ts";
import type { PlanDefinition } from "./types.ts";

export function launchPlanDefinitions(effectiveFrom: number): readonly PlanDefinition[] {
  return [
    {
      code: "free_listing",
      version: 1,
      name: "Free Listing",
      status: "active",
      salesServiceFeeBps: 0,
      entitlements: { profile: true, advice: true, checkout: false, fairUseCatalogue: false },
      externalCostsPassThrough: true,
      effectiveFrom
    },
    {
      code: "founding_2026",
      version: 1,
      name: "Founding / Early Bird",
      status: "active",
      termPrice: money(150_000),
      termMonths: 36,
      salesServiceFeeBps: 0,
      entitlements: { profile: true, advice: true, checkout: true, fairUseCatalogue: true, assistedLaunch: true, prioritySupport: true, apiFeed: true, standardFeaturesDuringTerm: true, locationLimit: 1 },
      externalCostsPassThrough: true,
      effectiveFrom
    },
    {
      code: "standard",
      version: 1,
      name: "Standard plan — commercial terms pending approval",
      status: "draft",
      salesServiceFeeBps: 0,
      entitlements: { profile: true, advice: true, checkout: true, fairUseCatalogue: true },
      externalCostsPassThrough: true,
      effectiveFrom
    }
  ];
}
