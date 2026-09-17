"use client";

import { useEffect } from "react";

function isCatalogueSortSelect(target: EventTarget | null): target is HTMLSelectElement {
  return target instanceof HTMLSelectElement && Boolean(target.closest(".vc-sort"));
}

function moveSelection(select: HTMLSelectElement, direction: 1 | -1): void {
  const enabled = Array.from(select.options).filter((option) => !option.disabled);
  if (!enabled.length) return;

  const current = Math.max(0, enabled.findIndex((option) => option.value === select.value));
  const next = Math.min(enabled.length - 1, Math.max(0, current + direction));
  const option = enabled[next];
  if (!option || option.value === select.value) return;

  select.value = option.value;
  // React's controlled select listens to the bubbling change event. Dispatch both
  // input and change so keyboard interaction remains reliable across mobile and
  // automation/browser implementations that do not commit native select changes.
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Accessibility safety net for the catalogue sorting controls.
 * Native <select> keyboard behaviour should normally be enough, but some mobile
 * browsers and browser automation layers do not commit ArrowUp/ArrowDown changes.
 * This capture listener guarantees a deterministic selection change without
 * changing the normal pointer/touch select behaviour.
 */
export function CatalogSortAccessibilityBridge() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCatalogueSortSelect(event.target)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(event.target, 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(event.target, -1);
      } else if (event.key === "Home") {
        const first = Array.from(event.target.options).find((option) => !option.disabled);
        if (!first || first.value === event.target.value) return;
        event.preventDefault();
        event.target.value = first.value;
        event.target.dispatchEvent(new Event("input", { bubbles: true }));
        event.target.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (event.key === "End") {
        const enabled = Array.from(event.target.options).filter((option) => !option.disabled);
        const last = enabled.at(-1);
        if (!last || last.value === event.target.value) return;
        event.preventDefault();
        event.target.value = last.value;
        event.target.dispatchEvent(new Event("input", { bubbles: true }));
        event.target.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return null;
}
