import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountSectionNavigation } from "../../../components/AccountSectionNavigation";
import { CustomerSupportClient } from "../../../components/CustomerSupportClient";
import { SiteHeader } from "../../../components/SiteHeader";
import { getAccountSession } from "../../../lib/account-session";
import { customerSupportCases, customerSupportReadiness, CUSTOMER_SUPPORT_CONTEXT_TYPES, type CustomerSupportContextType } from "../../../lib/customer-support-runtime";

export const metadata: Metadata = { title: "Υποστήριξη λογαριασμού", robots: { index: false, follow: false } };

type Props = Readonly<{ searchParams: Promise<{ context?: string; id?: string; label?: string; subject?: string }> }>;

export default async function AccountSupportPage({ searchParams }: Props) {
  const principal = await getAccountSession();
  if (!principal) redirect("/login?next=/account/support");
  const params = await searchParams;
  const contextRaw = typeof params.context === "string" ? params.context : "";
  const contextType = CUSTOMER_SUPPORT_CONTEXT_TYPES.includes(contextRaw as CustomerSupportContextType) ? contextRaw as CustomerSupportContextType : undefined;
  const readiness = customerSupportReadiness();
  const cases = await customerSupportCases(principal);
  return <main className="account-app">
    <div className="announcement">Υποστήριξη · αιτήματα, απαντήσεις και πορεία επίλυσης.</div>
    <SiteHeader compact />
    <AccountSectionNavigation />
    <CustomerSupportClient
      csrfToken={principal.csrfToken}
      initialCases={cases}
      ready={readiness.ready}
      readinessMessage={readiness.message}
      initialContext={{
        type: contextType,
        id: typeof params.id === "string" ? params.id.slice(0, 200) : undefined,
        label: typeof params.label === "string" ? params.label.slice(0, 120) : undefined,
        subject: typeof params.subject === "string" ? params.subject.slice(0, 240) : undefined
      }}
    />
  </main>;
}
