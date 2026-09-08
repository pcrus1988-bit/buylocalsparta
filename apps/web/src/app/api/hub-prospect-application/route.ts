import { getHubExpansionPlan, type HubExpansionPlanCode } from "../../../lib/hub-expansion-plans";
import {
  consumeHubProspectRateLimit,
  HubProspectApplicationError,
  hubProspectApplicationReadiness,
  submitHubProspectApplication,
  type HubProspectApplicationInput
} from "../../../lib/hub-prospect-application-runtime";

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
      businessName: stringField(body.businessName),
      contactName: stringField(body.contactName),
      email: stringField(body.email),
      phone: stringField(body.phone),
      primaryCategory: stringField(body.primaryCategory),
      websiteUrl: optionalStringField(body.websiteUrl),
      currentSalesChannels: optionalStringField(body.currentSalesChannels),
      notes: optionalStringField(body.notes)
    };

    const receipt = await submitHubProspectApplication({ application, now });
    return Response.json({
      ...receipt,
      message: receipt.planCode === "claim"
        ? "Η δωρεάν καταχώριση CLAIM μπήκε σε έλεγχο για το HUB που αντιστοιχεί στην επαληθευμένη τοποθεσία Γ.Ε.ΜΗ."
        : "Το ενδιαφέρον συνεργασίας καταχωρίστηκε για το HUB που αντιστοιχεί στην επαληθευμένη τοποθεσία Γ.Ε.ΜΗ. Δεν έγινε χρέωση."
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof HubProspectApplicationError) {
      return Response.json(
        {
          code: error.code,
          error: error.message,
          redirectTo: error.code === "sparta_uses_existing_join" ? "/join/apply" : undefined
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
