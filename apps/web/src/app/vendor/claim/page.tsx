import type { Metadata } from "next";
import Link from "next/link";
import { listOwnedHubClaimMedia } from "../../../lib/hub-claim-media-runtime";
import { HubClaimProfileEditor } from "../../../components/HubClaimProfileEditor";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "../../../components/SiteHeader";
import { SiteFooter } from "../../../components/SiteFooter";
import { getAccountSession, requireAccountSession } from "../../../lib/account-session";
import { assertCustomerCsrf } from "../../../lib/customer-state-runtime";
import { listOwnedHubClaims, updateOwnedHubClaim } from "../../../lib/hub-claim-runtime";
import styles from "../../hubs/claim/claim.module.css";

export const metadata: Metadata = { title: "CLAIM Dashboard · KONTA MOY", robots: { index: false, follow: false } };

async function saveClaim(formData: FormData) {
  "use server";
  const principal = await requireAccountSession();
  assertCustomerCsrf(principal, String(formData.get("csrfToken") ?? ""));
  const id = String(formData.get("claimId") ?? "");
  await updateOwnedHubClaim(id, principal, formData);
  revalidatePath("/vendor/claim");
}

export default async function ClaimVendorDashboard() {
  const principal = await getAccountSession();
  if (!principal || !principal.roles.includes("customer")) redirect("/login?next=%2Fvendor%2Fclaim");
  const claims = await listOwnedHubClaims(principal);
  const media = claims.length ? await listOwnedHubClaimMedia(principal) : [];
  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · Skinny Vendor Dashboard</div>
        <h1 className={styles.title}>Το δωρεάν CLAIM σου.</h1>
        <p className={styles.lead}>Ενημέρωσε την παρουσία της επιχείρησής σου στο τοπικό HUB. Δεν απαιτείται συνδρομή και δεν υπάρχει πρόσβαση σε παραγγελίες, εισπράξεις ή κατάλογο προϊόντων.</p>
      </div>
      {!claims.length ? <section className={styles.panel}><h2>Δεν υπάρχει ενεργή δωρεάν καταχώριση</h2><p>Μετά τον έλεγχο και την έγκριση της αίτησης CLAIM, άνοιξε τον σύνδεσμο επιβεβαίωσης που θα λάβεις στο επαληθευμένο email.</p><Link className={styles.button} href="/hubs/join">Προγράμματα HUB →</Link></section>
      : <div className={styles.grid}>{claims.map(profile =>
        <HubClaimProfileEditor key={profile.id} profile={profile} csrfToken={principal.csrfToken} onSave={saveClaim} media={media.filter(item => item.claimId === profile.id)} />
      )}</div>}
      <div className={styles.footer}>Χρειάζεσαι διόρθωση επαληθευμένων στοιχείων ή αλλαγή εκπροσώπου; Επικοινώνησε με το info@kontamou.site για νέο έλεγχο.</div>
    </section>
    <SiteFooter />
  </main>;
}
