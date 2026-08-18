import { getAccountSession } from "../../../lib/account-session";
import { assertCustomerCsrf } from "../../../lib/customer-state-runtime";
import {
  consumeVendorApplicationRateLimit,
  submitVendorApplication,
  vendorApplicationReadiness,
  type VendorApplicationInput
} from "../../../lib/vendor-application-runtime";

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
      requestedPlanCode: body.requestedPlanCode === "founding_2026" ? "founding_2026" : "free_listing"
    };
    const receipt = await submitVendorApplication({ application, principal, now });
    return Response.json(
      {
        status: "verification_pending",
        reference: receipt.applicationId,
        accountClaimRequired: receipt.accountClaimRequired,
        message: "Η αίτηση καταχωρίστηκε και περιμένει έλεγχο από το Buy Local Sparta. Δεν έχει δημιουργηθεί πρόσβαση εμπόρου."
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "APPLICATION_FAILED";
    if (code === "EXISTING_ACCOUNT_LOGIN_REQUIRED") {
      return Response.json({ code: "login_required", error: "Υπάρχει ήδη λογαριασμός με αυτό το email. Συνδέσου πρώτα ώστε η αίτηση να συνδεθεί με τον σωστό ιδιοκτήτη." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "BUSINESS_ALREADY_REGISTERED") {
      return Response.json({ code: "business_already_registered", error: "Υπάρχει ήδη αίτηση ή ενεργή συνεργασία για αυτή την επιχείρηση. Επικοινώνησε με την ομάδα Buy Local Sparta για να συνεχίσουμε με ασφάλεια από την υπάρχουσα εγγραφή." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "APPLICATION_EXISTS") {
      return Response.json({ code: "application_exists", error: "Υπάρχει ήδη αίτηση εμπόρου για αυτόν τον ιδιοκτήτη. Η ομάδα μας θα συνεχίσει από την υπάρχουσα αίτηση." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
    if (["MARKET_UNAVAILABLE", "PLAN_UNAVAILABLE"].includes(code)) {
      return Response.json({ code: "configuration_unavailable", error: "Η αίτηση δεν μπορεί να υποβληθεί αυτή τη στιγμή λόγω ρύθμισης της αγοράς. Επικοινώνησε με την ομάδα Buy Local Sparta." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (code === "CUSTOMER_ACCOUNT_REQUIRED") {
      return Response.json({ code: "account_required", error: "Χρειάζεται ενεργός λογαριασμός πελάτη για αυτή τη συνεδρία." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ code: "application_invalid", error: code }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalStringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
