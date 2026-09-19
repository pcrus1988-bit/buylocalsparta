import type { Metadata } from "next";
import Link from "next/link";
import { ColorFinderExperience } from "../../components/ColorFinderExperience";
import { SiteFooter } from "../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./page.module.css";

export const revalidate = 300;

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/color-finder", {
    title: "Color Finder",
    description: "Διάλεξε χρώμα ή πάρε το από φωτογραφία και βρες διαθέσιμα βερνίκια με τουλάχιστον 49% χρωματική αντιστοιχία στο ΚΟΝΤΑ ΜΟΥ."
  });
}

export default function ColorFinderPage() {
  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/" className={styles.back}>← KONTA MOY</Link>
        <div className={styles.wordmark}>
          <strong>COLOR FINDER</strong>
          <span>by KONTA MOY</span>
        </div>
        <Link href="/shop?category=beauty" className={styles.shopLink}>BEAUTY SHOP ↗</Link>
      </div>

      <ColorFinderExperience products={[]} />

      <section className={styles.manifesto} aria-label="Σχετικά με το Color Finder">
        <span>01</span>
        <div>
          <p>THE IDEA</p>
          <h2>Color first.<br />Product second.</h2>
        </div>
        <p>
          Αντί να ψάχνεις εκατοντάδες ονόματα αποχρώσεων, ξεκινάς από το χρώμα που θέλεις — χειροκίνητα ή από φωτογραφία.
          Το εργαλείο συγκρίνει την απόχρωση με τα χρωματικά προφίλ των διαθέσιμων προϊόντων, κρατά μόνο ουσιαστικές αντιστοιχίες και σου δείχνει πρώτα τις πιο κοντινές.
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
