import type { Metadata } from "next";
import { SiteHeader } from "../../components/SiteHeader";
import { AskLocalClient } from "../../components/AskLocalClient";
import { getAccountSession } from "../../lib/account-session";
import { customerAskLocalRequests } from "../../lib/ask-local-service";
import { SiteFooter } from "../../components/SiteFooter";

type Props = Readonly<{ searchParams: Promise<{ need?: string; product?: string; vendor?: string; source?: string }> }>;

export const metadata: Metadata = {
  title: "Ask Local",
  description: "Το κεντρικό σημείο για τοπική συμβουλή, επιλογή προϊόντος και ιδιωτική σύνδεση με κατάλληλο επαγγελματία της Σπάρτης.",
  alternates: { canonical: "/ask-local" }
};

export default async function AskLocalPage({ searchParams }: Props) {
  const principal = await getAccountSession();
  const params = await searchParams;
  const context = {
    need: typeof params.need === "string" ? params.need.slice(0, 2000) : undefined,
    canonicalVariantId: typeof params.product === "string" ? params.product : undefined,
    preferredVendorId: typeof params.vendor === "string" ? params.vendor : undefined,
    sourceUrl: typeof params.source === "string" ? params.source : undefined
  };
  const next = `/ask-local${params.product ? `?product=${encodeURIComponent(params.product)}` : params.vendor ? `?vendor=${encodeURIComponent(params.vendor)}` : ""}`;

  return <main>
    <div className="announcement">Ask Local · ένα σημείο για συμβουλή, επιλογή και σύνδεση με την τοπική αγορά.</div>
    <SiteHeader />

    <section className="ask-local-live-hero">
      <div className="shell">
        <div className="eyebrow">Η ανθρώπινη βοήθεια του Buy Local Sparta</div>
        <h1>Πες τι χρειάζεσαι. Θα σε οδηγήσουμε στον σωστό τοπικό άνθρωπο.</h1>
        <p>Το Ask Local είναι η κεντρική διαδρομή όταν θέλεις βοήθεια: είτε ψάχνεις ποιο προϊόν σου ταιριάζει είτε δεν ξέρεις ακόμη ποιο κατάστημα ή επαγγελματία χρειάζεσαι. Το αίτημά σου παραμένει ιδιωτικό — δεν μετατρέπεται σε δημόσιο bidding.</p>
        <div className="hero-actions">
          <a className="button" href="#send-request">Στείλε αίτημα</a>
          <a className="text-link" href="/advice">Θέλω πρώτα να δω τοπικούς συμβούλους →</a>
          <a className="text-link" href="/fairness">Πώς γίνεται η ανάθεση →</a>
        </div>
      </div>
    </section>

    <section className="shell content-section" aria-labelledby="ask-local-options-title">
      <div className="content-heading">
        <div>
          <div className="eyebrow">Δύο τρόποι να ξεκινήσεις</div>
          <h2 id="ask-local-options-title">Δεν χρειάζεται να διαλέξεις υπηρεσία. Διάλεξε μόνο τι χρειάζεσαι τώρα.</h2>
        </div>
        <p>Και οι δύο επιλογές ανήκουν στο Ask Local και οδηγούν στην ίδια ανθρώπινη, ιδιωτική εμπειρία.</p>
      </div>
      <div className="destination-grid">
        <a href="#send-request">
          <span>01</span>
          <strong>Δεν ξέρω από πού να ξεκινήσω</strong>
          <small>Περιέγραψε την ανάγκη σου και θα βρούμε τον κατάλληλο τοπικό συνεργάτη.</small>
        </a>
        <a href="/advice">
          <span>02</span>
          <strong>Θέλω βοήθεια να διαλέξω προϊόν</strong>
          <small>Γνώρισε διαθέσιμους τοπικούς συμβούλους και ανθρώπους που ξέρουν την κατηγορία.</small>
        </a>
      </div>
    </section>

    <div id="send-request">
      {principal ? (
        <AskLocalClient csrfToken={principal.csrfToken} initial={await customerAskLocalRequests(principal)} context={context} />
      ) : (
        <section className="shell ask-local-login">
          <div>
            <div className="eyebrow">Προστασία αιτήματος</div>
            <h2>Συνδέσου για να στείλεις και να παρακολουθείς το αίτημα.</h2>
            <p>Η περιγραφή, η ανάθεση και κάθε ιδιωτική προσφορά παραμένουν στον λογαριασμό σου.</p>
          </div>
          <a className="button" href={`/login?next=${encodeURIComponent(next)}`}>Σύνδεση πελάτη</a>
        </section>
      )}
    </div>

    <SiteFooter />
  </main>;
}
