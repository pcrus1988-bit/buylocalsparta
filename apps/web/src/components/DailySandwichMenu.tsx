import Link from "next/link";
import styles from "./DailySandwichMenu.module.css";

export function DailySandwichMenu() {
  return <details className={styles.menu}>
    <summary aria-label="Άνοιγμα μενού Daily"><span /><span /><span /></summary>
    <nav>
      <div><strong>KONTA MOY Daily</strong><small>Γρήγορες λειτουργίες καταστήματος</small></div>
      <Link href="/daily">Αρχική Daily</Link>
      <Link href="/daily/quickadd"><b>▣</b><span><strong>Item Research / Stock</strong><small>Scan · έλεγχος · προσθήκη · edit</small></span></Link>
      <Link href="/daily/orders">Παραγγελίες</Link>
      <Link href="/daily/ask-local">Ask Local</Link>
      <Link href="/daily/notifications">Ειδοποιήσεις</Link>
    </nav>
  </details>;
}
