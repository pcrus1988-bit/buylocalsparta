import type { Metadata } from "next";
import Link from "next/link";
import { listOwnedHubClaimMedia } from "../../../lib/hub-claim-media-runtime";
import { HubClaimWorkspace } from "../../../components/HubClaimWorkspace";
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
    {!claims.length
      ? <section className="shell"><div className={styles.hero}>
          <h1 className={styles.title}>Το δωρεάν CLAIM σου.</h1>
          <p className={styles.lead}>Δεν υπάρχει ακόμη ενεργή δωρεάν καταχώριση.</p>
        </div><section className={styles.panel}>
          <h2>Δεν υπάρχει ενεργή δωρεάν καταχώριση</h2>
          <p>Μετά τον έλεγχο και την έγκριση της αίτησης CLAIM, άνοιξε τον σύνδεσμο επιβεβαίωσης που θα λάβεις στο επαληθευμένο email.</p>
          <Link className={styles.button} href="/hubs/join">Προγράμματα HUB →</Link>
        </section></section>
      : <HubClaimWorkspace profiles={claims} csrfToken={principal.csrfToken} onSave={saveClaim} media={media} />}
    <SiteFooter />
  </main>;
}
