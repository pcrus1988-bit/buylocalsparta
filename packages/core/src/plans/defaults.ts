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
      version: 2,
      name: "Founding Partner",
      status: "active",
      termPrice: money(150_000),
      termMonths: 36,
      salesServiceFeeBps: 200,
      entitlements: { profile: true, advice: true, checkout: true, fairUseCatalogue: true, assistedLaunch: true, prioritySupport: true, apiFeed: true, standardFeaturesDuringTerm: true, locationLimit: 1 },
      externalCostsPassThrough: true,
      effectiveFrom
    },
    {
      code: "annual",
      version: 1,
      name: "Annual",
      status: "active",
      annualPrice: money(39_900),
      termMonths: 12,
      salesServiceFeeBps: 500,
      entitlements: { profile: true, advice: true, checkout: true, fairUseCatalogue: true },
      externalCostsPassThrough: true,
      effectiveFrom
    },
    {
      code: "monthly",
      version: 1,
      name: "Monthly",
      status: "active",
      monthlyPrice: money(4_900),
      termMonths: 1,
      salesServiceFeeBps: 700,
      entitlements: { profile: true, advice: true, checkout: true, fairUseCatalogue: true },
      externalCostsPassThrough: true,
      effectiveFrom
    },
    {
      code: "standard",
      version: 1,
      name: "Legacy standard plan — retired placeholder",
      status: "retired",
      salesServiceFeeBps: 0,
      entitlements: { profile: true, advice: true, checkout: true, fairUseCatalogue: true },
      externalCostsPassThrough: true,
      effectiveFrom
    }
  ];
}
