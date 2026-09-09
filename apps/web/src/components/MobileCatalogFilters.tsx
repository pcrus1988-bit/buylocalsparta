"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

function isCatalogPath(pathname: string): boolean {
  // Category pages own their compact filter disclosure inside CategoryCatalogBrowser.
  // The global off-canvas drawer is only for /shop, where .catalog-sidebar exists.
  return pathname === "/shop";
}

export function MobileCatalogFilters() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visible = isCatalogPath(pathname);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const sidebar = document.querySelector<HTMLElement>(".catalog-sidebar");
    const previousId = sidebar?.id;
    if (sidebar) sidebar.id = "km-catalog-filter-panel";

    root.classList.toggle("km-catalog-filters-open", visible && open);
    if (visible && open) {
      window.setTimeout(() => sidebar?.querySelector<HTMLElement>("input, select, button")?.focus(), 60);
    }

    return () => {
      root.classList.remove("km-catalog-filters-open");
      if (sidebar) {
        if (previousId) sidebar.id = previousId;
        else sidebar.removeAttribute("id");
      }
    };
  }, [open, visible]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onSubmit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement && event.target.closest(".catalog-sidebar")) setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest(".catalog-sidebar a") : null;
      if (target) setOpen(false);
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
        onClick={() => setOpen(false)}
      />
      <button
        className="km-mobile-filter-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="km-catalog-filter-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">☷</span>
        {open ? "Κλείσιμο" : "Φίλτρα & ταξινόμηση"}
      </button>
      {open ? (
        <button className="km-mobile-filter-close" type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο φίλτρων">×</button>
      ) : null}
    </div>
  );
}
