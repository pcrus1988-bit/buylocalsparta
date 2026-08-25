import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { AskLocalClient } from "../../components/AskLocalClient";
import { AskLocalCustomerActions } from "../../components/AskLocalCustomerActions";
import { getAccountSession } from "../../lib/account-session";
import { customerAskLocalBrowserRequests } from "../../lib/customer-ask-local-browser-view";
import { SiteFooter } from "../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

type Props = Readonly<{ searchParams: Promise<{ need?: string; product?: string; vendor?: string; source?: string }> }>;
export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/ask-local", {
    title: "Ask Local",
    description: "Πες τι ψάχνεις και δρομολόγησέ το ιδιωτικά σε κατάλληλο τοπικό επαγγελματία."
  });
}

export default async function AskLocalPage({ searchParams }: Props) {
  const principal = await getAccountSession();
  const params = await searchParams;
  const context = {
    need: typeof params.need === "string" ? params.need.slice(0, 2000) : undefined,
    canonicalVariantId: typeof params.product === "string" ? params.product : undefined,
    preferredVendorId: typeof params.vendor === "string" ? params.vendor : undefined,
    sourceUrl: typeof params.source === "string" ? params.source : undefined
  };
  const nextParams = new URLSearchParams();
  if (context.need) nextParams.set("need", context.need);
  if (context.canonicalVariantId) nextParams.set("product", context.canonicalVariantId);
  if (context.preferredVendorId) nextParams.set("vendor", context.preferredVendorId);
  if (context.sourceUrl) nextParams.set("source", context.sourceUrl);
  const next = `/ask-local${nextParams.size ? `?${nextParams.toString()}` : ""}`;
  const requests = principal ? await customerAskLocalBrowserRequests(principal) : [];

  return <main>
    <div className="announcement">Ask Local · ένα ιδιωτικό αίτημα, ένας κατάλληλος τοπικός συνεργάτης.</div>
    <SiteHeader />
    <section className="ask-local-live-hero"><div className="shell"><div className="eyebrow">No public bidding</div><h1>Δεν το βρήκες; Ρώτησε τη Σπάρτη.</h1><p>Για συνδεδεμένο προϊόν χρησιμοποιείται η υπάρχουσα δίκαιη ανάθεση· για συγκεκριμένο κατάστημα το αίτημα παραμένει ιδιωτικό· τα γενικά αιτήματα περνούν πρώτα από την πλατφόρμα.</p><div className="hero-actions"><a className="text-link" href="/fairness">Πώς γίνεται η ανάθεση →</a><a className="text-link" href="/help">Βοήθεια με το Ask Local →</a></div></div></section>
    {principal ? <><AskLocalCustomerActions csrfToken={principal.csrfToken} initial={requests} /><AskLocalClient csrfToken={principal.csrfToken} initial={requests} context={context} /></> : <section className="shell ask-local-login"><div><div className="eyebrow">Προστασία αιτήματος</div><h2>Συνδέσου για να στείλεις και να παρακολουθείς το αίτημα.</h2><p>Η περιγραφή, η ανάθεση και κάθε ιδιωτική προσφορά παραμένουν στον λογαριασμό σου.</p></div><a className="button" href={`/login?next=${encodeURIComponent(next)}`}>Σύνδεση πελάτη</a></section>}
    <SiteFooter />
  </main>;
}
