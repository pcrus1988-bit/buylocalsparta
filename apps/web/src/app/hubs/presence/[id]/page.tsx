import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "../../../../components/SiteHeader";
import { SiteFooter } from "../../../../components/SiteFooter";
import { getAccountSession, requireAccountSession } from "../../../../lib/account-session";
import { assertCustomerCsrf } from "../../../../lib/customer-state-runtime";
import { directoryPlanAgreementForViewer } from "../../../../lib/hub-directory-agreement";
import { acceptApprovedHubPresence, approvedHubPresence } from "../../../../lib/hub-presence-runtime";
import styles from "../../claim/claim.module.css";

export const metadata: Metadata = { title: "Αποδοχή όρων PRESENCE · KONTA MOY", robots: { index: false, follow: false } };

async function acceptPresence(form: FormData) {
  "use server";
  const principal = await requireAccountSession();
  assertCustomerCsrf(principal, String(form.get("csrfToken") ?? ""));
  const id = String(form.get("prospectId") ?? "");
  if (form.get("termsConsent") !== "on" || form.get("publishConsent") !== "on") {
    throw new Error("Both agreement and separate publication consent are required");
  }
  await acceptApprovedHubPresence(id, principal, {
    templateSha256: String(form.get("templateSha256") ?? ""),
    termsConsent: true,
    publicationConsent: true
  });
  revalidatePath("/hubs/presence/" + id);
  redirect("/hubs/presence/" + encodeURIComponent(id) + "?accepted=1");
}

export default async function PresenceAcceptancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await getAccountSession();
  const invitation = await approvedHubPresence(id, principal);
  if (!invitation) notFound();
  const contract = principal && invitation.eligibleEmail && !invitation.accepted
    ? await directoryPlanAgreementForViewer(id, principal, "presence")
    : undefined;
  const back = encodeURIComponent("/hubs/presence/" + id);
  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB PRESENCE</div>
        <h1 className={styles.title}>Συμφωνία ψηφιακής παρουσίας</h1>
        <p className={styles.lead}>{invitation.businessName} · HUB {invitation.hubCity}. Το PRESENCE είναι συνδρομή προβολής, όχι κατάστημα marketplace.</p>
      </div>
      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Έλεγχος και αποδοχή εκπροσώπου</h2>
          {!principal ? <p>Συνδέσου με το επαληθευμένο email της αίτησης. <Link href={"/login?next=" + back}>Σύνδεση →</Link></p> :
            !invitation.eligibleEmail ? <p>Ο συνδεδεμένος λογαριασμός δεν είναι ο επαληθευμένος εκπρόσωπος.</p> :
              invitation.accepted ? <p role="status">Η αποδοχή της συμφωνίας έχει καταγραφεί. Η υπηρεσία δεν έχει ενεργοποιηθεί· εκκρεμούν οι προϋποθέσεις πληρωμής και δημοσίευσης.</p> :
                <form action={acceptPresence}>
                  <p>Διάβασε τους εγκεκριμένους όρους PRESENCE, έκδοση {contract?.plan.templateVersion}, για τη δική σου επιχείρηση.</p>
                  <p><Link href={`/hubs/presence/${encodeURIComponent(id)}/agreement`} target="_blank">Προβολή πλήρους συμφωνίας PRESENCE (PDF) ↗</Link></p>
                  <label className={styles.field}><span><input type="checkbox" name="termsConsent" required /> Έχω διαβάσει και αποδέχομαι τους εγκεκριμένους όρους PRESENCE.</span></label>
                  <label className={styles.field}><span><input type="checkbox" name="publishConsent" required /> Εγκρίνω χωριστά τη μελλοντική δημοσίευση επαγγελματικών στοιχείων μετά την ολοκλήρωση των ελέγχων.</span></label>
                  <input type="hidden" name="csrfToken" value={principal.csrfToken} />
                  <input type="hidden" name="prospectId" value={id} />
                  <input type="hidden" name="templateSha256" value={contract?.templateSha256 ?? ""} />
                  <button type="submit" className={styles.button}>Αποδέχομαι την PRESENCE συμφωνία</button>
                </form>}
        </section>
        <section className={styles.panel}>
          <h2>Τι γίνεται μετά</h2>
          <p>Η αποδοχή καταγράφεται με αποτύπωμα SHA-256, έκδοση και χρόνο. Δεν δημιουργεί checkout, δυνατότητα πωλήσεων ή άμεση δημόσια ενεργοποίηση. Η ομάδα KONTA MOY θα ολοκληρώσει τα επόμενα βήματα της συνδρομής.</p>
        </section>
      </div>
    </section>
    <SiteFooter />
  </main>;
}
