"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NON_INDEXABLE_PAGE_ROUTES, PRIMARY_NAVIGATION } from "../lib/site-navigation";
import { isCustomerMobileCommercePath } from "../lib/customer-mobile-commerce";
import { useCart } from "./CartProvider";

const PRIVATE_VENDOR_ROUTES = new Set(NON_INDEXABLE_PAGE_ROUTES.filter((route) => route.startsWith("/vendor/")) as ReadonlyArray<string>);

function navigationActive(pathname: string, href: string): boolean {
  if (href === "/shop") return pathname === "/shop" || pathname.startsWith("/category/") || pathname.startsWith("/product/");
  if (href === "/bazaar") return pathname === "/bazaar" || pathname.startsWith("/bazaar/");
  if (href === "/shops") return pathname === "/shops" || (/^\/vendor\/[^/]+$/.test(pathname) && !PRIVATE_VENDOR_ROUTES.has(pathname));
  return pathname === href;
}

function AccountIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}>
      <circle cx="12" cy="7" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}>
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 7H6" />
      <circle cx="9.5" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { count, openCart, isCartOpen, cartPulseKey } = useCart();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const relocateMobileCommerceActions = isCustomerMobileCommercePath(pathname);
  const flashSaleActive = pathname === "/flash-sale";

  return (
    <header className={`site-header shell${compact ? " is-compact" : ""}${menuOpen ? " is-menu-open" : ""}`}>
      <Link className="brand" href="/" aria-label="ΚΟΝΤΑ ΜΟΥ Σπάρτη · αρχική" onClick={() => setMenuOpen(false)}>
        <img src="/brand/kontamou-sparta-logo.webp" alt="ΚΟΝΤΑ ΜΟΥ Σπάρτη" width={96} height={64} style={{ display: "block", width: "96px", height: "64px", objectFit: "contain" }} />
      </Link>

      <Link
        className={`flash-sale-shortcut${flashSaleActive ? " is-active" : ""}`}
        href="/flash-sale"
        aria-label="ΚΟΝΤΑ ΜΟΥ Flash Sale"
        aria-current={flashSaleActive ? "page" : undefined}
        onClick={() => setMenuOpen(false)}
      >
        <span className="flash-sale-bolt" aria-hidden="true">⚡</span>
        <span className="flash-sale-shortcut-copy" aria-hidden="true"><strong>FLASH</strong><small>SALE</small></span>
      </Link>

      <button className="public-menu-toggle" type="button" aria-label={menuOpen ? "Κλείσιμο μενού" : "Άνοιγμα μενού"} aria-expanded={menuOpen} aria-controls="public-site-navigation" onClick={() => setMenuOpen((current) => !current)}>
        <span>{menuOpen ? "Κλείσιμο" : "Μενού"}</span>
        <i aria-hidden="true" />
      </button>

      <nav id="public-site-navigation" className="nav" aria-label="Κύρια πλοήγηση">
        {PRIMARY_NAVIGATION.map((link) => {
          const active = navigationActive(pathname, link.href);
          return (
            <Link href={link.href} key={link.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className={`header-actions${relocateMobileCommerceActions ? " customer-mobile-relocatable-actions" : ""}`}>
        <Link className="header-location" href="/choose-location" aria-label="Τρέχουσα περιοχή: Σπάρτη. Αλλαγή περιοχής">
          <span className="header-location-dot" aria-hidden="true" />
          <span>Σπάρτη</span>
        </Link>
        <form className="header-search" action="/shop" role="search">
          <label className="header-search-label" htmlFor="site-header-search">Αναζήτηση προϊόντων</label>
          <SearchIcon />
          <input id="site-header-search" name="q" type="search" placeholder="Αναζήτηση" maxLength={120} autoComplete="off" />
        </form>
        <Link className={`cart-button account-button${pathname.startsWith("/account") ? " is-active" : ""}`} href="/account" aria-label="Λογαριασμός">
          <AccountIcon />
          <span className="header-action-text">Λογαριασμός</span>
        </Link>
        <button className={`cart-button${isCartOpen ? " is-active" : ""}`} type="button" onClick={openCart} aria-label={`Καλάθι, ${count} προϊόντα`} aria-expanded={isCartOpen} aria-controls="global-cart-drawer">
          <CartIcon />
          <span className="header-action-text">Καλάθι</span> <span key={cartPulseKey} aria-hidden="true">{count}</span>
        </button>
      </div>

      <style>{`
        .header-actions > button.cart-button { font: inherit; cursor: pointer; }
        .site-header > .flash-sale-shortcut { display: none; }

        @media (min-width: 1321px) {
          .site-header {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            grid-template-rows: auto auto;
            align-items: center;
            column-gap: 24px;
            row-gap: 0;
            min-height: 118px;
            padding-top: 8px;
            padding-bottom: 10px;
          }
          .site-header > .brand {
            grid-column: 1;
            grid-row: 1;
            align-self: center;
          }
          .site-header > .public-menu-toggle {
            display: none;
          }
          .site-header > .nav {
            grid-column: 1 / -1;
            grid-row: 2;
            justify-content: flex-start;
            align-items: center;
            gap: 28px;
            min-width: 0;
            padding-top: 4px;
            white-space: nowrap;
          }
          .site-header > .header-actions {
            grid-column: 3;
            grid-row: 1;
            justify-self: end;
            min-width: 0;
          }
          .site-header > .header-actions .header-location {
            display: none;
          }
        }

        @keyframes konta-header-flash {
          0%, 68%, 80%, 100% {
            background: #111;
            color: #ffd600;
            border-color: #ffd600;
            box-shadow: 0 0 0 0 rgba(255, 214, 0, 0);
          }
          73% {
            background: #ffd600;
            color: #090909;
            border-color: #ffd600;
            box-shadow: 0 0 0 6px rgba(255, 214, 0, .14), 0 0 22px rgba(255, 214, 0, .34);
          }
        }

        @media (max-width: 1320px) {
          .site-header { position: relative; }
          .site-header > .flash-sale-shortcut {
            position: absolute;
            left: 50%;
            top: 50%;
            z-index: 4;
            transform: translate(-50%, -50%);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            min-width: 96px;
            min-height: 44px;
            padding: 5px 12px;
            border: 1.5px solid #ffd600;
            border-radius: 999px;
            background: #111;
            color: #ffd600;
            text-decoration: none;
            line-height: 1;
            box-shadow: 0 7px 18px rgba(0, 0, 0, .16);
            animation: konta-header-flash 2.6s ease-in-out infinite;
            isolation: isolate;
          }
          .site-header.is-menu-open > .flash-sale-shortcut { top: 39px; }
          .site-header > .flash-sale-shortcut.is-active {
            background: #ffd600;
            color: #090909;
            animation: none;
            box-shadow: 0 7px 18px rgba(255, 214, 0, .18);
          }
          .flash-sale-bolt {
            font-size: 1.05rem;
            line-height: 1;
            transform: translateY(-1px);
          }
          .flash-sale-shortcut-copy {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 1px;
            letter-spacing: .08em;
          }
          .flash-sale-shortcut-copy strong {
            font-size: .72rem;
            font-weight: 950;
          }
          .flash-sale-shortcut-copy small {
            font-size: .56rem;
            font-weight: 900;
            letter-spacing: .18em;
          }
        }

        @media (max-width: 620px) {
          .site-header.is-menu-open > .flash-sale-shortcut { top: 34px; }
        }

        @media (max-width: 370px) {
          .site-header > .flash-sale-shortcut {
            min-width: 86px;
            padding-left: 9px;
            padding-right: 9px;
            gap: 5px;
          }
          .flash-sale-bolt { font-size: .92rem; }
          .flash-sale-shortcut-copy strong { font-size: .66rem; }
          .flash-sale-shortcut-copy small { font-size: .51rem; }
        }

        @media (max-width: 1320px) and (min-width: 1081px) {
          .site-header {
            flex-wrap: wrap;
            gap: 8px;
            min-height: 70px;
            padding-top: 8px;
            padding-bottom: 8px;
          }
          .site-header > .brand { flex: 0 0 auto; }
          .site-header > .public-menu-toggle {
            display: inline-flex;
            margin-left: auto;
            min-width: 44px;
            min-height: 44px;
          }
          .site-header > .nav {
            display: none;
            order: 10;
            width: 100%;
            flex-direction: column;
            align-items: stretch;
            gap: 2px;
            padding: 8px;
            border: 1px solid var(--line);
            border-radius: 14px;
            background: var(--white);
          }
          .site-header.is-menu-open > .nav { display: flex; }
          .site-header > .nav a {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            min-height: 44px;
            padding: 0 14px;
            border-radius: 9px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .site-header > .flash-sale-shortcut { animation: none; }
        }
      `}</style>
    </header>
  );
}
