import Link from "next/link";
import { FOOTER_NAVIGATION } from "../lib/site-navigation";

export function SiteFooter() {
  return (
    <footer className="footer site-footer">
      <div className="shell footer-grid footer-grid-expanded">
        <div className="footer-intro">
          <Link className="brand footer-brand" href="/" aria-label="ΚΟΝΤΑ ΜΟΥ Sparta · αρχική">
            <img
              src="/brand/kontamou-sparta-logo.webp"
              alt="ΚΟΝΤΑ ΜΟΥ Sparta"
              width={108}
              height={72}
              style={{ display: "block", width: "108px", height: "72px", objectFit: "contain" }}
            />
          </Link>
          <p>ΚΟΝΤΑ ΜΟΥ: Η Σπάρτη δίπλα σου</p>
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
        <span>© {new Date().getFullYear()} ΚΟΝΤΑ ΜΟΥ Sparta</span>
        <span>Τοπικά προϊόντα · πραγματικοί άνθρωποι · καθαροί κανόνες</span>
      </div>
    </footer>
  );
}
