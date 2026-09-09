import type { PublicVendorDirectoryEntry } from "../lib/public-vendor-directory";
import styles from "./HomeLocalMarketScene.module.css";

function vendorWithStoryMedia(vendors: readonly PublicVendorDirectoryEntry[]): PublicVendorDirectoryEntry | undefined {
  return vendors.find((vendor) => vendor.directoryStatus === "partner" && Boolean(vendor.story?.mediaUrl));
}

export function HomeLocalMarketScene({ vendors }: { vendors: readonly PublicVendorDirectoryEntry[] }) {
  const vendor = vendorWithStoryMedia(vendors);
  const mediaUrl = vendor?.story?.mediaUrl;

  return <div className={styles.scene} aria-label={mediaUrl && vendor ? `Η τοπική αγορά της Σπάρτης · ${vendor.name}` : "Η τοπική αγορά της Σπάρτης"}>
    <div className={styles.frame}>
      {mediaUrl && vendor ? <>
        <img className={styles.photo} src={mediaUrl} alt={vendor.story?.title || `Το κατάστημα ${vendor.name} στη Σπάρτη`} width={900} height={1100} loading="eager" fetchPriority="high" />
        <span className={styles.photoShade} aria-hidden="true" />
        <div className={styles.caption}>
          <small>Σπάρτη · πραγματική τοπική παρουσία</small>
          <strong>{vendor.name}</strong>
          <span>{vendor.story?.excerpt ?? vendor.profileShortDescription ?? "Ένα από τα τοπικά καταστήματα που συμμετέχουν στην αγορά ΚΟΝΤΑ ΜΟΥ."}</span>
        </div>
      </> : <>
        <span className={styles.fallbackLight} aria-hidden="true" />
        <span className={styles.fallbackShelfOne} aria-hidden="true" />
        <span className={styles.fallbackShelfTwo} aria-hidden="true" />
        <span className={styles.fallbackPerson} aria-hidden="true" />
        <div className={styles.caption}><small>Σπάρτη · τοπική αγορά</small><strong>Η πόλη πίσω από τα προϊόντα.</strong></div>
      </>}
    </div>
    <div className={styles.note}>{mediaUrl ? "Αληθινές βιτρίνες και τοπικές ιστορίες, όταν υπάρχει εγκεκριμένο υλικό από το κατάστημα." : "Άνθρωποι, προϊόντα και πραγματικά καταστήματα — στο ίδιο μέρος."}</div>
  </div>;
}
