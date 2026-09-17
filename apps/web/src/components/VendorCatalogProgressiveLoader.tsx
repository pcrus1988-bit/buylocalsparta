"use client";

import { useEffect } from "react";

const MORE_BUTTON_SELECTOR = ".vc-more";
const LOAD_AHEAD_PX = 720;
const CLICK_COOLDOWN_MS = 650;

/**
 * Keeps large public vendor catalogues progressively loading as the shopper
 * approaches the end of the currently rendered grid. The catalogue API remains
 * paginated/search-first, so we never mount the full supplier catalogue at once.
 * The existing button stays in place as an accessible/manual fallback.
 */
export function VendorCatalogProgressiveLoader() {
  useEffect(() => {
    let frame = 0;
    let lastClickAt = 0;

    const maybeLoadMore = () => {
      frame = 0;
      const button = document.querySelector<HTMLButtonElement>(MORE_BUTTON_SELECTOR);
      if (!button || button.disabled || !button.isConnected) return;

      const now = Date.now();
      if (now - lastClickAt < CLICK_COOLDOWN_MS) return;

      const rect = button.getBoundingClientRect();
      const nearViewport = rect.top <= window.innerHeight + LOAD_AHEAD_PX && rect.bottom >= -LOAD_AHEAD_PX;
      if (!nearViewport) return;

      lastClickAt = now;
      button.click();
    };

    const scheduleCheck = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(maybeLoadMore);
    };

    const mutationObserver = new MutationObserver(scheduleCheck);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"]
    });

    window.addEventListener("scroll", scheduleCheck, { passive: true });
    window.addEventListener("resize", scheduleCheck, { passive: true });
    scheduleCheck();

    return () => {
      mutationObserver.disconnect();
      window.removeEventListener("scroll", scheduleCheck);
      window.removeEventListener("resize", scheduleCheck);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
