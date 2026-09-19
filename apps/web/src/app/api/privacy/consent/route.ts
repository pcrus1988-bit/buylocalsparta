import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import {
  ANALYTICS_ID_COOKIE,
  PRIVACY_CONSENT_COOKIE,
  PRIVACY_CONSENT_MAX_AGE_SECONDS,
  PRIVACY_CONSENT_RECEIPT_COOKIE,
  PRIVACY_CONSENT_VERSION,
  cookieValue,
  encodePrivacyConsent
} from "../../../../lib/privacy-consent";
import { persistPrivacyConsentReceipt, type ConsentDecisionAction, type ConsentDecisionSource } from "../../../../lib/privacy-consent-evidence";
import { readVerifiedPrivacyConsentReceipt, signPrivacyConsentReceipt } from "../../../../lib/privacy-consent-server";

const SAFE_ANALYTICS_ID = /^[A-Za-z0-9_-]{16,128}$/;

type ConsentBody = Readonly<{
  personalisation?: unknown;
  analytics?: unknown;
  marketing?: unknown;
  source?: unknown;
}>;

function consentAction(input: { personalisation: boolean; analytics: boolean; marketing: boolean }): ConsentDecisionAction {
  if (!input.personalisation && input.analytics && !input.marketing) return "accept_all";
  if (!input.personalisation && !input.analytics && !input.marketing) return "reject_optional";
  return "custom";
}

function effectiveRequestOrigin(request: Request, requestUrl: URL): string {
  const host = request.headers.get("host")?.trim();
  if (!host) return requestUrl.origin;

  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http"
    ? forwardedProtocol
    : requestUrl.protocol.replace(/:$/, "").toLowerCase();

  return `${protocol}://${host.toLowerCase()}`;
}

function isSameOriginRequest(request: Request, requestUrl: URL): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin.toLowerCase() === effectiveRequestOrigin(request, requestUrl).toLowerCase();
  } catch {
    return false;
  }
}


export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const cookieHeader = request.headers.get("cookie") ?? "";
  const verified = readVerifiedPrivacyConsentReceipt(cookieHeader);
  const secure = effectiveRequestOrigin(request, requestUrl).startsWith("https://");
  const response = NextResponse.json(
    {
      consent: verified?.preferences ?? null,
      expiresAt: verified?.expiresAt ?? null,
      policyVersion: verified?.policyVersion ?? null
    },
    { status: 200, headers: { "cache-control": "no-store", pragma: "no-cache" } }
  );

  if (!verified) {
    for (const name of [PRIVACY_CONSENT_COOKIE, PRIVACY_CONSENT_RECEIPT_COOKIE, ANALYTICS_ID_COOKIE]) {
      response.cookies.set({ name, value: "", httpOnly: name !== PRIVACY_CONSENT_COOKIE, sameSite: "lax", secure, path: "/", maxAge: 0 });
    }
    return response;
  }

  response.cookies.set({
    name: PRIVACY_CONSENT_COOKIE,
    value: encodePrivacyConsent(verified.preferences),
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.max(0, Math.floor((verified.expiresAt - Date.now()) / 1000))
  });

  if (verified.preferences.analytics) {
    const existing = cookieValue(cookieHeader, ANALYTICS_ID_COOKIE);
    response.cookies.set({
      name: ANALYTICS_ID_COOKIE,
      value: existing && SAFE_ANALYTICS_ID.test(existing) ? existing : randomUUID(),
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: Math.max(0, Math.floor((verified.expiresAt - Date.now()) / 1000))
    });
  } else {
    response.cookies.set({ name: ANALYTICS_ID_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  }

  return response;
}

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    if (!isSameOriginRequest(request, requestUrl)) {
      return Response.json({ error: "cross_origin_consent_update_denied" }, { status: 403, headers: { "cache-control": "no-store" } });
    }

    const raw = await request.json().catch(() => null) as ConsentBody | null;
    if (!raw || typeof raw.personalisation !== "boolean" || typeof raw.analytics !== "boolean" || typeof raw.marketing !== "boolean") {
      return Response.json({ error: "invalid_privacy_consent" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    if (raw.personalisation || raw.marketing) {
      return Response.json({ error: "unsupported_unregistered_consent_category" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const source: ConsentDecisionSource = raw.source === "banner" ? "banner" : "settings";
    const decision = { personalisation: false, analytics: raw.analytics, marketing: false };
    const action = consentAction(decision);
    const cookieHeader = request.headers.get("cookie") ?? "";
    const previous = readVerifiedPrivacyConsentReceipt(cookieHeader);
    const decidedAt = Date.now();
    const receiptId = `consent_${randomUUID().replaceAll("-", "")}`;
    const expiresAt = decidedAt + PRIVACY_CONSENT_MAX_AGE_SECONDS * 1000;
    const preferences = {
      version: PRIVACY_CONSENT_VERSION,
      ...decision,
      decidedAt: new Date(decidedAt).toISOString()
    };

    // Consent itself must not depend on database availability. The signed receipt is
    // self-verifying, so apply the visitor's choice immediately and persist the
    // pseudonymous evidence after the response has been sent.
    after(async () => {
      try {
        await persistPrivacyConsentReceipt({
          receiptId,
          previousReceiptId: previous?.receiptId,
          source,
          action,
          ...decision,
          decidedAt
        });
      } catch (error) {
        console.error(JSON.stringify({
          level: "error",
          event: "privacy.consent_evidence_persist_failed",
          receiptId,
          message: error instanceof Error ? error.message : "privacy_consent_evidence_persist_failed"
        }));
      }
    });

    const now = preferences.decidedAt;
    const response = NextResponse.json(
      { consent: preferences, expiresAt },
      { status: 200 }
    );
    const secure = effectiveRequestOrigin(request, requestUrl).startsWith("https://");
    response.headers.set("cache-control", "no-store");
    response.headers.set("pragma", "no-cache");
    response.cookies.set({
      name: PRIVACY_CONSENT_COOKIE,
      value: encodePrivacyConsent({
        version: PRIVACY_CONSENT_VERSION,
        ...decision,
        decidedAt: now
      }),
      httpOnly: false,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: PRIVACY_CONSENT_MAX_AGE_SECONDS
    });
    response.cookies.set({
      name: PRIVACY_CONSENT_RECEIPT_COOKIE,
      value: signPrivacyConsentReceipt({ receiptId, ...decision, decidedAt, expiresAt }),
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: PRIVACY_CONSENT_MAX_AGE_SECONDS
    });

    if (raw.analytics) {
      const existing = cookieValue(cookieHeader, ANALYTICS_ID_COOKIE);
      response.cookies.set({
        name: ANALYTICS_ID_COOKIE,
        value: existing && SAFE_ANALYTICS_ID.test(existing) ? existing : randomUUID(),
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: PRIVACY_CONSENT_MAX_AGE_SECONDS
      });
    } else {
      response.cookies.set({
        name: ANALYTICS_ID_COOKIE,
        value: "",
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 0
      });
    }

    return response;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "privacy_consent_update_failed" },
      { status: 500, headers: { "cache-control": "no-store", pragma: "no-cache" } }
    );
  }
}
