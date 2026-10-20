import Link from "next/link";
import "./design-system.css";

/**
 * DrinkStock owns its visual identity beneath the Hospitality gateway.
 * Public landing, TV and table views are self-contained; authenticated pages
 * share this compact product navigation without inheriting gateway chrome.
 */
export default function DrinkStockLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ds-experience" data-drinkstock-design>
      <header className="ds-product-header">
        <div className="ds-product-header-inner">
          <Link href="/drinkstock" className="ds-product-brand" aria-label="DrinkStock home">
            <span className="ds-product-mark" aria-hidden="true">↗</span>
            <span className="ds-product-wordmark">DRINK<span>STOCK</span><small>THE PARTY MARKET</small></span>
          </Link>
          <nav className="ds-product-navigation" aria-label="DrinkStock application">
            <Link href="/drinkstock#exchange">THE EXCHANGE</Link>
            <Link href="/drinkstock/dashboard">MY VENUES</Link>
            <Link href="/drinkstock/login" className="ds-product-access">PARTNER ACCESS ↗</Link>
          </nav>
        </div>
      </header>
      <div className="ds-product-content">{children}</div>
      <footer className="ds-product-footer">
        <span><strong>DRINK<span>STOCK</span> ↗</strong> / A KONTA MOY HOSPITALITY EXPERIENCE</span>
        <nav aria-label="DrinkStock footer">
          <Link href="/drinkstock">THE EXCHANGE</Link>
          <Link href="/drinkstock/dashboard">PARTNER DASHBOARD</Link>
          <Link href="/">HOSPITALITY GATEWAY ↗</Link>
        </nav>
      </footer>
    </div>
  );
}
