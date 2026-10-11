import type { Metadata } from "next";
import Link from "next/link";
import { HubClaimWorkspace } from "../../../components/HubClaimWorkspace";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SiteHeader } from "../../../components/SiteHeader";
import { SiteFooter } from "../../../components/SiteFooter";
import { getAccountSession, requireAccountSession } from "../../../lib/account-session";
import { assertCustomerCsrf } from "../../../lib/customer-state-runtime";
import { listOwnedHubClaims, listOwnedHubClaimMedia, updateOwnedHubClaim, uploadOwnedHubClaimMedia } from "../../../lib/hub-claim-runtime";
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

async function uploadClaimPhoto(formData: FormData) {
  "use server";
  const principal = await requireAccountSession();
  assertCustomerCsrf(principal, String(formData.get("csrfToken") ?? ""));
  await uploadOwnedHubClaimMedia(String(formData.get("claimId") ?? ""), principal, formData);
  revalidatePath("/vendor/claim");
}

export default async function ClaimVendorDashboard() {
  const principal = await getAccountSession();
  if (!principal || !principal.roles.includes("customer")) redirect("/login?next=%2Fvendor%2Fclaim");
  const claims = await listOwnedHubClaims(principal);
  const media = claims.length ? await listOwnedHubClaimMedia(principal) : [];
  return <main>
    <SiteHeader compact />
    {claims.length
      ? <HubClaimWorkspace profiles={claims} csrfToken={principal.csrfToken} onSave={saveClaim} onUpload={uploadClaimPhoto} media={media} />
      : <section className="shell"><div className={styles.hero}><div className={styles.kicker}>KONTA MOY · CLAIM</div><h1 className={styles.title}>Το δωρεάν CLAIM σου.</h1></div><div className={styles.panel}><h2>Δεν υπάρχει ενεργή δωρεάν καταχώριση</h2><p>Μετά την έγκριση της αίτησης CLAIM άνοιξε τον σύνδεσμο επιβεβαίωσης στο επαληθευμένο email.</p><Link className={styles.button} href="/hubs/join">Προγράμματα HUB →</Link></div></section>}
    <SiteFooter />
  </main>;
}
