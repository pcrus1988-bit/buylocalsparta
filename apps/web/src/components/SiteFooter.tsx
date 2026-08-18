import Link from "next/link";
import { FOOTER_NAVIGATION } from "../lib/site-navigation";

export function SiteFooter() {
  return (
    <footer className="footer site-footer">
      <div className="shell footer-grid footer-grid-expanded">
        <div className="footer-intro">
          <Link className="brand footer-brand" href="/" aria-label="Buy Local Sparta · αρχική">
            <span className="brand-mark">BLS</span><span>Buy Local Sparta</span>
          </Link>
          <p>Buy Local. Know Your Vendor. Get Real Advice.</p>
          <small>Μία ανθρώπινη ψηφιακή αγορά για τη Σπάρτη και τη γύρω περιοχή.</small>
        </div>
        {FOOTER_NAVIGATION.map((group) => (
          <nav aria-label={group.title} key={group.title}>
            <strong>{group.title}</strong>
            {group.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
          </nav>
        ))}
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Buy Local Sparta</span>
        <span>Τοπικά προϊόντα · πραγματικοί άνθρωποι · καθαροί κανόνες</span>
      </div>
    </footer>
  );
}
