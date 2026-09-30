import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import styles from "../../../components/VendorTrial.module.css";
import { storefrontPreviewWorkspace } from "../../../lib/vendor-storefront-settings";
import { getVendorSession } from "../../../lib/vendor-session";
import { getVendorTrialSnapshot } from "../../../lib/vendor-trial-runtime";

export const metadata: Metadata = { title: "Ιδιωτική προεπισκόπηση καταστήματος", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VendorPreviewPage() {
  const trial = await getVendorTrialSnapshot();
  const principal = trial ? undefined : await getVendorSession();
  const vendorId = trial?.vendorId ?? principal?.vendorId;
  if (!vendorId) redirect("/vendor/login");
  const storefront = await storefrontPreviewWorkspace(vendorId);
  const settings = storefront.settings;

  return <main className={styles.trialShell}>
    <div className={styles.previewToolbar}>
      <div><span className={styles.demoPill}>PRIVATE PREVIEW</span><h1 style={{margin:"8px 0 0"}}>{storefront.vendorName}</h1></div>
      <div className={styles.heroActions}>
        <Link className={styles.heroAction} href={trial?.active ? "/vendor/trial" : trial ? "/vendor/trial-expired" : "/vendor/storefront"}>← Επιστροφή</Link>
      </div>
    </div>
    <div className={styles.previewPanel}>
      <div className={styles.previewFrame} style={{ "--accent": settings.accentColor } as React.CSSProperties}>
        <section className={`${styles.storeHero} ${settings.heroStyle === "centered" ? styles.storeHeroCentered : settings.heroStyle === "editorial" ? styles.storeHeroEditorial : ""}`}>
          <div className={styles.storeEyebrow}>ΚΟΝΤΑ ΜΟΥ · {storefront.location?.locality ?? "Τοπικό κατάστημα"}</div>
          <h3>{settings.heroTitle || storefront.vendorName}</h3>
          <p>{storefront.shortDescription || "Το κατάστημα ετοιμάζει την παρουσίασή του στο ΚΟΝΤΑ ΜΟΥ."}</p>
        </section>
        <div className={styles.storeBody}>
          <div className={styles.chips}><span className={styles.chip}>Παραλαβή από κατάστημα</span><span className={styles.chip}>Τοπική συμβουλή</span>{trial && <span className={styles.demoPill}>TRIAL · ΔΕΝ ΕΙΝΑΙ ΔΗΜΟΣΙΟ</span>}</div>
          {settings.showFeatured && <><h4>Προτεινόμενα προϊόντα</h4><div className={styles.productGrid}>{[1,2,3].map((item)=><div className={styles.productCard} key={item}><div className={styles.productImage}>◇</div><div className={styles.productMeta}><strong>{trial?.productCount ? `Προϊόν ${item}` : "Προϊόν καταστήματος"}</strong><small>Preview layout</small></div></div>)}</div></>}
          {settings.showFlashSale && <div className={styles.sectionBlock}><h4>⚡ Flash Sale</h4><p>Χώρος για γρήγορες προσφορές και gamified discovery.</p></div>}
          {settings.showBazaar && <div className={styles.sectionBlock}><h4>♻ BAZAAR</h4><p>Δεύτερη ζωή σε επιστροφές και επιλεγμένα προϊόντα.</p></div>}
          {settings.showAbout && <div className={styles.sectionBlock}><h4>Σχετικά με το κατάστημα</h4><p>{storefront.story || "Η ιστορία του καταστήματος θα εμφανίζεται εδώ."}</p></div>}
          {settings.showLocation && storefront.location && <div className={styles.sectionBlock}><h4>Βρες μας</h4><p>{storefront.location.addressLine1}, {storefront.location.postcode} {storefront.location.locality}</p></div>}
          {settings.showContact && <div className={styles.sectionBlock}><h4>Ρώτησε το κατάστημα</h4><p>Τοπική συμβουλή πριν την αγορά, μέσα από το ΚΟΝΤΑ ΜΟΥ.</p></div>}
        </div>
      </div>
    </div>
  </main>;
}
