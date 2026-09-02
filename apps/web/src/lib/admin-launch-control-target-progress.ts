import type { LaunchControlIntegrityWorkspace } from "./admin-launch-control-integrity";
import type {
  LaunchControlTargetCurrentValues,
  LaunchControlTargetKey,
  LaunchControlTargetSettings
} from "./admin-launch-control-targets";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LaunchControlTargetUnit = "count" | "money_minor" | "ratio";
export type LaunchControlTargetStatus = "unset" | "unavailable" | "tracking" | "on_track" | "at_risk" | "achieved" | "overdue";

export type LaunchControlTargetProgress = Readonly<{
  key: LaunchControlTargetKey;
  label: string;
  description: string;
  unit: LaunchControlTargetUnit;
  current?: number;
  target?: number;
  deadline?: string;
  baselineValue?: number;
  baselineAt?: number;
  completion?: number;
  remaining?: number;
  daysRemaining?: number;
  actualDailyChange?: number;
  requiredDailyChange?: number;
  projectedAtDeadline?: number;
  status: LaunchControlTargetStatus;
}>;

const DEFINITIONS: ReadonlyArray<Readonly<{
  key: LaunchControlTargetKey;
  label: string;
  description: string;
  unit: LaunchControlTargetUnit;
}>> = [
  { key: "activeVendors", label: "Active vendors", description: "Active Sparta vendor-business records.", unit: "count" },
  { key: "catalogueProducts", label: "Catalogue products", description: "Public canonical products in the governed SEO/catalogue snapshot.", unit: "count" },
  { key: "indexableProducts", label: "Indexable products", description: "Products currently passing the SEO quality/index gate.", unit: "count" },
  { key: "orders30d", label: "Paid orders · 30d", description: "Captured non-cancelled order cohort from the transactional ledger.", unit: "count" },
  { key: "gmv30dMinor", label: "Merchandise GMV · 30d", description: "Merchandise GMV for captured non-cancelled orders, excluding shipping.", unit: "money_minor" },
  { key: "searchSuccessRate", label: "Search success · 30d", description: "Share of market searches returning successful results.", unit: "ratio" }
];

export function launchControlTargetCurrentValues(data: LaunchControlIntegrityWorkspace): LaunchControlTargetCurrentValues {
  return {
    activeVendors: data.metricIntegrity?.vendorLifecycle.active,
    catalogueProducts: data.seo?.metrics.products,
    indexableProducts: data.seo?.metrics.productIndexEligible,
    orders30d: data.metricIntegrity?.commerce.validPaidOrders,
    gmv30dMinor: data.metricIntegrity?.commerce.merchandiseGmvMinor,
    searchSuccessRate: data.dashboard.analytics.searchSuccessRate
  };
}

export function buildLaunchControlTargetProgress(
  data: LaunchControlIntegrityWorkspace,
  settings: LaunchControlTargetSettings,
  now = Date.now()
): readonly LaunchControlTargetProgress[] {
  const currentValues = launchControlTargetCurrentValues(data);
  return DEFINITIONS.map((definition) => {
    const current = currentValues[definition.key];
    const target = settings.document.targets[definition.key];
    if (!target) return { ...definition, current, status: current === undefined ? "unavailable" : "unset" };
    if (current === undefined) {
      return {
        ...definition,
        target: target.value,
        deadline: target.deadline,
        baselineValue: target.baselineValue,
        baselineAt: target.baselineAt,
        status: "unavailable"
      };
    }

    const deadlineAt = new Date(`${target.deadline}T23:59:59.999Z`).getTime();
    const rawDaysRemaining = (deadlineAt - now) / DAY_MS;
    const daysRemaining = Math.max(0, Math.ceil(rawDaysRemaining));
    const remaining = Math.max(0, target.value - current);
    const completion = target.value <= 0 ? 1 : Math.max(0, Math.min(1, current / target.value));
    const elapsedDays = Math.max(0, (now - target.baselineAt) / DAY_MS);
    const actualDailyChange = elapsedDays >= 1 ? (current - target.baselineValue) / elapsedDays : undefined;
    const requiredDailyChange = remaining > 0 && daysRemaining > 0 ? remaining / daysRemaining : 0;
    const projectedAtDeadline = actualDailyChange === undefined ? undefined : current + (actualDailyChange * daysRemaining);

    let status: LaunchControlTargetStatus;
    if (current >= target.value) status = "achieved";
    else if (deadlineAt < now) status = "overdue";
    else if (actualDailyChange === undefined) status = "tracking";
    else if (projectedAtDeadline !== undefined && projectedAtDeadline >= target.value) status = "on_track";
    else status = "at_risk";

    return {
      ...definition,
      current,
      target: target.value,
      deadline: target.deadline,
      baselineValue: target.baselineValue,
      baselineAt: target.baselineAt,
      completion,
      remaining,
      daysRemaining,
      actualDailyChange,
      requiredDailyChange,
      projectedAtDeadline,
      status
    };
  });
}

export function launchControlTargetDefinition(key: LaunchControlTargetKey) {
  return DEFINITIONS.find((definition) => definition.key === key);
}
