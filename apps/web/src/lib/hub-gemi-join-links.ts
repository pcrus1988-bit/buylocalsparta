import type { HubBillingCycle, HubExpansionPlanCode } from "./hub-expansion-plans";

/** Keep a public GEMI listing attached when an applicant changes HUB subscription. */
export function hubGemiApplicationPath(options: {
  plan: HubExpansionPlanCode;
  billing: HubBillingCycle;
  gemi?: string;
  showPlans?: boolean;
}): string {
  const params = new URLSearchParams({ plan: options.plan, billing: options.billing });
  if (options.gemi && /^[0-9]{8,20}$/.test(options.gemi)) params.set("gemi", options.gemi);
  if (options.showPlans) params.set("plans", "1");
  return "/hubs/join/apply?" + params.toString();
}
