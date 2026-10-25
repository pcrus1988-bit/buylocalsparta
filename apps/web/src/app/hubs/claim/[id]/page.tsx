import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "../../../../components/SiteHeader";
import { SiteFooter } from "../../../../components/SiteFooter";
import { assertCustomerCsrf } from "../../../../lib/customer-state-runtime";
import { getAccountSession, requireAccountSession } from "../../../../lib/account-session";
import { acceptApprovedHubClaim, getHubClaimInvitation } from "../../../../lib/hub-claim-runtime";
import { claimDirectoryAgreementForViewer } from "../../../../lib/hub-directory-agreement";
import { prepareHubClaimPasswordReset } from "../../../../lib/vendor-activation-access";
import { sendVendorPasswordResetEmail } from "../../../../lib/vendor-activation-email";
import styles from "../claim.module.css";

export const metadata: Metadata = { title: "Επιβεβαίωση δωρεάν CLAIM · KONTA MOY", robots: { index: false, follow: false } };

async function acceptClaim(formData: FormData) {
  "use server";
  const principal = await requireAccountSession();
  assertCustomerCsrf(principal, String(formData.get("csrfToken") ?? ""));
  const id = String(formData.get("claimId") ?? "");
  if (formData.get("publishConsent") !== "on") throw new Error("Explicit public-directory consent is required");
  if (formData.get("termsConsent") !== "on") throw new Error("Explicit plan agreement acceptance is required");
  await acceptApprovedHubClaim(id, principal, { templateSha256: String(formData.get("templateSha256") ?? ""), termsConsent: true, publicationConsent: true });
  let setupSent = false;
  try {
    const access = await prepareHubClaimPasswordReset({ claimId: id, actorUserId: principal.userId, now: Date.now() });
    await sendVendorPasswordResetEmail(access, { claim: true });
    setupSent = true;
  } catch (error) {
    console.error(JSON.stringify({ event: "hub_claim.vendor_access_email_failed", claimId: id, error: error instanceof Error ? error.message : String(error) }));
  }
  revalidatePath("/vendor/claim");
  redirect(setupSent
    ? "/vendor/login?next=%2Fvendor%2Fclaim&claimSetup=sent"
    : "/vendor/login?next=%2Fvendor%2Fclaim&claimSetup=delivery_failed");
}

export default async function ApprovedHubClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principal = await getAccountSession();
  const invitation = await getHubClaimInvitation(id, principal);
  if (!invitation) notFound();
  const agreement = invitation.status === "approved" && invitation.eligibleEmail && principal
    ? await claimDirectoryAgreementForViewer(id, principal)
    : undefined;
  const loginNext = encodeURIComponent("/hubs/claim/" + id);

  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · HUB CLAIM</div>
        <h1 className={styles.title}>Κατοχύρωσε τη δωρεάν καταχώρισή σου.</h1>
        <p className={styles.lead}>Η αίτηση για το {invitation.businessName} στο HUB {invitation.hubCity} έχει εγκριθεί από την ομάδα μας. Για να ενεργοποιηθεί η δημόσια σελίδα χρειάζεται επιβεβαίωση από τον εγκεκριμένο εκπρόσωπο.</p>
      </div>
      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Επιβεβαίωση εκπροσώπου</h2>
          {invitation.claimedByUser
            ? <><p className={styles.hint}>Η καταχώριση είναι ήδη ενεργή στον λογαριασμό σου.</p><Link className={styles.button} href="/vendor/login?next=%2Fvendor%2Fclaim">Άνοιξε το CLAIM Dashboard →</Link></>
            : invitation.status === "converted"
              ? <p className={styles.hint}>Η καταχώριση έχει ήδη παραληφθεί από τον εγκεκριμένο λογαριασμό. Επικοινώνησε με το KONTA MOY αν χρειάζεσαι πρόσβαση.</p>
              : !principal
                ? <><p>Συνδέσου ή δημιούργησε KONTA MOY λογαριασμό με το email που επιβεβαιώθηκε στην αίτηση. Θα επιστρέψεις εδώ για την τελική αποδοχή.</p><div className={styles.actions}><Link className={styles.button} href={"/login?next=" + loginNext}>Σύνδεση</Link><Link className={styles.button + " " + styles.secondary} href={"/register?next=" + loginNext}>Δημιουργία λογαριασμού</Link></div></>
                : !invitation.eligibleEmail
                  ? <p className={styles.hint}>Ο συνδεδεμένος λογαριασμός δεν αντιστοιχεί στο εγκεκριμένο email εκπροσώπου ή δεν έχει επαληθευτεί. Συνδέσου με τον σωστό λογαριασμό ή ζήτησε διορθωτικό έλεγχο από την ομάδα.</p>
                  : <form action={acceptClaim}>
                      <p>Με την αποδοχή επιβεβαιώνεις ότι εκπροσωπείς νόμιμα την επιχείρηση και αναλαμβάνεις την ευθύνη ενημέρωσης των δημόσιων στοιχείων.</p>
                      <p className={styles.hint}>Στη δημόσια σελίδα θα εμφανιστούν η εμπορική ονομασία, η κατηγορία, η διεύθυνση ({invitation.address}) και το τηλέφωνο ({invitation.phone}). Έλεγξέ τα πριν αποδεχθείς. Δεν ενεργοποιούνται πωλήσεις ή πληρωμές.</p>
                      <p className={styles.hint}><strong>Εγκεκριμένοι όροι δωρεάν καταχώρισης · έκδοση {agreement?.plan.templateVersion}.</strong> Διάβασε τη συμφωνία που αφορά αυτή ακριβώς την επιχείρηση πριν αποδεχθείς.</p>
                      <p><Link className={styles.button + " " + styles.secondary} href={`/hubs/claim/${encodeURIComponent(id)}/agreement`} target="_blank">Προβολή πλήρους συμφωνίας CLAIM (PDF) ↗</Link></p>
                      <label className={styles.field}><span><input type="checkbox" name="termsConsent" required /> Έχω διαβάσει και αποδέχομαι τους εγκεκριμένους όρους του προγράμματος CLAIM, έκδοση {agreement?.plan.templateVersion}.</span></label>
                      <label className={styles.field}><span><input type="checkbox" name="publishConsent" required /> Συμφωνώ με τη δημοσίευση αυτών των επαγγελματικών στοιχείων στην καταχώριση CLAIM.</span></label>
                      <input type="hidden" name="templateSha256" value={agreement?.templateSha256 ?? ""} />
                      <input type="hidden" name="csrfToken" value={principal.csrfToken} />
                      <input type="hidden" name="claimId" value={id} />
                      <button className={styles.button} type="submit">Αποδέχομαι · Ενεργοποίηση CLAIM</button>
                    </form>}
        </section>
        <section className={styles.panel}>
          <h2>Τι περιλαμβάνει το δωρεάν CLAIM</h2>
          <p className={styles.details}>Επαληθευμένη παρουσία στο τοπικό HUB, βασική δημόσια σελίδα, κατηγορία, στοιχεία επικοινωνίας και δικαίωμα διόρθωσης προφίλ από το απλό Dashboard.</p>
          <p className={styles.hint}>€0 ένταξη · €0 συνδρομή · 0% προμήθεια · χωρίς marketplace checkout.</p>
        </section>
      </div>
    </section>
    <SiteFooter />
  </main>;
}
