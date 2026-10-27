import Link from "next/link";
import s from "./community.module.css";
export function MaziCommunityNav(){
 return <nav aria-label="Πλοήγηση κοινότητας ΜΑΖΙ" className={s.nav}>
  <Link href="/dashboard">Dashboard</Link><Link href="/members">Συμμετοχή</Link>
  <Link href="/marketplace">Marketplace</Link>
  <Link href="/forum">Forum</Link>
  <Link href="/livechat">Livechat</Link><Link href="/inbox">Ιδιωτικά μηνύματα</Link><Link href="/services">250 Tokens</Link>
 </nav>;
}
