"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { isCustomerMobileCommercePath } from "../lib/customer-mobile-commerce";
import { recordProductAnalyticsEvent } from "../lib/product-analytics-client";
import { useCart } from "./CartProvider";

export type CustomerMobileProductAction = Readonly<{
  id: string;
  title: string;
  priceMinor: number;
  price: string;
  available: boolean;
}>;

type CustomerMobileCommerceContextValue = Readonly<{
  registerProduct: (product?: CustomerMobileProductAction) => void;
}>;

const CustomerMobileCommerceContext = createContext<CustomerMobileCommerceContextValue | null>(null);

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function AccountIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
}

function AddIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>;
}

function CartIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 7H6" /><circle cx="9.5" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>;
}

function CloseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

function CustomerMobileCommerceNav({ product }: { product?: CustomerMobileProductAction }) {
  const pathname = usePathname();
  const router = useRouter();
  const { addItem, count } = useCart();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmation, setConfirmation] = useState<string>();
  const confirmationTimer = useRef<number>();
  const productPage = pathname.startsWith("/product/");
  const showProductAction = productPage && Boolean(product);

  useEffect(() => () => {
    if (confirmationTimer.current) window.clearTimeout(confirmationTimer.current);
  }, []);

  const runSearch = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setSearchOpen(false);
    router.push(`/shop?q=${encodeURIComponent(query)}`);
  }, [router, searchQuery]);

  const addProduct = useCallback(() => {
    if (!product?.available) return;
    addItem({ canonicalVariantId: product.id, title: product.title, priceMinor: product.priceMinor, price: product.price }, 1);
    recordProductAnalyticsEvent({ eventType: "add_to_cart", canonicalVariantId: product.id, surface: "product_page" });
    setConfirmation(`Προστέθηκε 1 × ${product.title} στο καλάθι.`);
    if (confirmationTimer.current) window.clearTimeout(confirmationTimer.current);
    confirmationTimer.current = window.setTimeout(() => setConfirmation(undefined), 3000);
  }, [addItem, product]);

  return (
    <>
      {confirmation ? <div className="customer-mobile-commerce-confirmation" role="status" aria-live="polite">{confirmation}</div> : null}
      <nav className={`customer-mobile-commerce-nav${showProductAction ? " has-product-action" : ""}${searchOpen ? " is-search-open" : ""}`} aria-label="Γρήγορες αγορές">
        {searchOpen ? (
          <form className="customer-mobile-commerce-search-panel" role="search" onSubmit={runSearch}>
            <SearchIcon />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Τι προϊόν ψάχνεις;"
              aria-label="Αναζήτηση σε όλα τα προϊόντα"
              autoComplete="off"
              autoFocus
              maxLength={120}
            />
            <button className="customer-mobile-commerce-search-submit" type="submit" aria-label="Εκτέλεση αναζήτησης"><span>Enter</span></button>
            <button className="customer-mobile-commerce-search-close" type="button" aria-label="Κλείσιμο αναζήτησης" onClick={() => setSearchOpen(false)}><CloseIcon /></button>
          </form>
        ) : null}

        <button
          className={`customer-mobile-commerce-item${searchOpen ? " is-active" : ""}`}
          type="button"
          aria-label="Άνοιγμα αναζήτησης προϊόντων"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((current) => !current)}
        >
          <SearchIcon />
          <span>Αναζήτηση</span>
        </button>
        <Link className={`customer-mobile-commerce-item${pathname.startsWith("/account") ? " is-active" : ""}`} href="/account" aria-label="Λογαριασμός">
          <AccountIcon />
          <span>Λογαριασμός</span>
        </Link>
        {showProductAction ? (
          <button
            className="customer-mobile-commerce-item customer-mobile-commerce-add"
            type="button"
            disabled={!product?.available}
            onClick={addProduct}
            aria-label={product?.available ? `Προσθήκη ενός ${product.title} στο καλάθι` : "Το προϊόν δεν είναι διαθέσιμο"}
          >
            <span className="customer-mobile-commerce-add-icon"><AddIcon /></span>
            <span>{product?.available ? "+1 προϊόν" : "Μη διαθέσιμο"}</span>
          </button>
        ) : null}
        <Link className={`customer-mobile-commerce-item customer-mobile-commerce-cart${pathname === "/cart" ? " is-active" : ""}`} href="/cart" aria-label={`Καλάθι, ${count} προϊόντα`}>
          <span className="customer-mobile-commerce-cart-icon"><CartIcon />{count > 0 ? <b aria-hidden="true">{count > 99 ? "99+" : count}</b> : null}</span>
          <span>Καλάθι</span>
        </Link>
      </nav>
    </>
  );
}

export function CustomerMobileCommerceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [product, setProduct] = useState<CustomerMobileProductAction>();
  const registerProduct = useCallback((next?: CustomerMobileProductAction) => setProduct(next), []);
  const value = useMemo(() => ({ registerProduct }), [registerProduct]);
  const eligible = isCustomerMobileCommercePath(pathname);

  return (
    <CustomerMobileCommerceContext.Provider value={value}>
      {children}
      {eligible ? <><div className="customer-mobile-commerce-spacer" aria-hidden="true" /><CustomerMobileCommerceNav product={product} /></> : null}
    </CustomerMobileCommerceContext.Provider>
  );
}

export function useCustomerMobileCommerce() {
  const value = useContext(CustomerMobileCommerceContext);
  if (!value) throw new Error("useCustomerMobileCommerce must be used within CustomerMobileCommerceProvider");
  return value;
}
