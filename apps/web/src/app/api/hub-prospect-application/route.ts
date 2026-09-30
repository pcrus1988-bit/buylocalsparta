import { cookies } from "next/headers";
import { getHubExpansionPlan, type HubBillingCycle, type HubExpansionPlanCode } from "../../../lib/hub-expansion-plans";
import { getAccountSession } from "../../../lib/account-session";
import { assertCustomerCsrf } from "../../../lib/customer-state-runtime";
import {
  consumeHubProspectRateLimit,
  HubProspectApplicationError,
  hubProspectApplicationReadiness,
  submitHubProspectApplication,
  type HubProspectApplicationInput
} from "../../../lib/hub-prospect-application-runtime";
import { notifyOperationsOfHubProspectApplication, sendHubProspectApplicationReceiptEmail } from "../../../lib/vendor-email-workflows";
import { createVendorTrialAccessToken, VENDOR_TRIAL_COOKIE } from "../../../lib/vendor-trial-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const readiness = hubProspectApplicationReadiness();
  if (!readiness.ready) {
    return Response.json({ code: "application_unavailable", error: readiness.message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const visitorKey = request.headers.get("x-bls-visitor")?.trim();
  if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) {
    return Response.json({ code: "visitor_required", error: "Trusted visitor identity is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const now = Date.now();
  const limit = await consumeHubProspectRateLimit({ visitorKey, now });
  if (!limit.allowed) {
    return Response.json(
      { code: "rate_limited", error: "Έχουν γίνει πολλές αιτήσεις από αυτή τη συσκευή. Δοκίμασε ξανά αργότερα ή επικοινώνησε με την ομάδα ΚΟΝΤΑ ΜΟΥ.", retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)), "Cache-Control": "no-store" } }
    );
  }

  const principal = await getAccountSession();
  if (principal) {
    try {
      assertCustomerCsrf(principal, request.headers.get("x-csrf-token") ?? undefined);
    } catch {
      return Response.json({ code: "csrf_failed", error: "Η συνεδρία άλλαξε. Ανανέωσε τη σελίδα και ξαναδοκίμασε." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.companyWebsiteCheck !== undefined && String(body.companyWebsiteCheck).trim()) {
      return Response.json({ status: "received" }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    if (body.acceptedAccuracy !== true || body.acceptedPrivacy !== true || body.acceptedProspectStatus !== true) {
      throw new HubProspectApplicationError(400, "consent_required", "Χρειάζεται να επιβεβαιώσεις την ακρίβεια των στοιχείων, το prospect status και την επεξεργασία δεδομένων.");
    }

    const application: HubProspectApplicationInput = {
      taxNumber: stringField(body.taxNumber),
      planCode: planField(body.planCode),
      billingCycle: billingField(body.billingCycle),
      businessName: stringField(body.businessName),
      contactName: stringField(body.contactName),
      email: stringField(body.email),
      phone: stringField(body.phone),
      primaryCategory: stringField(body.primaryCategory),
      websiteUrl: optionalStringField(body.websiteUrl),
      currentSalesChannels: optionalStringField(body.currentSalesChannels),
      notes: optionalStringField(body.notes)
    };

    const receipt = await submitHubProspectApplication({ application, principal, now });

    let trialAccessToken: string | undefined;
    let trialAccessExpiresAt: number | undefined;
    if (receipt.trial) {
      const access = createVendorTrialAccessToken({
        applicationId: receipt.reference,
        ownerUserId: receipt.trial.ownerUserId,
        vendorId: receipt.trial.vendorId,
        trialStartedAt: receipt.trial.startedAt
      });
      trialAccessToken = access.token;
      trialAccessExpiresAt = access.accessExpiresAt;
      (await cookies()).set({
        name: VENDOR_TRIAL_COOKIE,
        value: access.token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
        path: "/",
        expires: new Date(access.accessExpiresAt)
      });
    }

    const [operationsEmail, applicantEmail] = await Promise.all([
      notifyOperationsOfHubProspectApplication({
      reference: receipt.reference,
      businessName: application.businessName,
      contactName: application.contactName,
      contactEmail: application.email,
      phone: application.phone,
      hubName: receipt.hubName,
      hubSlug: receipt.hubSlug,
      planCode: receipt.planCode,
      billingCycle: receipt.billingCycle
      }),
      sendHubProspectApplicationReceiptEmail({
        to: application.email,
        businessName: application.businessName,
        reference: receipt.reference,
        hubName: receipt.hubName,
        planCode: receipt.planCode,
        billingCycle: receipt.billingCycle,
        recurringFeeCents: receipt.recurringFeeCents,
        trialExpiresAt: receipt.trial?.expiresAt,
        trialAccessToken
      })
    ]);
    if (!operationsEmail.sent) {
      console.error(JSON.stringify({
        level: "error",
        event: "hub_prospect_application.admin_notification_failed",
        reference: receipt.reference,
        destination: "info@kontamou.site"
      }));
    }
    if (!applicantEmail.sent) {
      console.error(JSON.stringify({
        level: "error",
        event: "hub_prospect_application.applicant_confirmation_failed",
        reference: receipt.reference,
        destination: application.email
      }));
    }

    return Response.json({
      ...receipt,
      redirectTo: receipt.trial ? "/vendor/trial" : undefined,
      trialAccessExpiresAt: trialAccessExpiresAt ? new Date(trialAccessExpiresAt).toISOString() : undefined,
      message: receipt.planCode === "claim"
        ? "Η δωρεάν καταχώριση CLAIM μπήκε σε έλεγχο για το HUB που αντιστοιχεί στην επαληθευμένη τοποθεσία Γ.Ε.ΜΗ."
        : receipt.trial
          ? `Η αίτηση καταχωρίστηκε για το HUB ${receipt.hubName}. Το ιδιωτικό 3ήμερο Vendor Trial είναι έτοιμο τώρα· η αίτηση παραμένει σε έλεγχο και δεν ενεργοποιούνται δημόσιες πωλήσεις ή χρεώσεις.`
          : `Το ενδιαφέρον συνεργασίας καταχωρίστηκε με ${receipt.billingCycle === "annual" ? "ετήσια" : "μηνιαία"} χρέωση για το HUB που αντιστοιχεί στην επαληθευμένη τοποθεσία Γ.Ε.ΜΗ. Δεν έγινε χρέωση.`
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof HubProspectApplicationError) {
      return Response.json(
        {
          code: error.code,
          error: error.message,
          redirectTo: error.code === "sparta_uses_existing_join" ? "/join/sparta" : error.code === "login_required" ? "/login?next=%2Fhubs%2Fjoin%2Fapply" : undefined
        },
        { status: error.status, headers: { "Cache-Control": "no-store" } }
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", event: "hub_prospect_application.submit_failed", message }));
    return Response.json(
      { code: "application_failed", error: "Δεν μπορέσαμε να καταχωρίσουμε την αίτηση λόγω τεχνικού προβλήματος. Δοκίμασε ξανά σε λίγο." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalStringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function planField(value: unknown): HubExpansionPlanCode {
  const plan = getHubExpansionPlan(typeof value === "string" ? value : undefined);
  if (!plan) throw new HubProspectApplicationError(400, "plan_invalid", "Επίλεξε έγκυρο πρόγραμμα συνεργασίας.");
  return plan.code;
}

function billingField(value: unknown): HubBillingCycle {
  if (value === "annual" || value === "monthly") return value;
  throw new HubProspectApplicationError(400, "billing_cycle_invalid", "Επίλεξε έγκυρο τρόπο χρέωσης συνδρομής.");
}
