"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

function isCatalogPath(pathname: string): boolean {
  // Category pages own their compact filter disclosure inside CategoryCatalogBrowser.
  // The global off-canvas drawer is only for /shop, where .catalog-sidebar exists.
  return pathname === "/shop";
}

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function MobileCatalogFilters() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const visible = isCatalogPath(pathname);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const sidebar = document.querySelector<HTMLElement>(".catalog-sidebar");
    const previousId = sidebar?.id;
    const previousRole = sidebar?.getAttribute("role");
    const previousModal = sidebar?.getAttribute("aria-modal");
    const previousLabel = sidebar?.getAttribute("aria-label");
    const previousOverflow = body.style.overflow;
    if (sidebar) sidebar.id = "km-catalog-filter-panel";

    root.classList.toggle("km-catalog-filters-open", visible && open);
    if (visible && open && sidebar) {
      sidebar.setAttribute("role", "dialog");
      sidebar.setAttribute("aria-modal", "true");
      sidebar.setAttribute("aria-label", "Φίλτρα και ταξινόμηση προϊόντων");
      body.style.overflow = "hidden";
      window.setTimeout(() => sidebar.querySelector<HTMLElement>(FOCUSABLE)?.focus(), 60);
    }

    return () => {
      root.classList.remove("km-catalog-filters-open");
      body.style.overflow = previousOverflow;
      if (sidebar) {
        if (previousId) sidebar.id = previousId;
        else sidebar.removeAttribute("id");
        if (previousRole) sidebar.setAttribute("role", previousRole);
        else sidebar.removeAttribute("role");
        if (previousModal) sidebar.setAttribute("aria-modal", previousModal);
        else sidebar.removeAttribute("aria-modal");
        if (previousLabel) sidebar.setAttribute("aria-label", previousLabel);
        else sidebar.removeAttribute("aria-label");
      }
    };
  }, [open, visible]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const sidebar = document.querySelector<HTMLElement>(".catalog-sidebar");
      const closeButton = document.querySelector<HTMLElement>(".km-mobile-filter-close");
      const controls = [closeButton, ...(sidebar ? Array.from(sidebar.querySelectorAll<HTMLElement>(FOCUSABLE)) : [])]
        .filter((item): item is HTMLElement => Boolean(item && item.getClientRects().length));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onSubmit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement && event.target.closest(".catalog-sidebar")) close(false);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(".catalog-sidebar a") : null;
      if (target) close(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("submit", onSubmit);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  if (!visible) return null;

  return (
    <div className="km-mobile-filter-controls">
      <button
        className="km-mobile-filter-backdrop"
        type="button"
        aria-label="Κλείσιμο φίλτρων"
        tabIndex={open ? 0 : -1}
        onClick={() => close()}
      />
      <button
        ref={triggerRef}
        className="km-mobile-filter-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="km-catalog-filter-panel"
        onClick={() => open ? close(false) : setOpen(true)}
      >
        <span aria-hidden="true">☷</span>
        {open ? "Κλείσιμο" : "Φίλτρα & ταξινόμηση"}
      </button>
      {open ? (
        <button className="km-mobile-filter-close" type="button" onClick={() => close()} aria-label="Κλείσιμο φίλτρων">×</button>
      ) : null}
    </div>
  );
}
