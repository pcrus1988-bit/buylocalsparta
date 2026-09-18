import Link from "next/link";
import { KONTA_MOY_EMAIL_COMPANY } from "@buy-local-sparta/resend-notifications";
import { FOOTER_NAVIGATION } from "../lib/site-navigation";
import { CookieSettingsButton } from "./CookieSettingsButton";

const MAIN_FOOTER_NAVIGATION = FOOTER_NAVIGATION.slice(0, 3);
const LEGAL_FOOTER_NAVIGATION = FOOTER_NAVIGATION[3];
const BUSINESS_NAME = "SP BUSINESS LAB";
const SPARTA_BRANCH_ADDRESS = "Σειρήνων 11, 23100 Σπάρτη";
const DEVELOPED_IN_SPARTA_BADGE = "data:image/webp;base64,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";

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

          <div className="site-footer-company-row">
            <section className="site-footer-business" aria-labelledby="footer-business-title">
            <span className="site-footer-business-eyebrow">Νομικά & επικοινωνία</span>
            <span className="site-footer-business-name" id="footer-business-title">{BUSINESS_NAME}</span>
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

            <div className="site-footer-locality-mark" aria-label="Developed in Sparta for Greece">
              <img
                src={DEVELOPED_IN_SPARTA_BADGE}
                alt="Developed in Sparta for Greece"
                width={360}
                height={270}
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>

        <nav className="site-footer-nav" aria-label="Σύνδεσμοι υποσέλιδου">
          {MAIN_FOOTER_NAVIGATION.map((group) => (
            <section className="site-footer-nav-group" key={group.title}>
              <span className="site-footer-nav-title">{group.title}</span>
              <div className="site-footer-links">
                {group.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
              </div>
            </section>
          ))}
        </nav>
      </div>

      <div className="shell site-footer-payments" aria-label="Τρόποι πληρωμής">
        <div className="site-footer-payment-copy">
          <strong>Ασφαλείς online πληρωμές</strong>
          <span>Οι διαθέσιμες μέθοδοι εμφανίζονται στο checkout.</span>
        </div>
        <div className="site-footer-payment-marks" aria-label="Visa, Mastercard και Klarna">
          <span className="payment-brand payment-brand-visa" aria-label="Visa">VISA</span>
          <span className="payment-brand payment-brand-mastercard" aria-label="Mastercard"><i aria-hidden="true"><b /><b /></i><em>mastercard</em></span>
          <span className="payment-brand payment-brand-klarna" aria-label="Klarna">Klarna.</span>
        </div>
        <div className="site-footer-powered">
          <span>Payments powered by</span>
          <strong aria-label="Mollie">mollie</strong>
        </div>
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
