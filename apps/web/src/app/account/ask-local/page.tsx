import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { AskLocalClient } from "../../../components/AskLocalClient";
import { CustomerHowItWorks } from "../../../components/CustomerAccountPrimitives";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerAskLocalRequests } from "../../../lib/ask-local-service";
import { customerAskLocalRequestViews } from "../../../lib/customer-ask-local-view";

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

  return <main className="account-app">
    <div className="announcement">Ask Local · νέο ιδιωτικό αίτημα και πορεία των ενεργών αιτημάτων σου.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <section className="shell customer-account-page" style={{paddingBottom:18}}>
      <div className="customer-page-heading"><div><div className="eyebrow">Ask Local</div><h1>Ρώτησε την τοπική αγορά</h1></div><p>Πες τι ψάχνεις. Το αίτημα δρομολογείται ιδιωτικά και η κατάστασή του παραμένει στον λογαριασμό σου.</p></div>
      <CustomerHowItWorks><p>Αν το αίτημα συνδέεται με συγκεκριμένο προϊόν, εφαρμόζεται η δίκαιη ανάθεση όπου είναι διαθέσιμη. Αν έχεις επιλέξει συγκεκριμένο κατάστημα, το αίτημα παραμένει ιδιωτικό προς αυτό. Τα γενικά αιτήματα περνούν από την ομάδα ΚΟΝΤΑ ΜΟΥ για σωστή δρομολόγηση.</p></CustomerHowItWorks>
    </section>
    <AskLocalClient csrfToken={principal.csrfToken} initial={customerAskLocalRequestViews(await customerAskLocalRequests(principal))} context={context} />
  </main>;
}
