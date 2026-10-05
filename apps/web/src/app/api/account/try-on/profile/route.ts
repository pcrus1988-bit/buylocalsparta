import { requireAccountSession } from "../../../../../lib/account-session";
import {
  completeCustomerTryOnUpload,
  createCustomerTryOnUploadIntent,
  deleteCustomerTryOnProfile,
  getCustomerTryOnProfile,
  tryOnConsentVersion,
  tryOnFeatureEnabled,
  tryOnServiceConfigured
} from "../../../../../lib/try-on-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const profile = await getCustomerTryOnProfile(principal.userId);
    return Response.json({
      enabled: tryOnFeatureEnabled(),
      ready: tryOnServiceConfigured(),
      consentVersion: tryOnConsentVersion(),
      profile: profile ? { ...profile, photoUrl: "/api/account/try-on/profile/photo" } : null
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_PROFILE_FAILED";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const intent = await createCustomerTryOnUploadIntent({
      userPublicId: principal.userId,
      filename: typeof body.filename === "string" ? body.filename : "",
      contentType: typeof body.contentType === "string" ? body.contentType : "",
      byteSize: Number(body.byteSize),
      consentAccepted: body.consentAccepted === true
    });
    return Response.json({ intent }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_UPLOAD_FAILED";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.intentId !== "string" || !body.intentId.trim()) throw new Error("TRYON_UPLOAD_INTENT_REQUIRED");
    const profile = await completeCustomerTryOnUpload(principal.userId, body.intentId);
    return Response.json({ profile: { ...profile, photoUrl: "/api/account/try-on/profile/photo" } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_UPLOAD_COMPLETE_FAILED";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const url = new URL(request.url);
    const removed = await deleteCustomerTryOnProfile(principal.userId, url.searchParams.get("saved") === "delete");
    return Response.json({ removed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_PROFILE_DELETE_FAILED";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
