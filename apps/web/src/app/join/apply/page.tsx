import type { Metadata } from "next";
import { VendorApplicationForm } from "../../../components/VendorApplicationForm";
import { SiteFooter } from "../../../components/SiteFooter";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { vendorApplicationReadiness } from "../../../lib/vendor-application-runtime";

export const metadata: Metadata = {
  title: "Αίτηση συνεργασίας εμπόρου",
  description: "Υπόβαλε ελεγχόμενη αίτηση συνεργασίας για το Buy Local Sparta. Η αίτηση περνά από verification, catalog onboarding και test readiness πριν από οποιαδήποτε ενεργοποίηση.",
  robots: { index: false, follow: true }
};

export default async function VendorApplicationPage() {
  const principal = await getAccountSession();
  const readiness = vendorApplicationReadiness();
  return <main>
    <div className="announcement">Vendor onboarding · αίτηση → επαλήθευση → catalog onboarding → test readiness → ενεργοποίηση.</div>
    <SiteHeader compact />
    <section className="shell section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">Vendor application</div>
          <h1>Ξεκίνα την αίτηση συνεργασίας.</h1>
        </div>
        <p>Η φόρμα γράφει απευθείας στην παραγωγική βάση αιτήσεων του Buy Local Sparta. Η υποβολή δεν παρακάμπτει κανένα onboarding gate και δεν δημιουργεί vendor access.</p>
      </div>

      <div className="shops-principles" aria-label="Vendor application steps">
        <div><strong>1 · Submit</strong><span>Καταχωρίζονται τα βασικά στοιχεία της επιχείρησης και η αίτηση περνά σε verification pending.</span></div>
        <div><strong>2 · Verify & onboard</strong><span>Η ομάδα ελέγχει επιχείρηση, contact ownership, κατάλογο, stock και readiness.</span></div>
        <div><strong>3 · Admin activation</strong><span>Vendor business, location και vendor-owner access δημιουργούνται μόνο μετά την τελική ελεγχόμενη ενεργοποίηση.</span></div>
      </div>

      <div className="login-layout vendor-apply-layout">
        <div className="login-copy">
          <div className="eyebrow">Πριν υποβάλεις</div>
          <h2>Έχε διαθέσιμα τα πραγματικά στοιχεία της επιχείρησης.</h2>
          <p>Θα χρειαστούμε νομική και εμπορική ονομασία, ΑΦΜ, στοιχεία φυσικού καταστήματος, υπεύθυνο επικοινωνίας και βασική εικόνα του καταλόγου/stock.</p>
          <div className="fairness-note">
            <strong>Δεν χρειάζεται να έχεις τέλειο e-shop.</strong>
            <p>Ο στόχος είναι να φέρουμε το κατάστημά σου στο κοινό marketplace. Στο onboarding μπορούμε να βοηθήσουμε με catalog mapping, product data, stock process και παρουσίαση της επιχείρησης.</p>
          </div>
          <a className="text-link" href="/join/requirements">Ξαναδές το readiness checklist →</a>
          <a className="text-link" href="/fairness">Πώς προστατεύεται η ισότιμη ανάθεση →</a>
          {principal && <div className="account-gate"><strong>Συνδεδεμένος λογαριασμός</strong><p>{principal.email}</p><p>Η αίτηση θα συνδεθεί με αυτή την επαληθευμένη ταυτότητα, ανεξάρτητα από το business contact email.</p></div>}
        </div>
        <div className="login-panel vendor-apply-panel">
          {!readiness.ready ? <div className="account-gate"><strong>Η αίτηση δεν είναι διαθέσιμη.</strong><p>{readiness.message}</p></div> : <VendorApplicationForm csrfToken={principal?.csrfToken} signedInEmail={principal?.email} />}
        </div>
      </div>
    </section>
    <SiteFooter />
  </main>;
}
