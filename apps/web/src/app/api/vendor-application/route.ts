import { cookies } from "next/headers";
import { getAccountSession } from "../../../lib/account-session";
import { assertCustomerCsrf } from "../../../lib/customer-state-runtime";
import {
  consumeVendorApplicationRateLimit,
  submitVendorApplication,
  vendorApplicationReadiness,
  type VendorApplicationInput
} from "../../../lib/vendor-application-runtime";
import { notifyOperationsOfVendorApplication, sendVendorApplicationReceiptEmail } from "../../../lib/vendor-email-workflows";
import { createVendorTrialAccessToken, VENDOR_TRIAL_COOKIE } from "../../../lib/vendor-trial-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const readiness = vendorApplicationReadiness();
  if (!readiness.ready) {
    return Response.json({ code: "application_unavailable", error: readiness.message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const visitorKey = request.headers.get("x-bls-visitor")?.trim();
  if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) {
    return Response.json({ code: "visitor_required", error: "Trusted visitor identity is required" }, { status: 400 });
  }

  const now = Date.now();
  const limit = await consumeVendorApplicationRateLimit({ visitorKey, now });
  if (!limit.allowed) {
    return Response.json(
      { code: "rate_limited", error: "Έχουν γίνει πολλές αιτήσεις από αυτή τη συσκευή. Επικοινώνησε μαζί μας αν χρειάζεσαι βοήθεια.", retryAfterMs: limit.retryAfterMs },
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
    if (body.website !== undefined && String(body.website).trim()) {
      return Response.json({ status: "received" }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    if (body.acceptedAccuracy !== true || body.acceptedGovernedOnboarding !== true || body.acceptedPrivacy !== true) {
      throw new Error("Χρειάζεται να επιβεβαιώσεις την ακρίβεια των στοιχείων, τη διαδικασία ελέγχου και την επεξεργασία δεδομένων.");
    }

    const application: VendorApplicationInput = {
      legalName: stringField(body.legalName),
      tradingName: stringField(body.tradingName),
      taxNumber: stringField(body.taxNumber),
      gemiNumber: optionalStringField(body.gemiNumber),
      contactEmail: stringField(body.contactEmail),
      phone: stringField(body.phone),
      address: stringField(body.address),
      postcode: stringField(body.postcode),
      primaryCategory: stringField(body.primaryCategory),
      shopStory: optionalStringField(body.shopStory),
      requestedPlanCode: vendorPlanField(body.requestedPlanCode),
      claimedResearchVendorId: optionalStringField(body.claimedResearchVendorId)
    };
    const receipt = await submitVendorApplication({ application, principal, now });

    const [, operationsEmail] = await Promise.all([
      sendVendorApplicationReceiptEmail({
        to: application.contactEmail,
        tradingName: application.tradingName,
        applicationId: receipt.applicationId
      }),
      notifyOperationsOfVendorApplication({
        applicationId: receipt.applicationId,
        tradingName: application.tradingName,
        legalName: application.legalName,
        contactEmail: application.contactEmail,
        requestedPlanCode: application.requestedPlanCode
      })
    ]);
    if (!operationsEmail.sent) {
      console.error(JSON.stringify({
        level: "error",
        event: "vendor_application.admin_notification_failed",
        applicationId: receipt.applicationId,
        destination: "info@kontamou.site"
      }));
    }

    let redirectTo: string | undefined;
    if (receipt.trial) {
      const access = createVendorTrialAccessToken({
        applicationId: receipt.applicationId,
        ownerUserId: receipt.trial.ownerUserId,
        vendorId: receipt.trial.vendorId,
        trialStartedAt: receipt.trial.startedAt
      });
      (await cookies()).set({
        name: VENDOR_TRIAL_COOKIE,
        value: access.token,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" || request.url.startsWith("https://"),
        path: "/",
        expires: new Date(access.accessExpiresAt)
      });
      redirectTo = "/vendor/trial";
    }

    return Response.json(
      {
        status: "verification_pending",
        reference: receipt.applicationId,
        accountClaimRequired: receipt.accountClaimRequired,
        registryLookupStatus: receipt.registryLookupStatus,
        redirectTo,
        trial: receipt.trial ? {
          vendorId: receipt.trial.vendorId,
          startsAt: new Date(receipt.trial.startedAt).toISOString(),
          expiresAt: new Date(receipt.trial.expiresAt).toISOString(),
          durationDays: 3
        } : undefined,
        message: receipt.trial
          ? "Η αίτηση καταχωρίστηκε. Το ιδιωτικό 3ήμερο trial του καταστήματός σου είναι έτοιμο — μπορείς να μπεις τώρα στο πραγματικό Vendor Dashboard, να στήσεις το storefront και να δοκιμάσεις τα εργαλεία χωρίς να ενεργοποιηθεί ζωντανή πώληση."
          : application.claimedResearchVendorId
            ? "Η αίτηση καταχωρίστηκε και συνδέθηκε με την υπάρχουσα δημόσια σελίδα για έλεγχο ιδιοκτησίας. Για λόγους ασφάλειας, η πλήρης trial πρόσβαση ξεκινά αφού ολοκληρωθεί η ταυτοποίηση της υπάρχουσας σελίδας."
            : "Η αίτηση καταχωρίστηκε και περιμένει έλεγχο."
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "APPLICATION_FAILED";
    if (code === "HUB_PRICING_REQUIRED") {
      return Response.json(
        {
          code: "hub_pricing_required",
          error: "Η επαληθευμένη τοποθεσία δεν ανήκει στο ενεργό HUB Σπάρτης. Θα συνεχίσεις με τα προγράμματα HUB που ισχύουν για την περιοχή σου.",
          redirectTo: "/hubs/join"
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (code === "EXISTING_ACCOUNT_LOGIN_REQUIRED") {
      return Response.json({ code: "login_required", error: "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδέσου πρώτα ώστε η αίτηση να συνδεθεί με τον σωστό ιδιοκτήτη." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "BUSINESS_ALREADY_REGISTERED") {
      return Response.json({ code: "business_already_registered", error: "Υπάρχει ήδη αίτηση ή ενεργή συνεργασία για αυτή την επιχείρηση. Επικοινώνησε με την ομάδα ΚΟΝΤΑ ΜΟΥ για να συνεχίσουμε με ασφάλεια από την υπάρχουσα εγγραφή." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "APPLICATION_EXISTS") {
      return Response.json({ code: "application_exists", error: "Υπάρχει ήδη αίτηση εμπόρου για αυτόν τον ιδιοκτήτη. Η ομάδα μας θα συνεχίσει από την υπάρχουσα αίτηση." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "RESEARCH_PROFILE_NOT_CLAIMABLE") {
      return Response.json({ code: "profile_not_claimable", error: "Αυτή η δημόσια σελίδα δεν είναι πλέον διαθέσιμη για νέα διεκδίκηση. Ανανέωσε τη σελίδα ή επικοινώνησε με την ομάδα ΚΟΝΤΑ ΜΟΥ για ασφαλή ταυτοποίηση." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (["MARKET_UNAVAILABLE", "PLAN_UNAVAILABLE"].includes(code)) {
      return Response.json({ code: "configuration_unavailable", error: "Η αίτηση δεν μπορεί να υποβληθεί αυτή τη στιγμή λόγω ρύθμισης της αγοράς. Επικοινώνησε με την ομάδα ΚΟΝΤΑ ΜΟΥ." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "CUSTOMER_ACCOUNT_REQUIRED") {
      return Response.json({ code: "account_required", error: "Χρειάζεται ενεργός λογαριασμός πελάτη για αυτή τη συνεδρία." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (isPublicValidationError(code)) {
      return Response.json({ code: "application_invalid", error: code }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    console.error(JSON.stringify({
      level: "error",
      event: "vendor_application.submit_failed",
      message: code,
      errorName: error instanceof Error ? error.name : "UnknownError"
    }));
    return Response.json(
      { code: "application_failed", error: "Δεν μπορέσαμε να καταχωρίσουμε την αίτηση λόγω τεχνικού προβλήματος. Δοκίμασε ξανά σε λίγο ή επικοινώνησε με την ομάδα ΚΟΝΤΑ ΜΟΥ." },
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

function vendorPlanField(value: unknown): VendorApplicationInput["requestedPlanCode"] {
  if (value === "founding_2026" || value === "annual" || value === "monthly") return value;
  throw new Error("Μη έγκυρη επιλογή προγράμματος.");
}

function isPublicValidationError(message: string): boolean {
  return [
    "Χρειάζεται να επιβεβαιώσεις",
    "Νομική επωνυμία:",
    "Εμπορική ονομασία:",
    "Το ΑΦΜ",
    "Ο αριθμός ΓΕΜΗ",
    "Χρειάζεται έγκυρο email",
    "Τηλέφωνο:",
    "Το τηλέφωνο",
    "Διεύθυνση:",
    "Ο ταχυδρομικός κώδικας",
    "Κατηγορία:",
    "Επίλεξε έγκυρη κατηγορία",
    "Το κείμενο μπορεί",
    "Μη έγκυρη επιλογή προγράμματος"
  ].some((prefix) => message.startsWith(prefix));
}
