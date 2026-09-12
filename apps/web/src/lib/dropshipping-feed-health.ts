export type DropshippingFeedHealthStatus = "healthy" | "stale" | "degraded" | "disabled" | "unknown";

export type DropshippingFeedHealth = Readonly<{
  status: DropshippingFeedHealthStatus;
  label: string;
  detail: string;
  healthcheckAgeMinutes: number | null;
  catalogueSyncAgeMinutes: number | null;
}>;

export const DROPSHIPPING_HEALTHCHECK_STALE_AFTER_MINUTES = 24 * 60;
export const DROPSHIPPING_CATALOGUE_STALE_AFTER_MINUTES = 12 * 60;

function ageMinutes(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((nowMs - timestamp) / 60_000));
}

export function dropshippingFeedHealth(
  supplier: Readonly<{
    active: boolean;
    catalogueSyncEnabled: boolean;
    lastHealthcheckAt: string | null;
    lastHealthcheckOk: boolean | null;
    lastCatalogueSyncAt: string | null;
  }>,
  nowMs = Date.now()
): DropshippingFeedHealth {
  const healthcheckAgeMinutes = ageMinutes(supplier.lastHealthcheckAt, nowMs);
  const catalogueSyncAgeMinutes = ageMinutes(supplier.lastCatalogueSyncAt, nowMs);

  if (!supplier.active || !supplier.catalogueSyncEnabled) {
    return {
      status: "disabled",
      label: "Sync disabled",
      detail: !supplier.active ? "Ο supplier είναι ανενεργός." : "Το catalogue sync είναι απενεργοποιημένο.",
      healthcheckAgeMinutes,
      catalogueSyncAgeMinutes
    };
  }

  if (supplier.lastHealthcheckOk === false) {
    return {
      status: "degraded",
      label: "Feed problem",
      detail: "Το τελευταίο supplier healthcheck απέτυχε.",
      healthcheckAgeMinutes,
      catalogueSyncAgeMinutes
    };
  }

  const healthcheckStale = healthcheckAgeMinutes != null
    && healthcheckAgeMinutes > DROPSHIPPING_HEALTHCHECK_STALE_AFTER_MINUTES;
  const catalogueStale = catalogueSyncAgeMinutes != null
    && catalogueSyncAgeMinutes > DROPSHIPPING_CATALOGUE_STALE_AFTER_MINUTES;

  if (healthcheckStale || catalogueStale) {
    return {
      status: "stale",
      label: "Stale feed",
      detail: catalogueStale
        ? "Δεν έχει καταγραφεί πρόσφατο catalogue sync."
        : "Το supplier healthcheck δεν έχει ανανεωθεί πρόσφατα.",
      healthcheckAgeMinutes,
      catalogueSyncAgeMinutes
    };
  }

  if (supplier.lastCatalogueSyncAt == null) {
    return {
      status: "unknown",
      label: "Awaiting sync",
      detail: "Δεν έχει καταγραφεί ακόμη επιτυχές catalogue sync.",
      healthcheckAgeMinutes,
      catalogueSyncAgeMinutes
    };
  }

  if (supplier.lastHealthcheckOk == null) {
    return {
      status: "unknown",
      label: "Sync active",
      detail: "Το catalogue sync είναι πρόσφατο, αλλά δεν υπάρχει ακόμη supplier healthcheck αποτέλεσμα.",
      healthcheckAgeMinutes,
      catalogueSyncAgeMinutes
    };
  }

  return {
    status: "healthy",
    label: "Healthy",
    detail: "Supplier healthcheck και catalogue sync είναι πρόσφατα.",
    healthcheckAgeMinutes,
    catalogueSyncAgeMinutes
  };
}
