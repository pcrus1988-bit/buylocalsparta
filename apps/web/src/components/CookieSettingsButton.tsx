"use client";

import { requestCookieSettings } from "./PrivacyConsentProvider";

export function CookieSettingsButton() {
  return <button type="button" className="cookie-settings-button" onClick={requestCookieSettings}>Ρυθμίσεις cookies</button>;
}
