import {
  PostgresUnitOfWork,
  vendorCapabilitiesForSubscription,
  type SessionPrincipal,
  type SqlRow,
  type VendorOperatingAssignment
} from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { platformScope } from "@buy-local-sparta/postgres-runtime";

function databaseAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Resolve vendor operating scope from authoritative persisted relationships.
 *
 * vendor_businesses.market_id remains the operational tenancy boundary. A HUB can
 * elevate a non-Sparta vendor to SELF_GOVERNED only when both the market/HUB gateway
 * and canonical expansion HUB are explicitly active. Missing HUB configuration never
 * grants extra capability; the vendor remains MANAGED in its own persisted market.
 * Database-less preview/dev keeps the legacy Sparta fallback by returning no assignment.
 */
export async function resolveVendorOperatingAssignment(
  principal: SessionPrincipal
): Promise<VendorOperatingAssignment> {
  const vendorId = principal.vendorId?.trim();
  if (!vendorId || !databaseAvailable()) return {};

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(
    // Agreement/prospect RLS is platform-only; limit this internal entitlement lookup
    // strictly to the vendor ID from the authenticated membership/session.
    platformScope(principal.userId),
    async (tx) => {
      const result = await tx.query<SqlRow>(`
        SELECT
          m.code AS market_code,
          mhc.hub_code,
          COALESCE(vl.public_id, vl.id::text) AS location_id,
          mhc.is_operational AS market_hub_operational,
          eh.is_live AS expansion_hub_live,
          eh.is_sparta_legacy,
          v.status::text AS vendor_status,
          v.demo_mode,
          hub.plan_code AS hub_plan,
          hub.billing_cycle AS hub_billing_cycle,
          hub.status::text AS hub_status,
          hub.payment_state AS hub_payment_state,
          hub.trial_expires_at AS hub_trial_expires_at,
          app.requested_plan_code AS application_plan,
          app.trial_expires_at AS application_trial_expires_at,
          subs.plan_code AS subscription_plan,
          subs.status AS subscription_status,
          subs.starts_at AS subscription_starts_at,
          subs.ends_at AS subscription_ends_at,
          agreement.status AS agreement_status,
          agreement.terms_snapshot AS agreement_terms
        FROM vendor_businesses v
        JOIN markets m ON m.id = v.market_id
        LEFT JOIN market_hub_config mhc ON mhc.market_id = v.market_id
        LEFT JOIN expansion_hubs eh ON eh.hub_id = mhc.hub_code
        LEFT JOIN LATERAL (
          SELECT location.id, location.public_id
          FROM vendor_locations location
          WHERE location.vendor_id = v.id
            AND location.active = true
          ORDER BY location.is_primary DESC, location.created_at, location.id
          LIMIT 1
        ) vl ON true
        LEFT JOIN LATERAL (
          SELECT h.plan_code,h.billing_cycle,h.status,h.payment_state,h.trial_expires_at
          FROM hub_expansion_prospects h WHERE h.vendor_id=v.id
          ORDER BY h.updated_at DESC,h.created_at DESC LIMIT 1
        ) hub ON true
        LEFT JOIN LATERAL (
          SELECT a.requested_plan_code,a.trial_expires_at
          FROM vendor_applications a WHERE a.vendor_id=v.id
          ORDER BY a.updated_at DESC,a.created_at DESC LIMIT 1
        ) app ON true
        LEFT JOIN LATERAL (
          SELECT sp.code AS plan_code,vs.status,vs.starts_at,vs.ends_at
          FROM vendor_subscriptions vs JOIN vendor_plans sp ON sp.id=vs.plan_id
          WHERE vs.vendor_id=v.id ORDER BY vs.created_at DESC LIMIT 1
        ) subs ON true
        LEFT JOIN LATERAL (
          SELECT a.status,a.terms_snapshot
          FROM vendor_commercial_agreements a WHERE a.vendor_id=v.id
          ORDER BY CASE WHEN a.status='active' THEN 0 ELSE 1 END,a.created_at DESC LIMIT 1
        ) agreement ON true
        WHERE (v.public_id = $1 OR v.id::text = $1)
        LIMIT 1
      `, [vendorId]);

      if (result.rowCount !== 1) throw new Error("Vendor operating assignment not found");
      const row = result.rows[0];
      const marketId = text(row.market_code);
      if (!marketId) throw new Error("Vendor market assignment is invalid");

      const hubId = text(row.hub_code);
      const locationId = text(row.location_id);
      const isSpartaLegacy = row.is_sparta_legacy === true || marketId === "sparta";
      const selfGoverned = Boolean(
        hubId
        && row.market_hub_operational === true
        && row.expansion_hub_live === true
        && !isSpartaLegacy
      );

      const vendorActive = row.vendor_status === "active";
      const subscriptionPresent = Boolean(text(row.subscription_plan));
      const hubPlan = text(row.hub_plan);
      const appPlan = text(row.application_plan);
      const agreementTerms = row.agreement_terms && typeof row.agreement_terms === "object"
        ? row.agreement_terms as Record<string, unknown> : {};
      const agreementPlan = text(agreementTerms.planCode);
      const agreementActive = row.agreement_status === "active";
      const planCode = text(row.subscription_plan) ?? hubPlan ?? appPlan ?? agreementPlan ??
        (vendorActive && agreementActive ? "legacy_signed" : undefined);
      const expiresAt = row.subscription_ends_at ? new Date(String(row.subscription_ends_at)).getTime() : undefined;
      const startsAt = row.subscription_starts_at ? new Date(String(row.subscription_starts_at)).getTime() : undefined;
      const now = Date.now();
      const subscriptionPlanMatches = !hubPlan && !appPlan ||
        text(row.subscription_plan) === (hubPlan ?? appPlan);
      const subscriptionValid = subscriptionPlanMatches && row.subscription_status === "active" &&
        (startsAt === undefined || startsAt <= now) &&
        (expiresAt === undefined || expiresAt > now);
      const hubContractValid = agreementActive &&
        agreementTerms.planMarket === "expansion_hubs" &&
        agreementTerms.planCode === hubPlan &&
        agreementTerms.billingCycle === row.hub_billing_cycle &&
        agreementTerms.legalReviewStatus === "approved";
      const hubActivated = vendorActive && row.hub_status === "converted" &&
        ["paid","settled"].includes(String(row.hub_payment_state)) && hubContractValid;
      const spartaActivated = vendorActive && agreementActive && !hubPlan;
      const trialDeadline = row.hub_trial_expires_at ?? row.application_trial_expires_at;
      const trialValid = row.demo_mode === true && !!trialDeadline &&
        new Date(String(trialDeadline)).getTime() > now &&
        !["claim", "presence"].includes(planCode ?? "");
      const subscriptionState: "active" | "trial" | "inactive" =
        subscriptionPresent
          ? vendorActive && subscriptionValid && (!hubPlan || hubActivated) ? "active" : "inactive"
          : hubPlan
            ? hubActivated ? "active" : trialValid ? "trial" : "inactive"
            : spartaActivated ? "active" : trialValid ? "trial" : "inactive";
      return {
        marketId,
        ...(hubId ? { hubId } : {}),
        ...(locationId ? { locationId } : {}),
        operatingModel: selfGoverned ? "SELF_GOVERNED" : "MANAGED",
        ...(planCode ? { subscriptionPlanCode: planCode } : {}),
        subscriptionState,
        entitledCapabilities: vendorCapabilitiesForSubscription(planCode, subscriptionState)
      };
    },
    { readOnly: true }
  );
}
