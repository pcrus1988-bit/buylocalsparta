import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
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
  if (input.personalisation && input.analytics && input.marketing) return "accept_all";
  if (!input.personalisation && !input.analytics && !input.marketing) return "reject_optional";
  return "custom";
}

export async function POST(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const origin = request.headers.get("origin");
    if (origin && origin !== requestUrl.origin) return Response.json({ error: "cross_origin_consent_update_denied" }, { status: 403, headers: { "cache-control": "no-store" } });

    const raw = await request.json().catch(() => null) as ConsentBody | null;
    if (!raw || typeof raw.personalisation !== "boolean" || typeof raw.analytics !== "boolean" || typeof raw.marketing !== "boolean") {
      return Response.json({ error: "invalid_privacy_consent" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const source: ConsentDecisionSource = raw.source === "banner" ? "banner" : "settings";
    const decision = { personalisation: raw.personalisation, analytics: raw.analytics, marketing: raw.marketing };
    const action = consentAction(decision);
    const cookieHeader = request.headers.get("cookie") ?? "";
    const previous = readVerifiedPrivacyConsentReceipt(cookieHeader);
    const decidedAt = Date.now();
    const receiptId = `consent_${randomUUID().replaceAll("-", "")}`;
    const { expiresAt } = await persistPrivacyConsentReceipt({
      receiptId,
      previousReceiptId: previous?.receiptId,
      source,
      action,
      ...decision,
      decidedAt
    });

    const now = new Date(decidedAt).toISOString();
    const response = new NextResponse(null, { status: 204 });
    const secure = requestUrl.protocol === "https:";
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
