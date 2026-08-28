"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import type { VendorVisibilityInteraction } from "../lib/vendor-visibility";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & Readonly<{
  vendorId: string;
  event: VendorVisibilityInteraction;
}>;

function capture(vendorId: string, event: VendorVisibilityInteraction): void {
  const body = JSON.stringify({ vendorId, event });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/analytics/vendor-interaction", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/analytics/vendor-interaction", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true
    });
  } catch {
    // Analytics must never block navigation.
  }
}

export function VendorVisibilityLink({ vendorId, event, onClick, ...props }: Props) {
  function handleClick(clickEvent: MouseEvent<HTMLAnchorElement>) {
    capture(vendorId, event);
    onClick?.(clickEvent);
  }
  return <a {...props} onClick={handleClick} />;
}
