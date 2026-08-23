import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { CustomerHowItWorks } from "../../../components/CustomerAccountPrimitives";
import { CustomerReviewsClient } from "../../../components/CustomerReviewsClient";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerReviewWorkspace } from "../../../lib/customer-reviews-runtime";

export const metadata: Metadata = { title: "Αξιολογήσεις", robots: { index: false, follow: false } };

export default async function CustomerReviewsPage() {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/reviews");
  const workspace = await customerReviewWorkspace(principal);
  return <main>
    <div className="announcement">Αξιολογήσεις · μόνο από πραγματικές επαληθευμένες εμπειρίες.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page" style={{ paddingBottom: 12 }}>
      <div className="customer-page-heading"><div><div className="eyebrow">Εμπιστοσύνη</div><h1>Οι αξιολογήσεις μου</h1></div><p>Αγορά, ραντεβού ή συμβουλή πρώτα· αξιολόγηση μετά. Η πλατφόρμα συνδέει την αξιολόγηση με την πραγματική πηγή χωρίς να δημοσιεύει προσωπικά στοιχεία.</p></div>
      <CustomerHowItWorks title="Πώς προστατεύεται η αξιοπιστία;"><p>Η πηγή της αξιολόγησης επιβεβαιώνεται στον server και ξανά στη βάση δεδομένων. Μία επαληθευμένη εμπειρία μπορεί να αξιολογηθεί μόνο μία φορά. Η αξιολόγηση περνά από moderation πριν γίνει δημόσια και δεν χρησιμοποιείται ως βάρος στη δίκαιη ανάθεση vendor.</p></CustomerHowItWorks>
    </section>
    <CustomerReviewsClient csrfToken={principal.csrfToken} candidates={workspace.candidates} reviews={workspace.reviews} />
  </main>;
}
