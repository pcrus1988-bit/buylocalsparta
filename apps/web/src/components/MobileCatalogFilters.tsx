"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

function isCatalogPath(pathname: string): boolean {
  return pathname === "/shop" || pathname.startsWith("/category/");
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
    root.classList.toggle("km-catalog-filters-open", visible && open);
    if (visible && open) {
      const sidebar = document.querySelector<HTMLElement>(".catalog-sidebar");
      window.setTimeout(() => sidebar?.querySelector<HTMLElement>("input, select, button")?.focus(), 60);
    }
    return () => root.classList.remove("km-catalog-filters-open");
  }, [open, visible]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
