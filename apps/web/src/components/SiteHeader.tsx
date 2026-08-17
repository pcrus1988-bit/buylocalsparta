"use client";

import { useCart } from "./CartProvider";

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { count } = useCart();
  return (
    <header className="site-header shell">
      <a className="brand" href="/"><span className="brand-mark">BLS</span><span>Buy Local Sparta</span></a>
      <nav className="nav" aria-label="Primary">
        <a href="/shop">Αγορές</a>
        <a href="/#people">Καταστήματα & άνθρωποι</a>
        {!compact && <a href="/#advice">Συμβουλή</a>}
        <a href="/#ask-local">Ask Local</a>
      </nav>
      <div className="header-actions">
        <a className="icon-button header-icon-link" href="/account" aria-label="Λογαριασμός">◎</a>
        <a className="cart-button" href="/cart">Καλάθι <span>{count}</span></a>
      </div>
    </header>
  );
}
