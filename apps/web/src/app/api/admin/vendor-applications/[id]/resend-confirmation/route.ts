import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { requireAdminSession } from "../../../../../../lib/admin-session";
import { recordAdminAudit } from "../../../../../../lib/admin-runtime";
import { sendVendorApplicationConfirmationEmail } from "../../../../../../lib/vendor-application-confirmation-email";
import { vendorApplicationPlanSnapshotFromRow } from "../../../../../../lib/vendor-application-plan";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../../lib/postgres-runtime";
import { buildVendorTrialAccessUrl } from "../../../../../../lib/vendor-trial-access-link";
import { createVendorTrialAccessToken } from "../../../../../../lib/vendor-trial-runtime";

type ApplicationConfirmationRow = SqlRow & {
  public_id: string;
  trading_name: string;
  contact_email: string;
  requested_plan_code: string;
  trial_started_at: Date | string | null;
  trial_expires_at: Date | string | null;
  owner_public_id: string;
  vendor_public_id: string | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    if (!productionDatabaseConfigured()) throw new Error("Production database is required");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 3 || reason.length > 500) throw new Error("A 3–500 character resend reason is required");

    const runtime = getProductionPostgresRuntime();
    const uow = new PostgresUnitOfWork(runtime.sqlPool);
    const snapshot = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
      const result = await tx.query<ApplicationConfirmationRow>(`
        SELECT a.public_id,a.trading_name,a.contact_email::text AS contact_email,a.requested_plan_code,
               a.trial_started_at,a.trial_expires_at,u.public_id AS owner_public_id,v.public_id AS vendor_public_id,
               p.code,p.name,p.listing_fee_minor,p.monthly_price_minor,p.annual_price_minor,p.term_price_minor,p.term_months,p.sales_fee_bps
        FROM vendor_applications a
        JOIN users u ON u.id=a.owner_user_id
        LEFT JOIN vendor_businesses v ON v.id=a.vendor_id
        LEFT JOIN vendor_plans p ON p.market_id=a.market_id AND p.code=a.requested_plan_code
        WHERE a.public_id=$1 OR a.id::text=$1
        LIMIT 1
      `, [decodeURIComponent(id)]);
      if (!result.rowCount) throw new Error("Vendor application not found");
      const row = result.rows[0];
      return {
        applicationId: requiredText(row.public_id, "application.public_id"),
        tradingName: requiredText(row.trading_name, "application.trading_name"),
        email: requiredText(row.contact_email, "application.contact_email"),
        ownerUserId: requiredText(row.owner_public_id, "owner.public_id"),
        vendorId: optionalText(row.vendor_public_id),
        trialStartedAt: optionalEpoch(row.trial_started_at),
        trialExpiresAt: optionalEpoch(row.trial_expires_at),
        plan: vendorApplicationPlanSnapshotFromRow(row)
      };
    }, { readOnly: true });

    let trialAccessUrl: string | undefined;
    if (snapshot.vendorId && snapshot.trialStartedAt) {
      const access = createVendorTrialAccessToken({
        applicationId: snapshot.applicationId,
        ownerUserId: snapshot.ownerUserId,
        vendorId: snapshot.vendorId,
        trialStartedAt: snapshot.trialStartedAt
      });
      if (access.accessExpiresAt > Date.now()) trialAccessUrl = buildVendorTrialAccessUrl(access.token);
    }

    const delivery = await sendVendorApplicationConfirmationEmail({
      to: snapshot.email,
      tradingName: snapshot.tradingName,
      applicationId: snapshot.applicationId,
      plan: snapshot.plan,
      trialAccessUrl,
      trialExpiresAt: snapshot.trialExpiresAt,
      idempotencySuffix: `admin-${Date.now()}`
    });

    await recordAdminAudit(principal, "vendor.application_confirmation_resent", "vendor_application", snapshot.applicationId, reason, {
      emailSent: delivery.sent,
      trialAccessIncluded: Boolean(trialAccessUrl),
      destination: snapshot.email
    });

    const warning = !delivery.sent
      ? "Resend delivery is disabled or failed. Check the production Resend configuration."
      : !trialAccessUrl && snapshot.trialStartedAt
        ? "Confirmation sent, but the secure Trial access window has expired."
        : !trialAccessUrl
          ? "Confirmation sent. This application does not currently have Trial access."
          : undefined;

    return Response.json({ sent: delivery.sent, warning });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_application_resend_failed" }, { status: 400 });
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid database field ${field}`);
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalEpoch(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const result = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(result)) throw new Error("Invalid Trial timestamp");
  return result;
}
