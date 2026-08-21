import Link from "next/link";
import { FOOTER_NAVIGATION } from "../lib/site-navigation";
import { CookieSettingsButton } from "./CookieSettingsButton";

const MAIN_FOOTER_NAVIGATION = FOOTER_NAVIGATION.slice(0, 3);
const LEGAL_FOOTER_NAVIGATION = FOOTER_NAVIGATION[3];

export function SiteFooter() {
  return (
    <footer className="footer site-footer" aria-label="Υποσέλιδο">
      <div className="shell site-footer-main">
        <div className="site-footer-intro">
          <section className="site-footer-brand-block" aria-label="ΚΟΝΤΑ ΜΟΥ Sparta">
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
          </section>

          <section className="site-footer-business" aria-labelledby="footer-business-title">
            <span className="site-footer-business-eyebrow">Νομικά & επικοινωνία</span>
            <strong id="footer-business-title">Στοιχεία επιχείρησης</strong>
            <dl>
              <div>
                <dt>Εμπορική ονομασία</dt>
                <dd>ΚΟΝΤΑ ΜΟΥ Sparta</dd>
              </div>
              <div>
                <dt>Διεύθυνση επικοινωνίας</dt>
                <dd>Σειρήνων 11, 23100 Σπάρτη</dd>
              </div>
            </dl>
            <Link href="/help">Κέντρο βοήθειας & επικοινωνία</Link>
          </section>
        </div>

        <nav className="site-footer-nav-desktop" aria-label="Σύνδεσμοι υποσέλιδου">
          {MAIN_FOOTER_NAVIGATION.map((group) => (
            <section className="site-footer-nav-group" key={group.title}>
              <strong>{group.title}</strong>
              <div className="site-footer-links">
                {group.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
              </div>
            </section>
          ))}
        </nav>

        <nav className="site-footer-nav-mobile" aria-label="Σύνδεσμοι υποσέλιδου">
          {MAIN_FOOTER_NAVIGATION.map((group) => (
            <details className="site-footer-disclosure" key={group.title}>
              <summary>{group.title}</summary>
              <div className="site-footer-links">
                {group.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
              </div>
            </details>
          ))}
        </nav>
      </div>

      <div className="shell site-footer-bottom">
        <span>© {new Date().getFullYear()} ΚΟΝΤΑ ΜΟΥ Sparta</span>
        <nav className="site-footer-legal-links" aria-label={LEGAL_FOOTER_NAVIGATION.title}>
          {LEGAL_FOOTER_NAVIGATION.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
          <CookieSettingsButton className="site-footer-cookie-button" />
        </nav>
      </div>
    </footer>
  );
}
