"use client";

import { useEffect, useId } from "react";

export type BoxNowLockerSelection = Readonly<{ id: string; postcode: string; address: string }>;

declare global {
  interface Window {
    _bn_map_widget_config?: Record<string, unknown>;
  }
}

export function BoxNowLockerSelector({ postcode, selected, onSelect }: { postcode: string; selected?: BoxNowLockerSelection; onSelect: (selection: BoxNowLockerSelection) => void }) {
  const rawId = useId();
  const elementId = `boxnowmap-${rawId.replace(/[^A-Za-z0-9_-]/g, "")}`;
  const enabled = process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED === "true";
  const partnerId = process.env.NEXT_PUBLIC_BOXNOW_PARTNER_ID?.trim();

  useEffect(() => {
    if (!enabled) return;
    const config: Record<string, unknown> = {
      parentElement: `#${elementId}`,
      type: "iframe",
      gps: false,
      zip: /^\d{5}$/.test(postcode) ? postcode : undefined,
      autoclose: false,
      afterSelect: (raw: unknown) => {
        const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const id = typeof value.boxnowLockerId === "string" || typeof value.boxnowLockerId === "number" ? String(value.boxnowLockerId) : "";
        const lockerPostcode = typeof value.boxnowLockerPostalCode === "string" ? value.boxnowLockerPostalCode : postcode;
        const address = typeof value.boxnowLockerAddressLine1 === "string" ? value.boxnowLockerAddressLine1 : "BOX NOW locker";
        if (id) onSelect({ id, postcode: lockerPostcode, address });
      }
    };
    if (partnerId) config.partnerId = /^\d+$/.test(partnerId) ? Number(partnerId) : partnerId;
    window._bn_map_widget_config = config;
    const existing = document.querySelector<HTMLScriptElement>('script[data-bls-boxnow-widget="true"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://widget-cdn.boxnow.gr/map-widget/client/v5.js";
      script.async = true;
      script.defer = true;
      script.dataset.blsBoxnowWidget = "true";
      document.head.appendChild(script);
    }
    return () => { if (window._bn_map_widget_config === config) delete window._bn_map_widget_config; };
  }, [enabled, elementId, onSelect, partnerId, postcode]);

  if (!enabled) return <div className="payment-placeholder"><strong>BOX NOW locker</strong><span>Η επιλογή locker ενεργοποιείται στο staging/production όταν ρυθμιστεί το BOX NOW partner widget.</span></div>;
  return <div className="boxnow-selector"><div className="boxnow-selector-heading"><strong>BOX NOW locker</strong>{selected && <span>✓ {selected.address} · {selected.postcode} · #{selected.id}</span>}</div><div id={elementId} className="boxnow-map" /></div>;
}
