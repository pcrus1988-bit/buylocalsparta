import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import styles from "../../../components/VendorTrial.module.css";
import { storefrontPreviewProducts, storefrontPreviewWorkspace, type VendorStorefrontPreviewProduct } from "../../../lib/vendor-storefront-settings";
import { getVendorSession } from "../../../lib/vendor-session";
import { getVendorTrialSnapshot } from "../../../lib/vendor-trial-runtime";

export const metadata: Metadata = { title: "Ιδιωτική προεπισκόπηση καταστήματος", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function VendorPreviewPage() {
  const trial = await getVendorTrialSnapshot();
  const principal = trial ? undefined : await getVendorSession();
  const vendorId = trial?.vendorId ?? principal?.vendorId;
  if (!vendorId) redirect("/vendor/login");

  const [storefront, products] = await Promise.all([
    storefrontPreviewWorkspace(vendorId),
    storefrontPreviewProducts(vendorId, 12)
  ]);
  const settings = storefront.settings;
  const knownProductCount = trial?.productCount ?? products.length;

  return <main className={styles.trialShell}>
    <div className={styles.previewToolbar}>
      <div>
        <span className={styles.demoPill}>PRIVATE PREVIEW</span>
        <h1 style={{margin:"8px 0 0"}}>{storefront.vendorName}</h1>
      </div>
      <div className={styles.heroActions}>
        <Link className={styles.heroAction} href={trial?.active ? "/vendor/trial" : trial ? "/vendor/trial-expired" : "/vendor/storefront"}>← Επιστροφή</Link>
      </div>
    </div>
    <div className={styles.previewPanel}>
      <div className={styles.previewFrame} style={{ "--accent": settings.accentColor } as CSSProperties}>
        <section className={`${styles.storeHero} ${settings.heroStyle === "centered" ? styles.storeHeroCentered : settings.heroStyle === "editorial" ? styles.storeHeroEditorial : ""}`}>
          <div className={styles.storeEyebrow}>ΚΟΝΤΑ ΜΟΥ · {storefront.location?.locality ?? "Τοπικό κατάστημα"}</div>
          <h3>{settings.heroTitle || storefront.vendorName}</h3>
          <p>{storefront.shortDescription || "Το κατάστημα ετοιμάζει την παρουσίασή του στο ΚΟΝΤΑ ΜΟΥ."}</p>
        </section>

        <div className={styles.storeBody}>
          <div className={styles.chips}>
            <span className={styles.chip}>Παραλαβή από κατάστημα</span>
            <span className={styles.chip}>Τοπική συμβουλή</span>
            {knownProductCount > 0 && <span className={styles.chip}>{knownProductCount.toLocaleString("el-GR")} προϊόντα στο workspace</span>}
            {trial && <span className={styles.demoPill}>TRIAL · ΔΕΝ ΕΙΝΑΙ ΔΗΜΟΣΙΟ</span>}
          </div>

          <section className={styles.previewCollection} aria-labelledby="vendor-preview-products">
            <div className={styles.previewCollectionHead}>
              <div>
                <div className={styles.storeEyebrow}>THE COLLECTION</div>
                <h4 id="vendor-preview-products">{settings.showFeatured ? "Προτεινόμενα προϊόντα" : "Η συλλογή του καταστήματος"}</h4>
                <p>Η ιδιωτική προεπισκόπηση χρησιμοποιεί τα πραγματικά προϊόντα του vendor workspace. Πρόχειρα ή κρυφά προϊόντα παραμένουν ιδιωτικά και επισημαίνονται ανάλογα.</p>
              </div>
              {products.length > 0 && <span>{products.length} στην προεπισκόπηση</span>}
            </div>

            {products.length > 0 ? <div className={styles.productGrid}>
              {products.map((product, index) => <PreviewProductCard product={product} index={index} key={product.id} />)}
            </div> : <div className={styles.previewEmpty}>
              <strong>Δεν υπάρχουν ακόμη προϊόντα στο vendor workspace.</strong>
              <p>Πρόσθεσε προϊόντα από τον Κατάλογο και θα εμφανιστούν εδώ αυτόματα — χωρίς να γίνουν δημόσια όσο βρίσκεσαι σε Trial.</p>
              <Link className={styles.heroAction} href="/vendor/catalog">Πρόσθεσε προϊόντα →</Link>
            </div>}
          </section>

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

function PreviewProductCard({ product, index }: { product: VendorStorefrontPreviewProduct; index: number }) {
  const mediaSrc = product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : undefined;
  return <article className={styles.productCard}>
    <div className={styles.productImage}>
      {mediaSrc ? <Image
        src={mediaSrc}
        alt={product.mediaAlt ?? product.title}
        fill
        sizes="(max-width: 640px) 45vw, (max-width: 1050px) 30vw, 260px"
        preload={index === 0}
        className={styles.previewProductImage}
      /> : <span aria-hidden="true">◇</span>}
    </div>
    <div className={styles.productMeta}>
      <small>{[product.category, product.brand].filter(Boolean).join(" · ")}</small>
      <strong>{product.title}</strong>
      <span className={styles.productPrice}>{product.price}</span>
      <small className={styles.productState}>{previewState(product)}</small>
    </div>
  </article>;
}

function previewState(product: VendorStorefrontPreviewProduct): string {
  if (product.source === "submission") {
    if (product.status === "draft") return "Ιδιωτικό πρόχειρο · δεν έχει δημοσιευτεί";
    if (product.status === "submitted" || product.status === "needs_review") return "Σε έλεγχο ΚΟΝΤΑ ΜΟΥ · ιδιωτικό";
    return "Υπό προετοιμασία · ιδιωτικό";
  }
  if (!product.visible) return product.status === "approved" ? "Κρυφό από το δημόσιο storefront" : `Ιδιωτική προεπισκόπηση · ${product.status}`;
  if (product.availableToSell <= 0) return "Δημόσιο προϊόν · χωρίς διαθέσιμο stock";
  return "Διαθέσιμο στο storefront";
}
