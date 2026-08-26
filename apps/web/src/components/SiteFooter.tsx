import Link from "next/link";
import { KONTA_MOY_EMAIL_COMPANY } from "@buy-local-sparta/resend-notifications";
import { FOOTER_NAVIGATION } from "../lib/site-navigation";
import { CookieSettingsButton } from "./CookieSettingsButton";

const MAIN_FOOTER_NAVIGATION = FOOTER_NAVIGATION.slice(0, 3);
const LEGAL_FOOTER_NAVIGATION = FOOTER_NAVIGATION[3];
const BUSINESS_NAME = "SP BUSINESS LAB";
const SPARTA_BRANCH_ADDRESS = "Σειρήνων 11, 23100 Σπάρτη";

export function SiteFooter() {
  return (
    <footer className="footer site-footer" aria-label="Υποσέλιδο">
      <div className="shell site-footer-main">
        <div className="site-footer-intro">
          <section className="site-footer-brand-block" aria-label="ΚΟΝΤΑ ΜΟΥ Σπάρτη">
            <Link className="brand footer-brand" href="/" aria-label="ΚΟΝΤΑ ΜΟΥ Σπάρτη · αρχική">
              <img
                src="/brand/kontamou-sparta-logo.webp"
                alt="ΚΟΝΤΑ ΜΟΥ Σπάρτη"
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
            <strong id="footer-business-title">{BUSINESS_NAME}</strong>
            <dl>
              <div>
                <dt>Νόμιμος εκπρόσωπος</dt>
                <dd>{KONTA_MOY_EMAIL_COMPANY.representative}</dd>
              </div>
              <div>
                <dt>ΑΦΜ</dt>
                <dd>{KONTA_MOY_EMAIL_COMPANY.taxNumber}</dd>
              </div>
              <div>
                <dt>Αριθμός ΓΕΜΗ</dt>
                <dd>{KONTA_MOY_EMAIL_COMPANY.gemiNumber}</dd>
              </div>
              <div>
                <dt>Έδρα</dt>
                <dd>{KONTA_MOY_EMAIL_COMPANY.address}</dd>
              </div>
              <div>
                <dt>Υποκατάστημα Σπάρτης</dt>
                <dd>{SPARTA_BRANCH_ADDRESS}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd><a href={`mailto:${KONTA_MOY_EMAIL_COMPANY.email}`}>{KONTA_MOY_EMAIL_COMPANY.email}</a></dd>
              </div>
              <div>
                <dt>Τηλέφωνο</dt>
                <dd><a href={`tel:+30${KONTA_MOY_EMAIL_COMPANY.phone}`}>693 699 9686</a></dd>
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
        <span>© {new Date().getFullYear()} ΚΟΝΤΑ ΜΟΥ Σπάρτη · {BUSINESS_NAME}</span>
        <nav className="site-footer-legal-links" aria-label={LEGAL_FOOTER_NAVIGATION.title}>
          {LEGAL_FOOTER_NAVIGATION.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
          <CookieSettingsButton className="site-footer-cookie-button" />
        </nav>
      </div>
    </footer>
  );
}
