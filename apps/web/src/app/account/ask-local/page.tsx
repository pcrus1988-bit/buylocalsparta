import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { AskLocalClient } from "../../../components/AskLocalClient";
import { AskLocalCustomerActions } from "../../../components/AskLocalCustomerActions";
import { CustomerHowItWorks } from "../../../components/CustomerAccountPrimitives";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerAskLocalBrowserRequests } from "../../../lib/customer-ask-local-browser-view";

export const metadata: Metadata = { title: "Ask Local · Τα αιτήματά μου", robots: { index: false, follow: false } };
type Props = Readonly<{ searchParams: Promise<{ need?: string; product?: string; vendor?: string; source?: string }> }>;

export default async function AccountAskLocalPage({ searchParams }: Props) {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/ask-local");
  const params = await searchParams;
  const context = {
    need: typeof params.need === "string" ? params.need.slice(0, 2000) : undefined,
    canonicalVariantId: typeof params.product === "string" ? params.product : undefined,
    preferredVendorId: typeof params.vendor === "string" ? params.vendor : undefined,
    sourceUrl: typeof params.source === "string" ? params.source : undefined
  };
  const requests = await customerAskLocalBrowserRequests(principal);

  return <main className="account-app">
    <div className="announcement">Ask Local · νέο ιδιωτικό αίτημα και πορεία των ενεργών αιτημάτων σου.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page account-service-intro" style={{paddingBottom:18}}>
      <div className="customer-page-heading"><div><div className="eyebrow">Ask Local · Η τοπική βοήθειά σου</div><h1>Τι ψάχνεις σήμερα;</h1></div><p>Περιέγραψε αυτό που χρειάζεσαι, στείλε ένα ιδιωτικό αίτημα και παρακολούθησε τις απαντήσεις.</p></div>
      <div className="account-subpage-jumps" aria-label="Γρήγορες ενέργειες Ask Local"><a className="account-jump-primary" href="#new-ask-local">✎ Νέο αίτημα</a><a href="#my-ask-local">Τα αιτήματά μου <span aria-hidden="true">↗</span></a><span className="account-subpage-count">{requests.length} συνολικά</span></div>
      <CustomerHowItWorks><p>Αν το αίτημα συνδέεται με συγκεκριμένο προϊόν, εφαρμόζεται η δίκαιη ανάθεση όπου είναι διαθέσιμη. Αν έχεις επιλέξει συγκεκριμένο κατάστημα, το αίτημα παραμένει ιδιωτικό προς αυτό. Τα γενικά αιτήματα περνούν από την ομάδα ΚΟΝΤΑ ΜΟΥ για σωστή δρομολόγηση.</p></CustomerHowItWorks>
    </section>
    <AskLocalCustomerActions csrfToken={principal.csrfToken} initial={requests} />
    <AskLocalClient csrfToken={principal.csrfToken} initial={requests} context={context} />
  </main>;
}
