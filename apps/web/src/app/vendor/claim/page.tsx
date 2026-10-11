import type { Metadata } from "next";
import Link from "next/link";
import { HubClaimProfileEditor } from "../../../components/HubClaimProfileEditor";
import { HubClaimMediaUpload } from "../../../components/HubClaimMediaUpload";
import { listHubClaimMedia, listOwnedHubClaimInquiries } from "../../../lib/hub-claim-runtime";
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
  const extra = await Promise.all(claims.map(async claim => ({
    id:claim.id,
    media:await listHubClaimMedia(claim.id),
    inquiries:await listOwnedHubClaimInquiries(claim.id,principal)
  })));
  const extraById=new Map(extra.map(x=>[x.id,x]));
  return <main>
    <SiteHeader compact />
    <section className="shell">
      <div className={styles.hero}>
        <div className={styles.kicker}>KONTA MOY · Skinny Vendor Dashboard</div>
        <h1 className={styles.title}>Το δωρεάν CLAIM σου.</h1>
        <p className={styles.lead}>Ενημέρωσε την παρουσία της επιχείρησής σου στο τοπικό HUB. Δεν απαιτείται συνδρομή και δεν υπάρχει πρόσβαση σε παραγγελίες, εισπράξεις ή κατάλογο προϊόντων.</p>
      </div>
      <nav className={styles.actions} aria-label="Ενότητες CLAIM"><a href="#claim-profile">Προφίλ</a><a href="#claim-media">Εικόνες</a><a href="#claim-inquiries">Μηνύματα</a></nav>
      {!claims.length ? <section className={styles.panel}><h2>Δεν υπάρχει ενεργή δωρεάν καταχώριση</h2><p>Μετά τον έλεγχο και την έγκριση της αίτησης CLAIM, άνοιξε τον σύνδεσμο επιβεβαίωσης που θα λάβεις στο επαληθευμένο email.</p><Link className={styles.button} href="/hubs/join">Προγράμματα HUB →</Link></section>
      : <>{claims.map(profile => <div key={profile.id}>
        <div className={styles.grid}>
          <div id="claim-profile"><HubClaimProfileEditor profile={profile} csrfToken={principal.csrfToken} onSave={saveClaim}/></div>
          <div id="claim-media"><HubClaimMediaUpload claimId={profile.id} csrfToken={principal.csrfToken} items={extraById.get(profile.id)?.media??[]}/></div>
        </div>
        <section id="claim-inquiries" className={styles.panel}>
          <h2>Αιτήματα πελατών · {extraById.get(profile.id)?.inquiries.length??0}</h2>
          <p className={styles.hint}>Μηνύματα μέσω της δημόσιας σελίδας σου. Απάντησε απευθείας στο email του ενδιαφερομένου. Δεν ενεργοποιούνται πωλήσεις ή παραγγελίες.</p>
          {(extraById.get(profile.id)?.inquiries??[]).length===0
            ? <p>Δεν έχεις ακόμη μηνύματα.</p>
            : (extraById.get(profile.id)?.inquiries??[]).map(inquiry=><article key={inquiry.id} className={styles.inquiry}>
                <strong>{inquiry.name}</strong><small>{new Date(inquiry.createdAt).toLocaleString("el-GR")}</small>
                <p>{inquiry.message}</p>
                <a href={"mailto:"+encodeURIComponent(inquiry.email)}>Απάντηση με email ↗</a>
              </article>)}
        </section>
      </div>)}</>}
      <div className={styles.footer}>Χρειάζεσαι διόρθωση επαληθευμένων στοιχείων ή αλλαγή εκπροσώπου; Επικοινώνησε με το info@kontamou.site για νέο έλεγχο.</div>
    </section>
    <SiteFooter />
  </main>;
}
