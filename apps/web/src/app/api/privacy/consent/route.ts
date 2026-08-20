import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  ANALYTICS_ID_COOKIE,
  PRIVACY_CONSENT_COOKIE,
  PRIVACY_CONSENT_MAX_AGE_SECONDS,
  PRIVACY_CONSENT_VERSION,
  cookieValue,
  encodePrivacyConsent
} from "../../../../lib/privacy-consent";

const SAFE_ANALYTICS_ID = /^[A-Za-z0-9_-]{16,128}$/;

type ConsentBody = Readonly<{
  personalisation?: unknown;
  analytics?: unknown;
  marketing?: unknown;
}>;

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null) as ConsentBody | null;
  if (!raw || typeof raw.personalisation !== "boolean" || typeof raw.analytics !== "boolean" || typeof raw.marketing !== "boolean") {
    return Response.json({ error: "invalid_privacy_consent" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const response = new NextResponse(null, { status: 204 });
  const secure = new URL(request.url).protocol === "https:";
  response.headers.set("cache-control", "no-store");
  response.cookies.set({
    name: PRIVACY_CONSENT_COOKIE,
    value: encodePrivacyConsent({
      version: PRIVACY_CONSENT_VERSION,
      personalisation: raw.personalisation,
      analytics: raw.analytics,
      marketing: raw.marketing,
      decidedAt: now
    }),
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: PRIVACY_CONSENT_MAX_AGE_SECONDS
  });

  if (raw.analytics) {
    const existing = cookieValue(request.headers.get("cookie") ?? "", ANALYTICS_ID_COOKIE);
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
}
