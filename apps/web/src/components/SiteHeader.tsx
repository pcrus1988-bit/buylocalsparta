"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NON_INDEXABLE_PAGE_ROUTES, PRIMARY_NAVIGATION } from "../lib/site-navigation";
import { useCart } from "./CartProvider";

const PRIVATE_VENDOR_ROUTES = new Set(NON_INDEXABLE_PAGE_ROUTES.filter((route) => route.startsWith("/vendor/")) as ReadonlyArray<string>);

function navigationActive(pathname: string, href: string): boolean {
  if (href === "/shop") return pathname === "/shop" || pathname.startsWith("/category/") || pathname.startsWith("/product/");
  if (href === "/shops") return pathname === "/shops" || (/^\/vendor\/[^/]+$/.test(pathname) && !PRIVATE_VENDOR_ROUTES.has(pathname));
  return pathname === href;
}

function AccountIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "0 0 auto" }}
    >
      <circle cx="12" cy="7" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "0 0 auto" }}
    >
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 7H6" />
      <circle cx="9.5" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </svg>
  );
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { count } = useCart();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className={`site-header shell${compact ? " is-compact" : ""}${menuOpen ? " is-menu-open" : ""}`}>
      <Link className="brand" href="/" aria-label="ΚΟΝΤΑ ΜΟΥ Sparta · αρχική" onClick={() => setMenuOpen(false)}>
        <img
          src="/brand/kontamou-sparta-logo.webp"
          alt="ΚΟΝΤΑ ΜΟΥ Sparta"
          width={96}
          height={64}
          style={{ display: "block", width: "96px", height: "64px", objectFit: "contain" }}
        />
      </Link>

      <button
        className="public-menu-toggle"
        type="button"
        aria-label={menuOpen ? "Κλείσιμο μενού" : "Άνοιγμα μενού"}
        aria-expanded={menuOpen}
        aria-controls="public-site-navigation"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span>
        <i aria-hidden="true" />
      </button>

      <nav id="public-site-navigation" className="nav" aria-label="Κύρια πλοήγηση">
        {PRIMARY_NAVIGATION.map((link) => {
          const active = navigationActive(pathname, link.href);
          return (
            <Link
              href={link.href}
              key={link.href}
              className={active ? "is-active" : undefined}
              aria-current={active ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="header-actions">
        <Link
          className={`cart-button account-button${pathname.startsWith("/account") ? " is-active" : ""}`}
          href="/account"
          aria-label="Λογαριασμός"
        >
          <AccountIcon />
          Λογαριασμός
        </Link>
        <Link
          className={`cart-button${pathname === "/cart" ? " is-active" : ""}`}
          href="/cart"
          aria-label={`Καλάθι, ${count} προϊόντα`}
        >
          <CartIcon />
          Καλάθι <span aria-hidden="true">{count}</span>
        </Link>
      </div>
    </header>
  );
}