"use client";

import { requestCookieSettings } from "./PrivacyConsentProvider";

export function CookieSettingsButton({ className = "cookie-settings-button", label = "Ρυθμίσεις cookies" }: { className?: string; label?: string }) {
  return <button type="button" className={className} onClick={requestCookieSettings}>{label}</button>;
}
